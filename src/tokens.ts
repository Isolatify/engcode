import type { SourceFile, Span } from "./diagnostics.js";

export type TokenKind =
  | "word"
  | "number"
  | "text"
  | "newline"
  | "colon"
  | "comma"
  | "lparen"
  | "rparen"
  | "property"
  | "hex"
  | "eof";

export interface Token {
  kind: TokenKind;
  /** Original spelling from the source, or a canonical spelling for punctuation. */
  text: string;
  /** Lower-cased text, used for case-insensitive keyword matching. */
  lower: string;
  /** Numeric value for number tokens, string value for text tokens. */
  value?: number | string;
  file: SourceFile;
  line: number;
  column: number;
  length: number;
  span: Span;
}

export function tokenText(token: Token): string {
  switch (token.kind) {
    case "newline":
      return "the end of the line";
    case "eof":
      return "the end of the file";
    case "text":
      return JSON.stringify(token.text);
    case "colon":
      return '":"';
    case "comma":
      return '","';
    case "lparen":
      return '"("';
    case "rparen":
      return '")"';
    case "property":
      return "'s";
    default:
      return `"${token.text}"`;
  }
}
