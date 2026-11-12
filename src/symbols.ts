import * as path from "node:path";
import type { Program } from "./ast.js";
import { matchNameAt, prescanNames, type NameTable } from "./names.js";
import type { Token } from "./tokens.js";

/**
 * Symbol index for the editor.
 *
 * The compiler resolves names flatly across every file in the program, so this
 * module mirrors that model instead of inventing a scoped one:
 *
 * - **definitions** always come from a token scan that mirrors `prescanNames`
 *   (`mirrorDeclarations`), which keeps working even when the file does not
 *   parse;
 * - **references** come from the AST when `analyze()` produced a program
 *   (`astReferences`), because the parser verified every occurrence;
 * - when there is no program the same positions are recovered with a guarded
 *   token state machine (`degradedReferences`) that skips keywords, built-ins
 *   and block syntax so a half-typed file still resolves what it can.
 *
 * Both paths emit the same span for the same name, so `mergeOccurrences` can
 * drop the reference half of a declaration site such as `set score to 0`.
 */

export type OccurrenceKind = "definition" | "reference";

export interface Occurrence {
  name: string;
  kind: OccurrenceKind;
  /** Absolute path of the owning file. */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  /** Length in characters, always covering the full name. */
  length: number;
}

export interface SymbolFile {
  /** Absolute path of the file. */
  path: string;
  tokens: Token[];
}

export interface BuildOptions {
  /** The merged program from `analyze()`, when every file parsed. */
  program?: Program;
  /** The shared name table from `analyze()`, when it is available. */
  names?: NameTable;
}

// --------------------------------------------------------------- word helpers

function isWord(token: Token | undefined, word: string): boolean {
  return token !== undefined && token.kind === "word" && token.lower === word;
}

function splitLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.kind === "newline") {
      if (current.length > 0) lines.push(current);
      current = [];
    } else if (token.kind === "eof") {
      if (current.length > 0) lines.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Finds a word at the top level (not inside parentheses). */
function findTopLevelWord(tokens: Token[], word: string, from = 0, last = false): number {
  let depth = 0;
  let found = -1;
  for (let i = from; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind === "lparen") depth += 1;
    else if (token.kind === "rparen") depth = Math.max(0, depth - 1);
    else if (depth === 0 && isWord(token, word)) {
      found = i;
      if (!last) return i;
    }
  }
  return found;
}

function firstProperty(tokens: Token[], start: number, end: number): number {
  for (let i = start; i < end; i += 1) {
    if (tokens[i]!.kind === "property") return i;
    if (tokens[i]!.kind !== "word") return i;
  }
  return end;
}

