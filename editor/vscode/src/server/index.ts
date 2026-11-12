/**
 * The EngCode language server.
 *
 * Everything runs in-process against the compiler in `engcode/src`: the same
 * `analyze()` that powers `engcode check`, the same `formatSource` as
 * `engcode format`, and the symbol index from `symbols.ts` for navigation and
 * rename. Nothing here re-implements language rules.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CodeAction,
  CodeActionKind,
  CompletionItem,
  CompletionItemKind,
  Diagnostic as LspDiagnostic,
  DiagnosticSeverity,
  DocumentLink,
  ErrorCodes,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  MarkupContent,
  MarkupKind,
  Position,
  ProposedFeatures,
  Range,
  ResponseError,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  WorkspaceEdit,
  createConnection,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { formatSource } from "../../../../src/formatter.js";
import { Lexer } from "../../../../src/lexer.js";
import { lintSource } from "../../../../src/lint.js";
import { prescanNames, type NameTable } from "../../../../src/names.js";
import { analyze, type Analysis } from "../../../../src/program.js";
import {
  buildOccurrences,
  findOccurrenceAt,
  occurrencesNamed,
  type Occurrence,
  type SymbolFile,
} from "../../../../src/symbols.js";
import type { Diagnostic as EngineDiagnostic } from "../../../../src/diagnostics.js";
import type { Token } from "../../../../src/tokens.js";
import { DOC_ENTRIES, docFor, type DocEntry, type DocKind } from "./docs.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ---------------------------------------------------------------- state

interface DocState {
  version: number;
  filePath: string;
  text: string;
  analysis: Analysis;
  names: NameTable;
  occurrences: Occurrence[];
}

const states = new Map<string, DocState>();
const timers = new Map<string, NodeJS.Timeout>();
/** Diagnostics this document last published for each URI, so a document only
 *  clears diagnostics it owns. */
const publishedBy = new Map<string, string>();
const untitledPaths = new Map<string, string>();
let untitledCounter = 0;
let checkOnType = true;

// ------------------------------------------------------------ uri helpers

function uriToPath(uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  let rest = uri.slice("file://".length);
  try {
    rest = decodeURIComponent(rest);
  } catch {
    // A malformed escape: use the raw remainder rather than failing.
  }
  if (/^\/[A-Za-z]:/.test(rest)) rest = rest.slice(1);
  return rest;
}

function pathToUri(filePath: string): string {
  let forward = filePath.replace(/\\/g, "/");
  if (!forward.startsWith("/")) forward = "/" + forward;
  const encoded = forward
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"))
    .join("/");
  return "file://" + encoded;
}

/** Absolute path used for analysis; untitled buffers get a stable temp path. */
function filePathFor(uri: string): string | undefined {
  const existing = uriToPath(uri);
  if (existing) return path.resolve(existing);
  let fake = untitledPaths.get(uri);
  if (!fake) {
    untitledCounter += 1;
    fake = path.join(os.tmpdir(), `untitled-${untitledCounter}.eng`);
    untitledPaths.set(uri, fake);
  }
  return fake;
}

function lexFile(filePath: string): Token[] {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    // Lexer.lex is the raw entry point; a file that does not lex contributes
    // no tokens to the index instead of taking the server down.
    return Lexer.lex(filePath, text);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------ conversion

function didYouMean(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  const match = /^Did you mean "([^"]+)"\?/.exec(hint);
  return match ? match[1] : undefined;
}

function toLspDiagnostic(diagnostic: EngineDiagnostic): LspDiagnostic {
  const span = diagnostic.span;
  const range = span
    ? Range.create(
        span.line - 1,
        span.column - 1,
        span.line - 1,
        span.column - 1 + Math.max(1, span.length),
      )
    : Range.create(0, 0, 0, 0);
  const message = diagnostic.hint
    ? `${diagnostic.message} ${diagnostic.hint}`
    : diagnostic.message;
  const suggestion = diagnostic.suggestion ?? didYouMean(diagnostic.hint);
  return {
    range,
    message,
    severity:
      diagnostic.severity === "warning"
        ? DiagnosticSeverity.Warning
        : DiagnosticSeverity.Error,
    source: "EngCode",
    ...(suggestion ? { data: { suggestion } } : {}),
  };
}

