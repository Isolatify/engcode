import type { Token } from "./tokens.js";

export interface FunctionInfo {
  name: string;
  paramCount: number;
  requiredCount: number;
}

export interface NameTable {
  /** Every declared name, sorted longest first so matching is greedy. */
  all: string[];
  words: Map<string, number>;
  variables: Set<string>;
  functions: Map<string, FunctionInfo>;
  kinds: Set<string>;
  /** True when the name came from a declaration in this file. */
  declared: Set<string>;
}

const HARD_DELIMITERS = new Set([
  "to",
  "from",
  "with",
  "as",
  "in",
  "and",
  "or",
  "called",
  "showing",
  "level",
  "default",
  "that",
]);

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

function collectName(tokens: Token[], start: number, end: number): string {
  const words: string[] = [];
  for (let i = start; i < end; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== "word") break;
    words.push(token.text);
  }
  return words.join(" ");
}

function addName(table: NameTable, name: string, kind: "variable" | "function" | "kind"): void {
  if (!name) return;
  table.declared.add(name);
  table.words.set(name, name.split(/\s+/).length);
  if (kind === "variable") table.variables.add(name);
  else if (kind === "kind") table.kinds.add(name);
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

function parseParameters(
  table: NameTable,
  tokens: Token[],
  start: number,
  end: number,
): { paramCount: number; requiredCount: number } {
  let paramCount = 0;
  let requiredCount = 0;
  const parts = splitOnSeparators(tokens, start, end);

  for (const part of parts) {
    if (part.length === 0) continue;
    const words: string[] = [];
    let hasDefault = false;
    for (const token of part) {
      if (isWord(token, "default")) {
        hasDefault = true;
        break;
      }
      if (token.kind !== "word") break;
      words.push(token.text);
    }
    const name = words.join(" ");
    if (!name) continue;
    paramCount += 1;
    if (!hasDefault) requiredCount += 1;
    addName(table, name, "variable");
  }

  return { paramCount, requiredCount };
}

/**
 * Scans the token stream before parsing so multi-word names can be matched
 * greedily. This deliberately over-collects rather than reserving words.
 */
export function prescanNames(tokens: Token[]): NameTable {
  const table: NameTable = {
    all: [],
    words: new Map(),
    variables: new Set(),
    functions: new Map(),
    kinds: new Set(),
    declared: new Set(),
  };

  for (const line of splitLines(tokens)) {
    if (line.length === 0) continue;
    const first = line[0]!;

    // Anonymous functions declare their parameters with "with ... that".
    for (let i = 0; i < line.length; i += 1) {
      if (isWord(line[i], "function") && isWord(line[i + 1], "with")) {
        const thatIndex = findTopLevelWord(line, "that", i + 2);
        if (thatIndex >= 0) parseParameters(table, line, i + 2, thatIndex);
      }
    }

    if (first.kind !== "word") continue;

    switch (first.lower) {
      case "set":
      case "change": {
        const toIndex = findTopLevelWord(line, "to", 1);
        const end = toIndex < 0 ? line.length : toIndex;
        const baseEnd = firstProperty(line, 1, end);
        addName(table, collectName(line, 1, baseEnd), "variable");
        if (toIndex >= 0) {
          // A declared property key on the left is not a variable.
          const targetTokens = line.slice(1, end);
          const propertyPosition = targetTokens.findIndex((token) => token.kind === "property");
          if (propertyPosition >= 0) {
            const propertyTokens = targetTokens.slice(propertyPosition + 1);
            const keyToken = propertyTokens[0];
            if (keyToken?.kind === "word") table.words.set(keyToken.text, 1);
          }
        }
        break;
      }

      case "add":
      case "remove": {
        const delimiter = first.lower === "add" ? "to" : "from";
        const index = findTopLevelWord(line, delimiter, 1, true);
        if (index >= 0) {
          const baseEnd = firstProperty(line, index + 1, line.length);
          addName(table, collectName(line, index + 1, baseEnd), "variable");
        }
        break;
      }

      case "keep": {
        if (isWord(line[1], "track") && isWord(line[2], "of")) {
          const asIndex = findTopLevelWord(line, "as", 3);
          const end = asIndex < 0 ? line.length : asIndex;
          addName(table, collectName(line, 3, end), "variable");
        }
        break;
      }

      case "for": {
        if (isWord(line[1], "each")) {
          const inIndex = findTopLevelWord(line, "in", 2);
          const end = inIndex < 0 ? line.length : inIndex;
          addName(table, collectName(line, 2, end), "variable");
        }
        break;
      }

      case "count": {
        const asIndex = findTopLevelWord(line, "as", 1);
        if (asIndex >= 0) {
          const colonIndex = line.findIndex((token, i) => i > asIndex && token.kind === "colon");
          const end = colonIndex >= 0 ? colonIndex : line.length;
          addName(table, collectName(line, asIndex + 1, end), "variable");
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
          addName(table, collectName(line, 6, end), "kind");
          break;
        }

        const withIndex = findTopLevelWord(line, "with", 1);
        const colonIndex = line.findIndex((token) => token.kind === "colon");
        const nameEnd = withIndex >= 0 ? withIndex : colonIndex >= 0 ? colonIndex : line.length;
        const name = collectName(line, 1, nameEnd);
        if (!name) break;
        addName(table, name, "function");
        let paramCount = 0;
        let requiredCount = 0;
        if (withIndex >= 0) {
          const paramsEnd = colonIndex >= 0 ? colonIndex : line.length;
          const info = parseParameters(table, line, withIndex + 1, paramsEnd);
          paramCount = info.paramCount;
          requiredCount = info.requiredCount;
        }
        table.functions.set(name, { name, paramCount, requiredCount });
        break;
      }

      case "it": {
        if (isWord(line[1], "has")) {
          const parts = splitOnSeparators(line, 2, line.length);
          for (const part of parts) {
            const key = part[0];
            if (key?.kind === "word") {
              table.words.set(key.text, 1);
              table.variables.add(key.text);
              table.declared.add(key.text);
            } else if (key?.kind === "text") {
              table.words.set(String(key.value), 1);
              table.variables.add(String(key.value));
              table.declared.add(String(key.value));
            }
          }
        } else if (isWord(line[1], "can")) {
          const withIndex = findTopLevelWord(line, "with", 2);
          const colonIndex = line.findIndex((token) => token.kind === "colon");
          if (withIndex >= 0) {
            const end = colonIndex >= 0 ? colonIndex : line.length;
            parseParameters(table, line, withIndex + 1, end);
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
          addName(table, collectName(line, asIndex + 1, line.length), "variable");
        }
        break;
      }

      case "list": {
        if (isWord(line[1], "files")) {
          const asIndex = findTopLevelWord(line, "as", 2, true);
          if (asIndex >= 0) {
            addName(table, collectName(line, asIndex + 1, line.length), "variable");
          }
        }
        break;
      }

      default:
        break;
    }
  }

  table.all = [...table.declared].sort((a, b) => {
    const wordDifference = (table.words.get(b) ?? 1) - (table.words.get(a) ?? 1);
    if (wordDifference !== 0) return wordDifference;
    const lengthDifference = b.length - a.length;
    if (lengthDifference !== 0) return lengthDifference;
    return a.localeCompare(b);
  });

  return table;
}

export function isHardDelimiter(word: string): boolean {
  return HARD_DELIMITERS.has(word.toLowerCase());
}

/** Matches the longest declared name at the given token index. */
export function matchNameAt(
  table: NameTable,
  tokens: Token[],
  index: number,
): { name: string; count: number } | null {
  for (const name of table.all) {
    const words = name.split(/\s+/);
    let matched = true;
    for (let i = 0; i < words.length; i += 1) {
      const token = tokens[index + i];
      if (!token || token.kind !== "word" || token.text !== words[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { name, count: words.length };
  }
  return null;
}
