import * as fs from "node:fs";
import * as path from "node:path";
import type { Program, Statement } from "./ast.js";
import { Checker } from "./checker.js";
import {
  Diagnostic,
  ParseError,
  makeSource,
  spanFromToken,
  type SourceFile,
} from "./diagnostics.js";
import { Lexer } from "./lexer.js";
import { prescanNames, type NameTable } from "./names.js";
import { Parser } from "./parser.js";
import type { Token } from "./tokens.js";

export interface Analysis {
  source: SourceFile;
  tokens: Token[];
  names?: NameTable;
  program?: Program;
  diagnostics: Diagnostic[];
  /** Absolute paths of every file that took part in the program. */
  files?: string[];
}

export interface AnalyzeOptions {
  /** Files and imports must stay inside this folder. Defaults to the entry's folder. */
  root?: string;
  /** Set to false to skip `use "file.eng"` loading. */
  modules?: boolean;
  /** Tokens from earlier input, so a REPL remembers names declared before. */
  earlierTokens?: Token[];
  /** Allow app-only constructs such as `app`, `page`, `style`, and `when`. */
  allowApps?: boolean;
}

interface LoadedFile {
  path: string;
  source: SourceFile;
  tokens: Token[];
  imports: { target: string; token: Token }[];
}

/** Lexes, parses, and checks a source file. Never throws for user mistakes. */
export function analyze(filePath: string, text: string, options: AnalyzeOptions = {}): Analysis {
  const source = makeSource(filePath, text);
  let tokens: Token[];
  try {
    tokens = Lexer.lex(filePath, text);
  } catch (error) {
    if (error instanceof ParseError) {
      return { source, tokens: [], diagnostics: [error.diagnostic] };
    }
    throw error;
  }

  const entryPath = path.resolve(filePath);
  const root = path.resolve(options.root ?? path.dirname(entryPath));
  const modules = options.modules ?? true;

  const files = new Map<string, LoadedFile>();
  const diagnostics: Diagnostic[] = [];
  files.set(entryPath, { path: entryPath, source, tokens, imports: scanImports(tokens) });

  if (modules) {
    loadImports(entryPath, root, files, diagnostics, [entryPath]);
    if (diagnostics.length > 0) {
      return { source, tokens, diagnostics, files: [...files.keys()] };
    }
  }

  // Parse every file with one shared name table so imported helpers can be
  // called with the same English syntax as local functions.
  const allTokens: Token[] = [...(options.earlierTokens ?? [])];
  for (const file of files.values()) allTokens.push(...file.tokens);
  const names = prescanNames(allTokens);

  const programs = new Map<string, Program>();
  for (const file of files.values()) {
    try {
      programs.set(
        file.path,
        Parser.parse(file.tokens, names, { allowApps: options.allowApps ?? true }),
      );
    } catch (error) {
      if (error instanceof ParseError) {
        diagnostics.push(error.diagnostic);
      } else {
        throw error;
      }
    }
  }

  if (diagnostics.length > 0) {
    return { source, tokens, names, diagnostics, files: [...files.keys()] };
  }

  const merged = expandModules(entryPath, root, programs, diagnostics);
  if (diagnostics.length > 0) {
    return { source, tokens, names, diagnostics, files: [...files.keys()] };
  }

  const program: Program = { kind: "program", body: merged };
  const earlierNames = options.earlierTokens ? prescanNames(options.earlierTokens) : undefined;
  const checked = Checker.check(
    program,
    names,
    earlierNames ? [...earlierNames.variables] : [],
  );
  return {
    source,
    tokens,
    names,
    program,
    diagnostics: [...diagnostics, ...checked.diagnostics],
    files: [...files.keys()],
  };
}

/** App-only files are detected before parsing so `run` can give a clear next step. */
export function looksLikeApp(text: string): boolean {
  return /^\s*app(?:\s|"|:)/im.test(text);
}

// --------------------------------------------------------------------- modules

function scanImports(tokens: Token[]): { target: string; token: Token }[] {
  const imports: { target: string; token: Token }[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== "word" || token.lower !== "use") continue;
    const next = tokens[i + 1]!;
    if (next.kind !== "text") continue;
    imports.push({ target: String(next.value), token: next });
  }
  return imports;
}

