import { Diagnostic, ParseError, makeSource } from "./diagnostics.js";
const KEYWORD_LIKE = /^[A-Za-z_]$/;
const WORD_PART = /^[A-Za-z0-9_]$/;
const HEX_DIGIT = /^[0-9A-Fa-f]$/;
export class Lexer {
    source;
    text;
    index = 0;
    line = 1;
    column = 1;
    tokens = [];
    constructor(path, text) {
        this.source = makeSource(path, text);
        this.text = text;
    }
    static lex(path, text) {
        return new Lexer(path, text).scan();
    }
    scan() {
        while (this.index < this.text.length) {
            const ch = this.text[this.index];
            if (ch === " " || ch === "\t") {
                this.index += 1;
                this.column += 1;
                continue;
            }
            if (ch === "\r" || ch === "\n") {
                this.scanNewline();
                continue;
            }
            if (ch === ":") {
                this.push("colon", ":", 1);
                continue;
            }
            if (ch === ",") {
                this.push("comma", ",", 1);
                continue;
            }
            if (ch === "(") {
                this.push("lparen", "(", 1);
                continue;
            }
            if (ch === ")") {
                this.push("rparen", ")", 1);
                continue;
            }
            if (ch === '"') {
                this.scanString();
                continue;
            }
            if (ch === "'") {
                this.scanProperty();
                continue;
            }
            if (ch === "#") {
                this.scanHex();
                continue;
            }
            if (this.isDigit(ch) || (ch === "-" && this.isDigit(this.text[this.index + 1] ?? ""))) {
                this.scanNumber();
                continue;
            }
            if (this.isLetter(ch)) {
                this.scanWord();
                continue;
            }
            this.scanUnknown(ch);
        }
        this.tokens.push({
            kind: "eof",
            text: "",
            lower: "",
            file: this.source,
            line: this.line,
            column: this.column,
            length: 0,
            span: this.spanAt(this.line, this.column, 0),
        });
        return this.tokens;
    }
    scanNewline() {
        const startLine = this.line;
        const startColumn = this.column;
        const startIndex = this.index;
        if (this.text[this.index] === "\r" && this.text[this.index + 1] === "\n") {
            this.index += 2;
        }
        else {
            this.index += 1;
        }
        this.line += 1;
        this.column = 1;
        this.tokens.push({
            kind: "newline",
            text: "\n",
            lower: "\n",
            file: this.source,
            line: startLine,
            column: startColumn,
            length: this.index - startIndex,
            span: this.spanAt(startLine, startColumn, this.index - startIndex),
        });
    }
    scanString() {
        const startLine = this.line;
        const startColumn = this.column;
        const startIndex = this.index;
        this.index += 1;
        this.column += 1;
        let value = "";
        while (this.index < this.text.length) {
            const ch = this.text[this.index];
            if (ch === '"') {
                this.index += 1;
                this.column += 1;
                this.tokens.push({
                    kind: "text",
                    text: value,
                    lower: value.toLowerCase(),
                    value,
                    file: this.source,
                    line: startLine,
                    column: startColumn,
                    length: this.index - startIndex,
                    span: this.spanAt(startLine, startColumn, this.index - startIndex),
                });
                return;
            }
            if (ch === "\r" || ch === "\n") {
                throw this.error("A text value cannot continue onto the next line. Add a closing quote.", startLine, startColumn, Math.max(1, this.index - startIndex), undefined, "If you need two lines of text, use two say statements.");
            }
            if (ch === "\\") {
                const escape = this.text[this.index + 1];
                const map = {
                    '"': '"',
                    "\\": "\\",
                    n: "\n",
                    t: "\t",
                };
                if (escape === undefined || map[escape] === undefined) {
                    throw this.error(`I don't understand the escape "\\${escape ?? ""}" inside text.`, this.line, this.column, 2, undefined, 'Use \\n for a new line, \\t for a tab, \\" for a quote, or \\\\ for a backslash.');
                }
                value += map[escape];
                this.index += 2;
                this.column += 2;
                continue;
            }
            value += ch;
            this.index += 1;
            this.column += 1;
        }
        throw this.error("This text value is missing its closing quote.", startLine, startColumn, Math.max(1, this.index - startIndex), undefined, 'Add a " at the end of the text.');
    }
    scanProperty() {
        const next = this.text[this.index + 1];
        if (next !== undefined && (next === "s" || next === "S")) {
            this.push("property", "'s", 2);
            return;
        }
        throw this.error("I don't understand the apostrophe here.", this.line, this.column, 1, undefined, "Write 's to mean 'belongs to', as in person's name.");
    }
    scanHex() {
        const startLine = this.line;
        const startColumn = this.column;
        const startIndex = this.index;
        let digits = "";
        let cursor = this.index + 1;
        while (cursor < this.text.length && HEX_DIGIT.test(this.text[cursor])) {
            digits += this.text[cursor];
            cursor += 1;
        }
        if (digits.length !== 3 && digits.length !== 6) {
            throw this.error("That does not look like a color.", startLine, startColumn, Math.max(1, cursor - startIndex), undefined, 'Colors look like #0f766e (six digits) or #fff (three digits).');
        }
        this.index = cursor;
        this.column += cursor - startIndex;
        this.tokens.push({
            kind: "hex",
            text: "#" + digits,
            lower: ("#" + digits).toLowerCase(),
            value: "#" + digits,
            file: this.source,
            line: startLine,
            column: startColumn,
            length: cursor - startIndex,
            span: this.spanAt(startLine, startColumn, cursor - startIndex),
        });
    }
    scanNumber() {
        const startLine = this.line;
        const startColumn = this.column;
        const startIndex = this.index;
        let raw = "";
        if (this.text[this.index] === "-") {
            raw += "-";
            this.index += 1;
            this.column += 1;
        }
        while (this.isDigit(this.text[this.index] ?? "")) {
            raw += this.text[this.index];
            this.index += 1;
            this.column += 1;
        }
        if (this.text[this.index] === "." && this.isDigit(this.text[this.index + 1] ?? "")) {
            raw += ".";
            this.index += 1;
            this.column += 1;
            while (this.isDigit(this.text[this.index] ?? "")) {
                raw += this.text[this.index];
                this.index += 1;
                this.column += 1;
            }
        }
        this.tokens.push({
            kind: "number",
            text: raw,
            lower: raw,
            value: Number(raw),
            file: this.source,
            line: startLine,
            column: startColumn,
            length: this.index - startIndex,
            span: this.spanAt(startLine, startColumn, this.index - startIndex),
        });
    }
    scanWord() {
        const startLine = this.line;
        const startColumn = this.column;
        const startIndex = this.index;
        while (this.index < this.text.length && WORD_PART.test(this.text[this.index])) {
            this.index += 1;
            this.column += 1;
        }
        const word = this.text.slice(startIndex, this.index);
        const lower = word.toLowerCase();
        // A comment starts with "note:" and runs to the end of the line.
        if (lower === "note") {
            let lookahead = this.index;
            while (this.text[lookahead] === " " || this.text[lookahead] === "\t") {
                lookahead += 1;
            }
            if (this.text[lookahead] === ":") {
                const commentStart = this.index;
                let end = lookahead + 1;
                while (end < this.text.length && this.text[end] !== "\r" && this.text[end] !== "\n") {
                    end += 1;
                }
                this.column += end - commentStart;
                this.index = end;
                return;
            }
        }
        this.tokens.push({
            kind: "word",
            text: word,
            lower,
            file: this.source,
            line: startLine,
            column: startColumn,
            length: this.index - startIndex,
            span: this.spanAt(startLine, startColumn, this.index - startIndex),
        });
    }
    scanUnknown(ch) {
        const startLine = this.line;
        const startColumn = this.column;
        if (ch === ";") {
            throw this.error("EngCode does not use semicolons.", startLine, startColumn, 1, undefined, "Put each statement on its own line.");
        }
        if (ch === "{" || ch === "}") {
            throw this.error("EngCode does not use curly braces.", startLine, startColumn, 1, undefined, "Start a block with ':' and finish it with 'end'.");
        }
        if (ch === "=") {
            throw this.error('I found "=", which EngCode does not use.', startLine, startColumn, 1, undefined, "Use 'is' to compare two values, or 'set name to value' to give a name a value.");
        }
        throw this.error(`I don't understand the character "${ch}".`, startLine, startColumn, 1, undefined, "EngCode reads English words. Remove the character or put it inside quotes.");
    }
    push(kind, text, length) {
        const startLine = this.line;
        const startColumn = this.column;
        this.index += length;
        this.column += length;
        this.tokens.push({
            kind,
            text,
            lower: text.toLowerCase(),
            file: this.source,
            line: startLine,
            column: startColumn,
            length,
            span: this.spanAt(startLine, startColumn, length),
        });
    }
    spanAt(line, column, length) {
        return { file: this.source, line, column, length };
    }
    error(message, line, column, length, suggestion, hint) {
        return new ParseError(new Diagnostic(message, this.spanAt(line, column, length), suggestion, hint));
    }
    isLetter(ch) {
        return KEYWORD_LIKE.test(ch);
    }
    isDigit(ch) {
        return ch >= "0" && ch <= "9";
    }
}
//# sourceMappingURL=lexer.js.map