function splitOnSeparators(tokens: Token[], start: number, end: number): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (let i = start; i < end; i += 1) {
    const token = tokens[i]!;
    if (token.kind === "lparen") depth += 1;
    if (token.kind === "rparen") depth = Math.max(0, depth - 1);
    if (depth === 0 && (token.kind === "comma" || isWord(token, "and"))) {
      if (current.length > 0) parts.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

// ------------------------------------------------------------------ vocabulary

/**
 * Mirrors `CLAUSE_WORDS` in parser.ts. These glue words are never names on
 * their own; they separate one operand from the next.
 */
const CLAUSE_WORDS = new Set([
  "and",
  "or",
  "plus",
  "minus",
  "times",
  "divided",
  "remainder",
  "is",
  "contains",
  "starts",
  "ends",
  "to",
  "from",
  "with",
  "as",
  "in",
  "of",
  "by",
  "at",
  "on",
  "called",
  "showing",
  "level",
  "default",
  "that",
  "otherwise",
  "end",
  "seconds",
  "descending",
]);

/** Words that only finish an operator already under way. */
const OPERATOR_WORDS = new Set(["than", "least", "most", "not", "empty"]);

/** Mirrors `DRAW_SHAPES` in parser.ts. */
const DRAW_SHAPES = new Set(["rectangle", "circle", "text", "line", "image"]);

/** Mirrors `UNARY_BUILTINS` in parser.ts: always written `word of ...`. */
const UNARY_BUILTINS = new Set([
  "uppercase",
  "lowercase",
  "trim",
  "length",
  "round",
  "floor",
  "ceiling",
  "text",
  "sine",
  "cosine",
  "tangent",
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
]);

/** Mirrors `UI_ELEMENTS` in parser.ts. */
const UI_ELEMENTS = new Set([
  "section",
  "row",
  "column",
  "grid",
  "card",
  "heading",
  "paragraph",
  "text",
  "button",
  "input",
  "text area",
  "checkbox",
  "switch",
  "dropdown",
  "radio choice",
  "slider",
  "image",
  "video",
  "audio",
  "list",
  "table",
  "menu",
  "navigation bar",
  "footer",
  "link",
  "form",
  "popup",
  "tabs",
  "tab",
  "icon",
  "divider",
  "canvas",
]);

const UI_ELEMENT_PHRASES = [...UI_ELEMENTS]
  .map((phrase) => ({ phrase, words: phrase.split(" ") }))
  .sort((a, b) => b.words.length - a.words.length);

/** Statement heads that are always a statement when they open a line. */
const UNCONDITIONAL_HEADS = new Set([
  "say",
  "ask",
  "set",
  "change",
  "add",
  "remove",
  "if",
  "repeat",
  "for",
  "count",
  "while",
  "stop",
  "skip",
  "define",
  "give",
  "try",
  "use",
  "keep",
  "call",
  "sort",
  "reverse",
  "shuffle",
  "read",
  "write",
  "append",
  "delete",
  "list",
  "wait",
  "save",
  "load",
  "get",
  "send",
  "app",
  "style",
  "theme",
  "when",
  "every",
  "end",
  "otherwise",
]);

/**
 * Heads that are a statement only when the following words say so; otherwise
 * they fall through to `parseCallOrMethod` and may be an ordinary call.
 */
const CONDITIONAL_HEADS = new Set([
  "show",
  "hide",
  "clear",
  "go",
  "open",
  "close",
  "play",
  "draw",
  "page",
]);

/** Words each head swallows before the real operands start. */
const FIXED_PREFIX: Record<string, string[]> = {
  for: ["each"],
  count: ["from"],
  keep: ["track", "of"],
  stop: ["the", "loop"],
  skip: ["to", "the", "next", "one"],
  give: ["back"],
  read: ["file"],
  list: ["files", "in"],
  get: ["data", "from"],
  send: ["data"],
  delete: ["file", "the", "device"],
  use: ["theme"],
  clear: ["canvas"],
  go: ["to", "page"],
  open: ["popup"],
  close: ["popup"],
  play: ["sound"],
};

/** Multi-word phrases the parser consumes before any name can match. */
const PHRASE_SKIPS: string[][] = [
  ["and", "save", "it", "as"],
  ["save", "it", "as"],
  ["define", "a", "kind", "of", "thing", "called"],
  ["absolute", "value", "of"],
  ["square", "root", "of"],
  ["random", "number", "from"],
  ["random", "item", "of"],
  ["random", "decimal"],
  ["data", "from", "json"],
  ["number", "from"],
  ["last", "item", "of"],
  ["first", "item", "of"],
  ["json", "of"],
  ["value", "of"],
  ["format", "of"],
  ["position", "of"],
  ["minimum", "of"],
  ["maximum", "of"],
  ["power", "of"],
  ["a", "list", "of"],
  ["a", "table", "with"],
  ["an", "empty", "list"],
  ["an", "empty", "table"],
  ["a", "function"],
  ["the", "error"],
];

const PHRASE_SKIPS_SORTED = [...PHRASE_SKIPS].sort((a, b) => b.length - a.length);

// ------------------------------------------------------------------- spans

function spanFromTokens(
  line: Token[],
  start: number,
  end: number,
): { line: number; column: number; length: number } | null {
  let last = -1;
  for (let i = start; i < end && i < line.length; i += 1) {
    if (line[i]!.kind !== "word") break;
    last = i;
  }
  if (last < start) return null;
  const first = line[start]!;
  const lastToken = line[last]!;
  return {
    line: first.line,
    column: first.column,
    length: lastToken.column + lastToken.length - first.column,
  };
}

/**
 * Position of `name` starting at `token`, covering as many source characters as
 * the name actually occupies. Names keep their original spelling, so their
 * words appear verbatim in the line; when they do not (the `a new X`
 * constructor points at the article) the line is searched forward instead.
 */
function resolveNameSpan(token: Token, name: string): { line: number; column: number; length: number } {
  const text = token.file.lines[token.line - 1];
  const words = name.split(/\s+/);
  if (text === undefined) {
    return { line: token.line, column: token.column, length: name.length };
  }

  const from = token.column - 1;
  if (from >= 0 && from < text.length && text.startsWith(words[0]!, from)) {
    let end = from + words[0]!.length;
    for (let i = 1; i < words.length; i += 1) {
      let j = end;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j += 1;
      if (!text.startsWith(words[i]!, j)) break;
      end = j + words[i]!.length;
    }
    return { line: token.line, column: from + 1, length: end - from };
  }

  const found = findNameInLine(text, from, words);
  if (found) return { line: token.line, column: found.start + 1, length: found.end - found.start };
  return { line: token.line, column: token.column, length: Math.max(token.length, name.length) };
}

function findNameInLine(text: string, from: number, words: string[]): { start: number; end: number } | null {
  const first = words[0]!;
  for (let k = Math.max(0, from); k + first.length <= text.length; k += 1) {
    if (!text.startsWith(first, k)) continue;
    if (k > 0 && isIdentChar(text[k - 1]!)) continue;
    let end = k + first.length;
    if (end < text.length && isIdentChar(text[end]!)) continue;
    let ok = true;
    for (let i = 1; i < words.length; i += 1) {
      let j = end;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j += 1;
      if (!text.startsWith(words[i]!, j)) {
        ok = false;
        break;
      }
      end = j + words[i]!.length;
    }
    if (ok) return { start: k, end };
  }
  return null;
}

function isIdentChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

// ------------------------------------------------------------------ definitions

/**
 * Token-scan mirror of `prescanNames` that records where each declared name
 * sits. The two must agree on the set of names — `symbols.test.ts` asserts it —
 * so every branch below is deliberately shaped like its counterpart.
 */
export function mirrorDeclarations(tokens: Token[], file: string): Occurrence[] {
  const out: Occurrence[] = [];
  const target = path.resolve(file);

  const emitWords = (name: string, line: Token[], start: number, end: number): void => {
    if (!name) return;
    const span = spanFromTokens(line, start, end);
    if (!span) return;
    out.push({ name, kind: "definition", file: target, ...span });
  };

  const emitTextValue = (name: string, token: Token): void => {
    out.push({
      name,
      kind: "definition",
      file: target,
      line: token.line,
      column: token.column + 1,
      length: Math.max(0, token.length - 2),
    });
  };

  const collect = (line: Token[], start: number, end: number): { name: string; start: number; end: number } => {
    const words: string[] = [];
    let i = start;
    for (; i < end; i += 1) {
      const token = line[i]!;
      if (token.kind !== "word") break;
      words.push(token.text);
    }
    return { name: words.join(" "), start, end: i };
  };

  const emitParameters = (line: Token[], start: number, end: number): void => {
    for (const part of splitOnSeparators(line, start, end)) {
      if (part.length === 0) continue;
      const words: string[] = [];
      for (const token of part) {
        if (isWord(token, "default")) break;
        if (token.kind !== "word") break;
        words.push(token.text);
      }
      const name = words.join(" ");
      if (!name) continue;
      const index = line.indexOf(part[0]!);
      if (index < 0) continue;
      emitWords(name, line, index, index + words.length);
    }
  };

  for (const line of splitLines(tokens)) {
    if (line.length === 0) continue;
    const first = line[0]!;

    // Anonymous functions declare their parameters with "with ... that".
    for (let i = 0; i < line.length; i += 1) {
      if (isWord(line[i], "function") && isWord(line[i + 1], "with")) {
        const thatIndex = findTopLevelWord(line, "that", i + 2);
        if (thatIndex >= 0) emitParameters(line, i + 2, thatIndex);
      }
    }

    if (first.kind !== "word") continue;

    switch (first.lower) {
      case "set":
      case "change": {
        const toIndex = findTopLevelWord(line, "to", 1);
        const end = toIndex < 0 ? line.length : toIndex;
        const baseEnd = firstProperty(line, 1, end);
        const collected = collect(line, 1, baseEnd);
        emitWords(collected.name, line, collected.start, collected.end);
        break;
      }

      case "add":
      case "remove": {
        const delimiter = first.lower === "add" ? "to" : "from";
        const index = findTopLevelWord(line, delimiter, 1, true);
        if (index >= 0) {
          const baseEnd = firstProperty(line, index + 1, line.length);
          const collected = collect(line, index + 1, baseEnd);
          emitWords(collected.name, line, collected.start, collected.end);
        }
        break;
      }

      case "keep": {
        if (isWord(line[1], "track") && isWord(line[2], "of")) {
          const asIndex = findTopLevelWord(line, "as", 3);
          const end = asIndex < 0 ? line.length : asIndex;
          const collected = collect(line, 3, end);
          emitWords(collected.name, line, collected.start, collected.end);
        }
        break;
      }

      case "for": {
        if (isWord(line[1], "each")) {
          const inIndex = findTopLevelWord(line, "in", 2);
          const end = inIndex < 0 ? line.length : inIndex;
          const collected = collect(line, 2, end);
          emitWords(collected.name, line, collected.start, collected.end);
        }
        break;
      }

      case "count": {
        const asIndex = findTopLevelWord(line, "as", 1);
        if (asIndex >= 0) {
          const colonIndex = line.findIndex((token, i) => i > asIndex && token.kind === "colon");
          const end = colonIndex >= 0 ? colonIndex : line.length;
          const collected = collect(line, asIndex + 1, end);
          emitWords(collected.name, line, collected.start, collected.end);
        }
        break;
      }

      case "define": {
        const kindStart =
          isWord(line[1], "a") &&
          isWord(line[2], "kind") &&
          isWord(line[3], "of") &&
          isWord(line[4], "thing") &&
          isWord(line[5], "called");
        if (kindStart) {
          const colonIndex = line.findIndex((token) => token.kind === "colon");
          const end = colonIndex >= 0 ? colonIndex : line.length;
          const collected = collect(line, 6, end);
          emitWords(collected.name, line, collected.start, collected.end);
          break;
        }

        const withIndex = findTopLevelWord(line, "with", 1);
        const colonIndex = line.findIndex((token) => token.kind === "colon");
        const nameEnd = withIndex >= 0 ? withIndex : colonIndex >= 0 ? colonIndex : line.length;
        const collected = collect(line, 1, nameEnd);
        if (!collected.name) break;
        emitWords(collected.name, line, collected.start, collected.end);
        if (withIndex >= 0) {
          const paramsEnd = colonIndex >= 0 ? colonIndex : line.length;
          emitParameters(line, withIndex + 1, paramsEnd);
        }
        break;
      }

      case "it": {
        if (isWord(line[1], "has")) {
          for (const part of splitOnSeparators(line, 2, line.length)) {
            const key = part[0];
            if (key?.kind === "word") {
              const index = line.indexOf(key);
              emitWords(key.text, line, index, index + 1);
            } else if (key?.kind === "text") {
              emitTextValue(String(key.value), key);
            }
          }
        } else if (isWord(line[1], "can")) {
          const withIndex = findTopLevelWord(line, "with", 2);
          const colonIndex = line.findIndex((token) => token.kind === "colon");
          if (withIndex >= 0) {
            const end = colonIndex >= 0 ? colonIndex : line.length;
            emitParameters(line, withIndex + 1, end);
          }
        }
        break;
      }

      case "ask":
      case "read":
      case "get":
      case "load":
      case "send": {
        const asIndex = findTopLevelWord(line, "as", 1, true);
        if (asIndex >= 0) {
          const collected = collect(line, asIndex + 1, line.length);
          emitWords(collected.name, line, collected.start, collected.end);
        }
        break;
      }

      case "list": {
        if (isWord(line[1], "files")) {
          const asIndex = findTopLevelWord(line, "as", 2, true);
          if (asIndex >= 0) {
            const collected = collect(line, asIndex + 1, line.length);
            emitWords(collected.name, line, collected.start, collected.end);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return out;
}

// ------------------------------------------------------------------ references

const REFERENCE_KINDS = new Set(["variable", "call", "call-stmt", "function-ref"]);

/**
 * Walks the merged program and records every name the parser resolved to an
 * occurrence. Declaration-only names (`define`, `keep track of`, parameters …)
 * live in string fields that are never descended into, so they stay the
 * responsibility of `mirrorDeclarations`.
 */
export function astReferences(program: Program): Occurrence[] {
  const out: Occurrence[] = [];
  const files = new Map<string, string>();
  walk(program, out, files);
  return out;
}

function walk(value: unknown, out: Occurrence[], files: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, files);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const node = value as Record<string, unknown>;
  const kind = typeof node.kind === "string" ? node.kind : undefined;

  if (kind === "new") {
    pushReference(out, node.kindName, node.token, files);
  } else if (kind === "method-stmt") {
    pushReference(out, node.object, node.token, files);
  } else if (kind !== undefined && REFERENCE_KINDS.has(kind)) {
    pushReference(out, node.name, node.token, files);
  }

  for (const key of Object.keys(node)) {
    if (key === "token") continue;
    walk(node[key], out, files);
  }
}

function pushReference(out: Occurrence[], name: unknown, token: unknown, files: Map<string, string>): void {
  if (typeof name !== "string" || name.length === 0) return;
  if (token === null || typeof token !== "object") return;
  const candidate = token as Token;
  if (typeof candidate.line !== "number" || typeof candidate.column !== "number") return;
  if (candidate.file === undefined) return;

  const raw = candidate.file.path;
  let file = files.get(raw);
  if (file === undefined) {
    file = path.resolve(raw);
    files.set(raw, file);
  }

  const span = resolveNameSpan(candidate, name);
  out.push({ name, kind: "reference", file, ...span });
}

// --------------------------------------------------------------- degraded mode

function isConditionalHead(line: Token[]): boolean {
  const head = line[0]!.lower;
  const next = line[1];
  switch (head) {
    case "show":
    case "hide":
      return next?.kind === "text";
    case "clear":
      return next?.kind === "text" || isWord(next, "canvas");
    case "go":
      return isWord(next, "to") && isWord(line[2], "page");
    case "open":
    case "close":
      return isWord(next, "popup");
    case "play":
      return isWord(next, "sound");
    case "draw":
      return next?.kind === "word" && DRAW_SHAPES.has(next.lower);
    case "page":
      return next?.kind === "text";
    default:
      return false;
  }
}

function skipHeadAndPrefix(line: Token[], prefix: string[]): number {
  let i = 1;
  for (const word of prefix) {
    if (isWord(line[i], word)) i += 1;
    else break;
  }
  return i;
}

function skipUiHead(line: Token[]): number {
  for (const { words } of UI_ELEMENT_PHRASES) {
    let ok = true;
    for (let k = 0; k < words.length; k += 1) {
      if (!isWord(line[k], words[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return words.length;
  }
  return 1;
}

/**
 * Recover references from a file the parser rejected. The state machine mirrors
 * how `parsePrimary` orders its attempts — keyword labels and phrases first,
 * then built-ins, then declared names — so a word is only ever recorded where
 * the parser would have resolved it to a name.
 */
export function degradedReferences(tokens: Token[], names: NameTable, file: string): Occurrence[] {
  const out: Occurrence[] = [];
  const target = path.resolve(file);
  const lines = splitLines(tokens);
  const hasApp = lines.some((line) => line[0]?.kind === "word" && line[0]!.lower === "app");
  let styleDepth = 0;

  const emitMatch = (name: string, line: Token[], start: number, count: number): void => {
    const span = spanFromTokens(line, start, start + count);
    if (!span) return;
    out.push({ name, kind: "reference", file: target, ...span });
  };

  for (const line of lines) {
    if (line.length === 0) continue;

    // Inside a style/theme block every line declares a screen property rather
    // than a name; only `end` (or a stray statement) leaves the block.
    if (styleDepth > 0) {
      const head = line[0]!;
      if (head.kind === "word" && head.lower === "end") {
        styleDepth -= 1;
        continue;
      }
      if (head.kind === "word" && head.lower === "when") {
        styleDepth += 1;
        continue;
      }
      if (head.kind === "word" && UNCONDITIONAL_HEADS.has(head.lower)) styleDepth = 0;
      else continue;
    }

    const first = line[0]!;
    if (first.kind !== "word") continue;
    const head = first.lower;

    // Line-start guards: these lines carry strings and block syntax only.
    if (head === "end") continue;
    if (head === "when" || head === "every") continue;
    if (head === "use") continue; // parseUse targets are file paths, never refs
    if (head === "style" || head === "theme") {
      styleDepth = 1;
      continue;
    }
    if (head === "it" && isWord(line[1], "has")) continue; // field names are strings

    let i = 0;
    let mode: "operand" | "operator" = "operand";
    let inDraw = false;
    let seenOn = false;
    let depth = 0;
    let entryMode: "key" | "value" | undefined;
    let itemIndexAt = -1;
    let skipExists = false;

    if (head === "otherwise") {
      i = isWord(line[1], "if") ? 2 : 1;
    } else if (head === "if" && isWord(line[1], "it") && isWord(line[2], "fails")) {
      i = 3;
    } else if (head === "draw" && isConditionalHead(line)) {
      i = 2;
      inDraw = true;
    } else if (
      (head === "add" || head === "remove") &&
      findTopLevelWord(line, head === "add" ? "to" : "from", 1, true) < 0
    ) {
      // No top-level delimiter: `add 2 and 3` is a call statement.
      i = 0;
    } else if (CONDITIONAL_HEADS.has(head) && isConditionalHead(line)) {
      i = skipHeadAndPrefix(line, FIXED_PREFIX[head] ?? []);
    } else if (UNCONDITIONAL_HEADS.has(head)) {
      i = skipHeadAndPrefix(line, FIXED_PREFIX[head] ?? []);
    } else if (head === "it" && isWord(line[1], "can")) {
      i = 3; // it, can, and exactly one method-name token
    } else if (hasApp && UI_ELEMENTS.has(head)) {
      i = skipUiHead(line);
    }

    // A line that opens with a name mirrors `parseCallOrMethod`: only a
    // declared name is ever recorded, and the word after it is a method
    // name (syntax), never a reference.
    if (i === 0) {
      const headMatch = matchNameAt(names, line, 0);
      if (headMatch) {
        emitMatch(headMatch.name, line, 0, headMatch.count);
        i = headMatch.count;
        if (names.functions.has(headMatch.name)) {
          mode = startsExpression(line[i]) ? "operand" : "operator";
        } else {
          const afterName = line[i];
          if (afterName !== undefined && afterName.kind === "word" && !CLAUSE_WORDS.has(afterName.lower)) {
            i += 1; // the method word is syntax, never a reference
            mode = startsExpression(line[i]) ? "operand" : "operator";
          } else {
            mode = "operator"; // the parser reports "nothing to do with" here
          }
        }
      } else {
        i = 1;
        mode = startsExpression(line[1]) ? "operand" : "operator";
      }
    }

    let afterProperty = false;

    while (i < line.length) {
      const token = line[i]!;

      // 1. Non-word tokens: punctuation drives the mode, never a name.
      if (token.kind !== "word") {
        if (i === itemIndexAt) itemIndexAt = -1;
        if (token.kind === "property") {
          afterProperty = true;
        } else if (token.kind === "text" && entryMode === "key") {
          // A quoted table key: `a new Dog with "name" "Rex"`.
          entryMode = "value";
          mode = "operator";
        } else if (token.kind === "number" || token.kind === "text" || token.kind === "hex") {
          mode = "operator";
        } else if (token.kind === "lparen") {
          depth += 1;
          mode = "operand";
        } else if (token.kind === "rparen") {
          depth = Math.max(0, depth - 1);
          mode = "operator";
        } else if (token.kind === "comma") {
          mode = "operand";
          if (depth === 0 && entryMode === "value") entryMode = "key";
        }
        i += 1;
        continue;
      }

      // 2. `ball's speed` — everything after `'s` is a property key, not a name.
      if (afterProperty) {
        afterProperty = false;
        mode = "operator";
        i += 1;
        continue;
      }

      const lower = token.lower;
      const previous = i > 0 ? line[i - 1] : undefined;

      // 3. A draw statement ends its name scanning at the colour clause, but
      //    only once the required `on <id>` has appeared: in
      //    `draw text replace "a" with "b" in name on "c"` the first `in`
      //    belongs to `replace`.
      if (inDraw) {
        if (lower === "on") seenOn = true;
        if (seenOn && lower === "in") break;
      }

      // 4. `file "x" exists` — the trailing `exists` belongs to the built-in.
      if (skipExists && lower === "exists") {
        skipExists = false;
        mode = "operator";
        i += 1;
        continue;
      }

      // 5. Table keys in `a new X with …` are syntax, never references.
      if (entryMode === "key") {
        entryMode = "value";
        mode = "operand";
        i += 1;
        continue;
      }

      // 6. Operator position: glue words separate operands.
      if (mode === "operator") {
        if (CLAUSE_WORDS.has(lower)) {
          mode = "operand";
          i += 1;
          continue;
        }
        if (OPERATOR_WORDS.has(lower)) {
          i += 1;
          continue;
        }
        mode = "operand";
        continue;
      }

      // 7. `item <index> of <list>` — the parser takes a bare declared name
      //    as the index before any built-in phrase can claim it.
      if (i === itemIndexAt) {
        itemIndexAt = -1;
        const bare = matchNameAt(names, line, i);
        if (bare && names.variables.has(bare.name) && line[i + bare.count]?.lower === "of") {
          emitMatch(bare.name, line, i, bare.count);
          i += bare.count;
          mode = "operator";
          continue;
        }
      }

      // 8. A `minus` at the start of an operand is the parser's unary minus.
      if (lower === "minus") {
        i += 1;
        continue;
      }

      // 9. Draw statements spell their coordinates out: `from x 0 and y 5`.
      if (
        inDraw &&
        ((lower === "x" && previous !== undefined && ["at", "from", "to"].includes(previous.lower)) ||
          (lower === "y" && isWord(previous, "and")) ||
          (lower === "width" && isWord(previous, "with")) ||
          (lower === "height" && isWord(previous, "and")) ||
          (lower === "size" && isWord(previous, "with")))
      ) {
        i += 1;
        continue;
      }

      // 10. Phrases the parser consumes before an expression ever starts.
      const phrase = PHRASE_SKIPS_SORTED.find((candidate) => {
        if (i + candidate.length > line.length) return false;
        return candidate.every((word, offset) => isWord(line[i + offset], word));
      });
      if (phrase) {
        i += phrase.length;
        continue;
      }

      // 11. Built-ins win over declared names, exactly as `parsePrimary` does.
      const builtin = skipBuiltin(line, i);
      if (builtin.count > 0) {
        if (builtin.item) itemIndexAt = i + builtin.count;
        if (builtin.exists) skipExists = true;
        i += builtin.count;
        mode = "operator";
        continue;
      }

      // 12. Structural words inside file and device phrases.
      if (lower === "file" && isWord(previous, "to")) {
        i += 1;
        continue;
      }
      if (lower === "device" && isWord(previous, "the")) {
        i += 1;
        continue;
      }

      // 13. `round of …` style built-ins consume their phrase.
      if (UNARY_BUILTINS.has(lower) && isWord(line[i + 1], "of")) {
        i += 2;
        mode = "operator";
        continue;
      }

      // 14. The parser consults the name table before any word switch.
      const match = matchNameAt(names, line, i);
      if (match) {
        emitMatch(match.name, line, i, match.count);
        i += match.count;
        mode = names.functions.has(match.name) && startsExpression(line[i]) ? "operand" : "operator";
        continue;
      }

      // 15. `the function greet` — a function reference by name.
      if (lower === "the" && isWord(line[i + 1], "function")) {
        i += 2;
        const ref = matchNameAt(names, line, i);
        if (ref) {
          emitMatch(ref.name, line, i, ref.count);
          i += ref.count;
        } else if (line[i]?.kind === "word") {
          emitMatch(line[i]!.text, line, i, 1);
          i += 1;
        }
        mode = "operator";
        continue;
      }

      // 16. `a new Dog with name "Rex"` — the kind name runs until `with`.
      if ((lower === "a" || lower === "an") && isWord(line[i + 1], "new")) {
        i += 2;
        const start = i;
        while (i < line.length && line[i]!.kind === "word" && !isWord(line[i], "with")) i += 1;
        if (i > start) {
          emitMatch(
            line
              .slice(start, i)
              .map((word) => word.text)
              .join(" "),
            line,
            start,
            i - start,
          );
        }
        if (isWord(line[i], "with")) {
          entryMode = "key";
          i += 1;
        }
        mode = "operator";
        continue;
      }

      // 17. Nothing matched: the word is syntax (a literal, a keyword, or a
      //     word the parser would report as an unknown name) and the operand
      //     carries on.
      i += 1;
    }
  }

  return out;
}

/**
 * How far a built-in phrase reaches from the given index. `item` and `file`
 * carry extra state: `item` lets the next index position take a bare declared
 * name before any built-in can claim it, `file` remembers that its trailing
 * `exists` still has to be consumed.
 */
interface BuiltinSkip {
  count: number;
  item?: boolean;
  exists?: boolean;
}

/**
 * Words `tryParseBuiltin` accepts before it ever consults the name table.
 * Each entry keeps the parser's own guard so a declared name is never lost.
 */
function skipBuiltin(line: Token[], index: number): BuiltinSkip {
  const lower = line[index]!.lower;
  const next = line[index + 1];

  if (lower === "split" || lower === "join") {
    return isWord(next, "of") ? { count: 0 } : { count: 1 };
  }
  if (lower === "replace") return { count: 1 };
  if (lower === "item") {
    return isWord(next, "of") ? { count: 0 } : { count: 1, item: true };
  }
  if (lower === "key" && next?.kind === "text") {
    const pressed = isWord(line[index + 2], "is") && isWord(line[index + 3], "pressed");
    return { count: pressed ? 4 : 2 };
  }
  if (lower === "now" || lower === "today" || lower === "pi" || lower === "e") {
    return { count: 1 };
  }
  if (lower === "file") {
    if (!startsExpression(next)) return { count: 0 };
    const exists = line.some(
      (candidate, offset) => offset > index && candidate.kind === "word" && candidate.lower === "exists",
    );
    return exists ? { count: 1, exists: true } : { count: 0 };
  }
  return { count: 0 };
}

/**
 * Mirrors `canStartExpression` in parser.ts: can a value begin at this token?
 */
function startsExpression(token: Token | undefined): boolean {
  if (token === undefined) return false;
  if (token.kind === "number" || token.kind === "text" || token.kind === "lparen" || token.kind === "hex") {
    return true;
  }
  if (token.kind !== "word") return false;
  if (token.lower === "not" || token.lower === "minus") return true;
  if (CLAUSE_WORDS.has(token.lower)) return false;
  return true;
}

// ------------------------------------------------------------------ assembling

/**
 * Definitions for every file plus references from the program (or, when the
 * program did not parse, from the degraded scanner), collapsed so a
 * declaration site such as `set score to 0` reports one definition rather than
 * a definition and a reference sitting on the same spot.
 */
export function buildOccurrences(files: SymbolFile[], options: BuildOptions = {}): Occurrence[] {
  const parts: Occurrence[] = [];
  for (const file of files) parts.push(...mirrorDeclarations(file.tokens, file.path));

  if (options.program) {
    parts.push(...astReferences(options.program));
  } else {
    const names = options.names ?? prescanNames(files.flatMap((file) => file.tokens));
    for (const file of files) parts.push(...degradedReferences(file.tokens, names, file.path));
  }

  return mergeOccurrences(parts);
}

/**
 * Collapses duplicates. Two occurrences share a site when they agree on name,
 * file, line and column; a definition always wins over a reference, because the
 * reference is only the parser's view of the same declaration.
 */
export function mergeOccurrences(occurrences: Occurrence[]): Occurrence[] {
  const bySite = new Map<string, Occurrence>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.name} ${occurrence.file} ${occurrence.line} ${occurrence.column}`;
    const existing = bySite.get(key);
    if (existing === undefined) {
      bySite.set(key, occurrence);
      continue;
    }
    if (existing.kind === occurrence.kind) {
      if (occurrence.length > existing.length) bySite.set(key, occurrence);
      continue;
    }
    if (occurrence.kind === "definition") bySite.set(key, occurrence);
  }
  return [...bySite.values()].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.kind !== b.kind) return a.kind === "definition" ? -1 : 1;
    return b.length - a.length;
  });
}

/** The occurrence under a 1-based cursor position, innermost site first. */
export function findOccurrenceAt(
  occurrences: Occurrence[],
  file: string,
  line: number,
  column: number,
): Occurrence | undefined {
  const target = path.resolve(file);
  let best: Occurrence | undefined;
  for (const occurrence of occurrences) {
    if (occurrence.file !== target || occurrence.line !== line) continue;
    if (column < occurrence.column || column > occurrence.column + occurrence.length) continue;
    if (best === undefined || isBetterMatch(occurrence, best, column)) best = occurrence;
  }
  return best;
}

function isBetterMatch(candidate: Occurrence, current: Occurrence, column: number): boolean {
  const candidateStarts = candidate.column === column;
  const currentStarts = current.column === column;
  if (candidateStarts !== currentStarts) return candidateStarts;
  if (candidate.kind !== current.kind) return candidate.kind === "definition";
  return candidate.length < current.length;
}

/** Every site that uses `name`, definitions included. */
export function occurrencesNamed(occurrences: Occurrence[], name: string): Occurrence[] {
  const lowered = name.toLowerCase();
  return occurrences.filter((occurrence) => occurrence.name.toLowerCase() === lowered);
}
