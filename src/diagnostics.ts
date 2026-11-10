import type { Token } from "./tokens.js";

export interface SourceFile {
  /** Path used in messages. */
  path: string;
  /** Short file name used in the headline. */
  name: string;
  /** The full source text. */
  text: string;
  /** Source split into lines, without line endings. */
  lines: string[];
}

export interface Span {
  file: SourceFile;
  line: number;
  column: number;
  length: number;
}

export function makeSource(path: string, text: string): SourceFile {
  const name = path.replace(/^.*[\\/]/, "") || path;
  return {
    path,
    name,
    text,
    lines: text.split(/\r\n|\n|\r/),
  };
}

export function spanFromToken(token: Token): Span {
  return {
    file: token.file,
    line: token.line,
    column: token.column,
    length: Math.max(1, token.length),
  };
}

export class Diagnostic {
  constructor(
    public readonly message: string,
    public readonly span?: Span,
    public readonly suggestion?: string,
    public readonly hint?: string,
    /** Accessibility and lint notes are warnings; everything else is an error. */
    public readonly severity: "error" | "warning" = "error",
  ) {}
}

export class EngError extends Error {
  constructor(public readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "EngError";
  }
}

export class ParseError extends EngError {
  constructor(diagnostic: Diagnostic) {
    super(diagnostic);
    this.name = "ParseError";
  }
}

export class RuntimeError extends EngError {
  public readonly callTrail: string[] = [];

  constructor(diagnostic: Diagnostic) {
    super(diagnostic);
    this.name = "RuntimeError";
  }
}

/** Renders a friendly, line-oriented diagnostic. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const lines: string[] = [];
  const span = diagnostic.span;
  const headline = span ? `Oops — line ${span.line} of ${span.file.name}` : "Oops";
  lines.push(headline);

  if (span) {
    const sourceLine = span.file.lines[span.line - 1] ?? "";
    const lineNumber = String(span.line);
    const gutter = `${" ".repeat(Math.max(0, 3 - lineNumber.length))}${lineNumber} | `;
    const sourceForDisplay = sourceLine.replace(/\t/g, "    ");

    // Keep the caret aligned when the source line contains tabs.
    let visualColumn = 0;
    for (let i = 0; i < span.column - 1 && i < sourceLine.length; i += 1) {
      visualColumn += sourceLine[i] === "\t" ? 4 : 1;
    }
    const caretLength = Math.max(1, span.length);

    lines.push("");
    lines.push(gutter + sourceForDisplay);
    lines.push(" ".repeat(gutter.length + visualColumn) + "^".repeat(caretLength));
  }

  lines.push("");
  lines.push(diagnostic.message);

  if (diagnostic.hint) {
    lines.push("");
    lines.push(diagnostic.hint);
  }

  if (diagnostic.suggestion) {
    lines.push("");
    lines.push("Try this:");
    for (const suggestionLine of diagnostic.suggestion.split("\n")) {
      lines.push("  " + suggestionLine);
    }
  }

  return lines.join("\n");
}