function rangeOfOccurrence(occurrence: Occurrence): Range {
  return Range.create(
    occurrence.line - 1,
    occurrence.column - 1,
    occurrence.line - 1,
    occurrence.column - 1 + Math.max(1, occurrence.length),
  );
}

// ------------------------------------------------------------ validation

function validate(doc: TextDocument): DocState | undefined {
  const uri = doc.uri;
  const filePath = filePathFor(uri);
  if (!filePath) return undefined;
  const text = doc.getText();

  let analysis: Analysis;
  try {
    analysis = analyze(filePath, text);
  } catch (error) {
    // `analyze` returns its problems as diagnostics; an escape here means the
    // compiler itself broke, so surface it without taking the server down.
    const message = error instanceof Error ? error.message : String(error);
    connection.sendDiagnostics({
      uri,
      diagnostics: [
        {
          range: Range.create(0, 0, 0, 0),
          message: `EngCode could not read this file. ${message}`,
          severity: DiagnosticSeverity.Error,
          source: "EngCode",
        },
      ],
    });
    return undefined;
  }

  // Build the symbol index over every file in the program: the entry from the
  // editor, imports from disk, exactly as `analyze` resolved them.
  const fileSet = new Set<string>();
  fileSet.add(filePath);
  for (const file of analysis.files ?? []) fileSet.add(path.resolve(file));

  const files: SymbolFile[] = [];
  const allTokens: Token[] = [];
  for (const file of fileSet) {
    const tokens = file === filePath ? analysis.tokens : lexFile(file);
    files.push({ path: file, tokens });
    allTokens.push(...tokens);
  }

  const names = analysis.names ?? prescanNames(allTokens);
  const occurrences = buildOccurrences(
    files,
    analysis.program ? { program: analysis.program } : { names },
  );

  // Publish diagnostics grouped by the file they point at. Files that are
  // open publish themselves, so this document never overwrites their lint.
  const grouped = new Map<string, LspDiagnostic[]>();
  const seen = new Set<string>();
  const push = (diagnostic: EngineDiagnostic): void => {
    const key = `${diagnostic.span?.line ?? 0}:${diagnostic.span?.column ?? 0}:${diagnostic.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    const target = path.resolve(diagnostic.span?.file.path ?? filePath);
    const targetUri = pathToUri(target);
    let list = grouped.get(targetUri);
    if (!list) {
      list = [];
      grouped.set(targetUri, list);
    }
    list.push(toLspDiagnostic(diagnostic));
  };
  for (const diagnostic of analysis.diagnostics) push(diagnostic);
  for (const diagnostic of lintSource(filePath, text)) push(diagnostic);

  const openUris = new Set(documents.all().map((other) => other.uri));
  for (const [targetUri, list] of grouped) {
    if (targetUri === uri) continue;
    if (openUris.has(targetUri)) continue; // its own document publishes it
    connection.sendDiagnostics({ uri: targetUri, diagnostics: list });
    publishedBy.set(targetUri, uri);
  }
  connection.sendDiagnostics({ uri, diagnostics: grouped.get(uri) ?? [] });
  publishedBy.set(uri, uri);
  for (const [targetUri, owner] of [...publishedBy]) {
    if (owner === uri && targetUri !== uri && !grouped.has(targetUri)) {
      connection.sendDiagnostics({ uri: targetUri, diagnostics: [] });
      publishedBy.delete(targetUri);
    }
  }

  const state: DocState = { version: doc.version, filePath, text, analysis, names, occurrences };
  states.set(uri, state);
  return state;
}

function getState(doc: TextDocument): DocState | undefined {
  const cached = states.get(doc.uri);
  if (cached && cached.version === doc.version) return cached;
  return validate(doc);
}

function scheduleValidate(doc: TextDocument): void {
  if (!checkOnType) return;
  const existing = timers.get(doc.uri);
  if (existing) clearTimeout(existing);
  timers.set(
    doc.uri,
    setTimeout(() => {
      timers.delete(doc.uri);
      const current = documents.get(doc.uri);
      if (current) validate(current);
    }, 300),
  );
}

// ------------------------------------------------------------ docs & symbols

function docMarkdown(entry: DocEntry): string {
  let markdown = `**${entry.signature}**\n\n${entry.summary}`;
  if (entry.example) markdown += `\n\n\`\`\`engcode\n${entry.example}\n\`\`\``;
  return markdown;
}

function completionKindFor(kind: DocKind): CompletionItemKind {
  switch (kind) {
    case "statement":
    case "control":
      return CompletionItemKind.Keyword;
    case "operator":
      return CompletionItemKind.Operator;
    case "builtin":
      return CompletionItemKind.Function;
    case "literal":
      return CompletionItemKind.Value;
    case "ui":
      return CompletionItemKind.Class;
    case "event":
      return CompletionItemKind.Event;
    case "style":
      return CompletionItemKind.Property;
  }
}

function completionSortPrefix(kind: DocKind): string {
  switch (kind) {
    case "statement":
    case "control":
      return "1";
    case "operator":
      return "2";
    case "builtin":
    case "literal":
      return "3";
    default:
      return "4";
  }
}

function symbolMarkdown(occurrence: Occurrence, state: DocState): string {
  const name = occurrence.name;
  const functionInfo = state.names.functions.get(name);
  const isKind = state.names.kinds.has(name);
  const isVariable = state.names.variables.has(name);
  const kindWord = functionInfo ? "function" : isKind ? "kind" : isVariable ? "variable" : "name";

  const sites = occurrencesNamed(state.occurrences, name);
  const definitions = sites.filter((site) => site.kind === "definition");
  const references = sites.filter((site) => site.kind === "reference");

  const facts: string[] = [kindWord];
  if (functionInfo) {
    facts.push(
      `${functionInfo.paramCount} ${functionInfo.paramCount === 1 ? "parameter" : "parameters"}`,
    );
  }
  if (definitions.length === 1 && definitions[0]) {
    const definition = definitions[0];
    const elsewhere = path.resolve(definition.file) !== state.filePath;
    facts.push(
      `defined at line ${definition.line}${elsewhere ? ` of ${path.basename(definition.file)}` : ""}`,
    );
  } else if (definitions.length > 1) {
    facts.push(`defined in ${definitions.length} places`);
  }
  if (references.length > 0) {
    facts.push(`${references.length} ${references.length === 1 ? "use" : "uses"}`);
  }

  return `\`\`\`engcode\n${name}\n\`\`\`\n${facts.join(" Â· ")}`;
}

/** The longest documented phrase containing the word under the cursor. */
function phraseAt(
  tokens: Token[],
  line: number,
  character: number,
): { entry: DocEntry; range: Range } | undefined {
  const words: { token: Token }[] = [];
  for (const token of tokens) {
    if (token.line === line && token.kind === "word") words.push({ token });
  }
  if (words.length === 0) return undefined;

  let cursorWord = -1;
  for (let i = 0; i < words.length; i += 1) {
    const token = words[i]!.token;
    const start = token.column - 1;
    if (character >= start && character < start + token.length) {
      cursorWord = i;
      break;
    }
  }
  if (cursorWord < 0) return undefined;

  const maxWords = 6;
  for (let length = Math.min(maxWords, words.length); length >= 1; length -= 1) {
    for (
      let start = Math.max(0, cursorWord - (length - 1));
      start <= cursorWord && start + length <= words.length;
      start += 1
    ) {
      const end = start + length - 1;
      if (cursorWord < start || cursorWord > end) continue;
      const phrase = words
        .slice(start, end + 1)
        .map((word) => word.token.text)
        .join(" ")
        .toLowerCase();
      const entry = docFor(phrase);
      if (entry) {
        const first = words[start]!.token;
        const last = words[end]!.token;
        return {
          entry,
          range: Range.create(
            first.line - 1,
            first.column - 1,
            last.line - 1,
            last.column - 1 + last.length,
          ),
        };
      }
    }
  }
  return undefined;
}

// ------------------------------------------------------------ handlers

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const init = params.initializationOptions as { checkOnType?: boolean } | undefined;
  if (init && typeof init.checkOnType === "boolean") checkOnType = init.checkOnType;
  return {
    capabilities: {
      textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental },
      hoverProvider: true,
      completionProvider: { triggerCharacters: [" "], resolveProvider: false },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      documentFormattingProvider: true,
      documentLinkProvider: { resolveProvider: false },
      codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
    },
    serverInfo: { name: "EngCode Language Server", version: "1.0.0" },
  };
});

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const state = getState(doc);
  if (!state) return null;

  const line = params.position.line + 1;
  const character = params.position.character;
  const occurrence = findOccurrenceAt(state.occurrences, state.filePath, line, character + 1);
  const phraseHit = phraseAt(state.analysis.tokens, line, character);

  const sections: string[] = [];
  let range: Range | undefined;
  if (occurrence) {
    sections.push(symbolMarkdown(occurrence, state));
    range = rangeOfOccurrence(occurrence);
  }
  if (phraseHit) {
    sections.push(docMarkdown(phraseHit.entry));
    range ??= phraseHit.range;
  }
  if (sections.length === 0) return null;

  const contents: MarkupContent = {
    kind: MarkupKind.Markdown,
    value: sections.join("\n\n"),
  };
  return { contents, range };
});

