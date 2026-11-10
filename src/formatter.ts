import * as fs from "node:fs";
import * as path from "node:path";
import { Lexer } from "./lexer.js";
import { ParseError, type Diagnostic } from "./diagnostics.js";

/** Keywords that begin a statement. Only the first word is lower-cased so
 *  case-sensitive names are never touched. */
const STATEMENT_WORDS = new Set([
  "say",
  "ask",
  "set",
  "change",
  "add",
  "remove",
  "if",
  "otherwise",
  "repeat",
  "for",
  "count",
  "while",
  "stop",
  "skip",
  "define",
  "give",
  "try",
  "when",
  "use",
  "keep",
  "state",
  "display",
  "show",
  "hide",
  "clear",
  "call",
  "sort",
  "reverse",
  "shuffle",
  "wait",
  "save",
  "load",
  "delete",
  "read",
  "write",
  "append",
  "list",
  "get",
  "send",
  "go",
  "popup",
  "play",
  "draw",
  "it",
  "end",
  "app",
  "page",
  "style",
  "theme",
  "every",
]);

const DECLARATION_WORDS = new Set(["define", "kind", "app", "theme", "style"]);

/** Formats one EngCode source string. The result is deterministic and
 *  idempotent: running the formatter twice changes nothing. */
export function formatSource(text: string): string {
  const input = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  let depth = 0;

  for (const raw of input) {
    const trimmed = raw.replace(/[ \t]+$/g, "").trim();

    if (trimmed.length === 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }

    const comment = isComment(trimmed);
    const closes = !comment && /^end\b/i.test(trimmed);
    if (closes) depth = Math.max(0, depth - 1);

    let content = comment ? normalizeComment(trimmed) : normalizeLine(trimmed);
    content = canonicalFirstWord(content, comment);

    const first = content.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (depth === 0 && DECLARATION_WORDS.has(first) && lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }

    lines.push("    ".repeat(depth) + content);

    if (!comment && opensBlock(content)) depth += 1;
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function isComment(line: string): boolean {
  return /^note\s*:/i.test(line);
}

function normalizeComment(comment: string): string {
  // Keep the words a learner wrote; only tidy the marker itself.
  return comment.replace(/^note\s*:/i, "note:");
}

function canonicalFirstWord(line: string, comment: boolean): string {
  if (comment) return line;
  return line.replace(/^([A-Za-z_][A-Za-z0-9_]*)/, (word) => {
    const lower = word.toLowerCase();
    return STATEMENT_WORDS.has(lower) ? lower : word;
  });
}

function opensBlock(line: string): boolean {
  let inText = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === "\\") {
      i += 1;
      continue;
    }
    if (character === '"') inText = !inText;
  }
  return !inText && line.endsWith(":");
}

/** Collapses runs of spaces and tidies punctuation without changing text
 *  literals or the words a learner chose. */
function normalizeLine(line: string): string {
  const parts: string[] = [];
  let plain = "";
  let index = 0;

  const flush = (): void => {
    if (plain.length === 0) return;
    parts.push(normalizePlain(plain));
    plain = "";
  };

  while (index < line.length) {
    const character = line[index]!;
    if (character !== '"') {
      plain += character;
      index += 1;
      continue;
    }

    flush();
    let text = '"';
    index += 1;
    while (index < line.length) {
      const next = line[index]!;
      if (next === "\\" && index + 1 < line.length) {
        text += next + line[index + 1]!;
        index += 2;
        continue;
      }
      text += next;
      index += 1;
      if (next === '"') break;
    }
    parts.push(text);
  }
  flush();

  return parts.join("").trim();
}

function normalizePlain(plain: string): string {
  return plain
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/,\s*/g, ", ")
    .replace(/\s+'([sS])\b/g, "'$1")
    .replace(/'([sS])\s+/g, "'$1 ");
}

export interface FormatResult {
  file: string;
  formatted: string;
  changed: boolean;
  error?: Diagnostic;
}

/** Formats one file, or returns the lexer error without writing anything. */
export function formatFile(file: string): FormatResult {
  const text = fs.readFileSync(file, "utf8");
  try {
    Lexer.lex(file, text);
  } catch (error) {
    if (error instanceof ParseError) {
      return { file, formatted: text, changed: false, error: error.diagnostic };
    }
    throw error;
  }
  const formatted = formatSource(text);
  return { file, formatted, changed: formatted !== text };
}

/** Expands files and folders into a sorted list of `.eng` files. */
export function collectEngFiles(target: string): string[] {
  const resolved = path.resolve(target);
  const stats = fs.statSync(resolved);
  if (stats.isFile()) return [resolved];

  const files: string[] = [];
  const walk = (folder: string): void => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".engcode") {
        continue;
      }
      const child = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".eng")) files.push(child);
    }
  };
  walk(resolved);
  return files.sort();
}