function resolveImport(fromFile: string, target: string, _root: string): string {
  return path.resolve(path.dirname(fromFile), target);
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function loadImports(
  fromFile: string,
  root: string,
  files: Map<string, LoadedFile>,
  diagnostics: Diagnostic[],
  stack: string[],
): void {
  const file = files.get(fromFile);
  if (!file) return;

  for (const imported of file.imports) {
    const target = resolveImport(fromFile, imported.target, root);

    if (!isInside(root, target)) {
      diagnostics.push(
        new Diagnostic(
          `The import "${imported.target}" is outside the project folder.`,
          spanFromToken(imported.token),
          'Keep imported files inside the folder that holds your program.',
        ),
      );
      continue;
    }

    if (stack.includes(target)) {
      const chain = [...stack.slice(stack.indexOf(target)), target]
        .map((item) => path.basename(item))
        .join(" → ");
      diagnostics.push(
        new Diagnostic(
          `These files import each other in a loop: ${chain}.`,
          spanFromToken(imported.token),
          "Remove one of the imports so the chain has an end.",
        ),
      );
      continue;
    }

    if (files.has(target)) continue;

    let text: string;
    try {
      text = fs.readFileSync(target, "utf8");
    } catch {
      diagnostics.push(
        new Diagnostic(
          `I could not find the imported file "${imported.target}".`,
          spanFromToken(imported.token),
          'Check the spelling and the folder, then try again.',
        ),
      );
      continue;
    }

    let tokens: Token[];
    try {
      tokens = Lexer.lex(target, text);
    } catch (error) {
      if (error instanceof ParseError) {
        diagnostics.push(error.diagnostic);
        continue;
      }
      throw error;
    }

    files.set(target, {
      path: target,
      source: makeSource(target, text),
      tokens,
      imports: scanImports(tokens),
    });
    loadImports(target, root, files, diagnostics, [...stack, target]);
  }
}

function expandModules(
  entryPath: string,
  root: string,
  programs: Map<string, Program>,
  diagnostics: Diagnostic[],
): Statement[] {
  const included = new Set<string>();
  const namesSeen = new Map<string, string>();
  const stack: string[] = [];

  const emit = (filePath: string, via?: Token): Statement[] => {
    if (included.has(filePath)) return [];
    included.add(filePath);
    stack.push(filePath);

    const program = programs.get(filePath);
    if (!program) {
      stack.pop();
      return [];
    }

    for (const [name, token] of declaredNames(program)) {
      const owner = namesSeen.get(name);
      if (owner !== undefined && owner !== filePath) {
        diagnostics.push(
          new Diagnostic(
            `The name "${name}" is defined in both "${path.basename(owner)}" and "${path.basename(filePath)}".`,
            spanFromToken(via ?? token),
            "Give one of them a different name so both files can be used together.",
          ),
        );
      } else {
        namesSeen.set(name, filePath);
      }
    }

    const statements: Statement[] = [];
    for (const statement of program.body) {
      if (statement.kind !== "use" || !statement.isPath) {
        statements.push(statement);
        continue;
      }

      const target = resolveImport(filePath, statement.target, root);
      if (!isInside(root, target)) {
        diagnostics.push(
          new Diagnostic(
            `The import "${statement.target}" is outside the project folder.`,
            spanFromToken(statement.token),
            'Keep imported files inside the folder that holds your program.',
          ),
        );
        continue;
      }
      if (stack.includes(target)) {
        const chain = [...stack.slice(stack.indexOf(target)), target]
          .map((item) => path.basename(item))
          .join(" → ");
        diagnostics.push(
          new Diagnostic(
            `These files import each other in a loop: ${chain}.`,
            spanFromToken(statement.token),
            "Remove one of the imports so the chain has an end.",
          ),
        );
        continue;
      }
      statements.push(...emit(target, statement.token));
    }

    stack.pop();
    return statements;
  };

  return emit(entryPath);
}

function declaredNames(program: Program): Map<string, Token> {
  const names = new Map<string, Token>();
  const add = (name: string, token: Token) => {
    if (!names.has(name)) names.set(name, token);
  };

  for (const statement of program.body) {
    switch (statement.kind) {
      case "define":
      case "kind":
        add(statement.name, statement.token);
        break;
      case "set":
        if (statement.target.kind === "variable") add(statement.target.name, statement.token);
        break;
      case "state":
      case "ask":
      case "read-file":
      case "list-files":
      case "load-device":
      case "get-data":
      case "send-data":
        add(statement.name, statement.token);
        break;
    }
  }

  return names;
}