connection.onCompletion((params): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const state = getState(doc);
  if (!state) return [];

  const items: CompletionItem[] = [];
  for (const name of state.names.all) {
    const functionInfo = state.names.functions.get(name);
    const isKind = state.names.kinds.has(name);
    const kind = functionInfo
      ? CompletionItemKind.Function
      : isKind
        ? CompletionItemKind.Class
        : CompletionItemKind.Variable;
    const detail = functionInfo
      ? `function Â· ${functionInfo.paramCount} ${functionInfo.paramCount === 1 ? "parameter" : "parameters"}`
      : isKind
        ? "kind"
        : "variable";
    items.push({ label: name, kind, detail, sortText: `0${name}` });
  }
  for (const entry of DOC_ENTRIES) {
    items.push({
      label: entry.phrase,
      kind: completionKindFor(entry.kind),
      detail: entry.signature,
      documentation: { kind: MarkupKind.Markdown, value: docMarkdown(entry) },
      sortText: `${completionSortPrefix(entry.kind)}${entry.phrase}`,
    });
  }
  return items;
});

connection.onDefinition((params): Location[] | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const state = getState(doc);
  if (!state) return null;
  const occurrence = findOccurrenceAt(
    state.occurrences,
    state.filePath,
    params.position.line + 1,
    params.position.character + 1,
  );
  if (!occurrence) return null;
  const definitions = occurrencesNamed(state.occurrences, occurrence.name).filter(
    (site) => site.kind === "definition",
  );
  if (definitions.length === 0) return null;
  return definitions.map((definition) => ({
    uri: pathToUri(definition.file),
    range: rangeOfOccurrence(definition),
  }));
});

connection.onReferences((params): Location[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const state = getState(doc);
  if (!state) return [];
  const occurrence = findOccurrenceAt(
    state.occurrences,
    state.filePath,
    params.position.line + 1,
    params.position.character + 1,
  );
  if (!occurrence) return [];
  return occurrencesNamed(state.occurrences, occurrence.name)
    .filter((site) => params.context.includeDeclaration || site.kind === "reference")
    .map((site) => ({ uri: pathToUri(site.file), range: rangeOfOccurrence(site) }));
});

connection.onPrepareRename((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return new ResponseError<void>(ErrorCodes.InvalidParams, "Open an EngCode file first.");
  }
  const state = getState(doc);
  const occurrence = state
    ? findOccurrenceAt(
        state.occurrences,
        state.filePath,
        params.position.line + 1,
        params.position.character + 1,
      )
    : undefined;
  if (!occurrence) {
    return new ResponseError<void>(
      ErrorCodes.InvalidParams,
      "Put the cursor on a name to rename it.",
    );
  }
  return { range: rangeOfOccurrence(occurrence), placeholder: occurrence.name };
});

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*( [A-Za-z_][A-Za-z0-9_]*)*$/;

connection.onRenameRequest((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return new ResponseError<void>(ErrorCodes.InvalidParams, "Open an EngCode file first.");
  }
  const state = getState(doc);
  const occurrence = state
    ? findOccurrenceAt(
        state.occurrences,
        state.filePath,
        params.position.line + 1,
        params.position.character + 1,
      )
    : undefined;
  if (!occurrence || !state) {
    return new ResponseError<void>(
      ErrorCodes.InvalidParams,
      "Put the cursor on a name to rename it.",
    );
  }
  const newName = params.newName.trim();
  if (!NAME_PATTERN.test(newName)) {
    return new ResponseError<void>(
      ErrorCodes.InvalidParams,
      `"${params.newName}" is not a valid EngCode name. Use letters, digits and underscores; separate words with single spaces.`,
    );
  }

  const edit: WorkspaceEdit = { changes: {} };
  for (const site of occurrencesNamed(state.occurrences, occurrence.name)) {
    const siteUri = pathToUri(site.file);
    const list = edit.changes![siteUri] ?? (edit.changes![siteUri] = []);
    list.push(TextEdit.replace(rangeOfOccurrence(site), newName));
  }
  return edit;
});

connection.onDocumentFormatting((params): TextEdit[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  let formatted: string;
  try {
    formatted = formatSource(text);
  } catch {
    return [];
  }
  if (formatted === text) return [];
  const full = Range.create(
    Position.create(0, 0),
    doc.positionAt(text.length),
  );
  return [TextEdit.replace(full, formatted)];
});

connection.onDocumentLinks((params): DocumentLink[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const state = getState(doc);
  if (!state) return [];

  const links: DocumentLink[] = [];
  const tokens = state.analysis.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== "word" || token.lower !== "use") continue;
    for (let j = i + 1; j < Math.min(i + 4, tokens.length); j += 1) {
      const next = tokens[j]!;
      if (next.kind === "word") continue; // `use theme "x"` â€” skip the mode word
      if (next.kind === "text") {
        const target = String(next.value ?? "");
        if (target.length > 0) {
          const resolved = path.resolve(path.dirname(state.filePath), target);
          try {
            if (fs.statSync(resolved).isFile()) {
              links.push({
                range: Range.create(
                  next.line - 1,
                  next.column - 1,
                  next.line - 1,
                  next.column - 1 + next.length,
                ),
                target: pathToUri(resolved),
              });
            }
          } catch {
            // The import does not exist on disk yet: no link.
          }
        }
      }
      break;
    }
  }
  return links;
});

connection.onCodeAction((params): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const actions: CodeAction[] = [];
  for (const diagnostic of params.context.diagnostics) {
    const data = diagnostic.data as { suggestion?: string } | undefined;
    const suggestion = data?.suggestion;
    if (!suggestion) continue;
    if (doc.getText(diagnostic.range) === suggestion) continue;
    actions.push({
      title: `Replace with "${suggestion}"`,
      kind: CodeActionKind.QuickFix,
      isPreferred: true,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [params.textDocument.uri]: [TextEdit.replace(diagnostic.range, suggestion)],
        },
      },
    });
  }
  return actions;
});

/** Used by the "EngCode: Check File" command for its summary message. */
connection.onRequest("engcode/check", (params: { uri: string }) => {
  const empty = { count: 0, errors: 0, warnings: 0, failed: false };
  const doc = documents.get(params.uri);
  if (!doc) return { ...empty, failed: true };
  const state = validate(doc);
  if (!state) return { ...empty, failed: true };
  let errors = 0;
  let warnings = 0;
  for (const diagnostic of state.analysis.diagnostics) {
    if (diagnostic.severity === "warning") warnings += 1;
    else errors += 1;
  }
  warnings += lintSource(state.filePath, state.text).length;
  return { count: errors + warnings, errors, warnings, failed: false };
});

connection.onDidChangeConfiguration((params) => {
  const settings = params.settings as { engcode?: { checkOnType?: boolean } } | undefined;
  if (settings?.engcode && typeof settings.engcode.checkOnType === "boolean") {
    checkOnType = settings.engcode.checkOnType;
    for (const open of documents.all()) validate(open);
  }
});

// Imports changed on disk: re-check every open file against them.
connection.onDidChangeWatchedFiles(() => {
  for (const open of documents.all()) validate(open);
});

documents.onDidOpen((event) => validate(event.document));
documents.onDidChangeContent((event) => scheduleValidate(event.document));
documents.onDidSave((event) => {
  const pending = timers.get(event.document.uri);
  if (pending) clearTimeout(pending);
  timers.delete(event.document.uri);
  validate(event.document);
});
documents.onDidClose((event) => {
  const pending = timers.get(event.document.uri);
  if (pending) clearTimeout(pending);
  timers.delete(event.document.uri);
  states.delete(event.document.uri);
  untitledPaths.delete(event.document.uri);
});

documents.listen(connection);
connection.listen();
