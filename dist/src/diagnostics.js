export function makeSource(path, text) {
    const name = path.replace(/^.*[\\/]/, "") || path;
    return {
        path,
        name,
        text,
        lines: text.split(/\r\n|\n|\r/),
    };
}
export function spanFromToken(token) {
    return {
        file: token.file,
        line: token.line,
        column: token.column,
        length: Math.max(1, token.length),
    };
}
export class Diagnostic {
    message;
    span;
    suggestion;
    hint;
    severity;
    constructor(message, span, suggestion, hint, 
    /** Accessibility and lint notes are warnings; everything else is an error. */
    severity = "error") {
        this.message = message;
        this.span = span;
        this.suggestion = suggestion;
        this.hint = hint;
        this.severity = severity;
    }
}
export class EngError extends Error {
    diagnostic;
    constructor(diagnostic) {
        super(diagnostic.message);
        this.diagnostic = diagnostic;
        this.name = "EngError";
    }
}
export class ParseError extends EngError {
    constructor(diagnostic) {
        super(diagnostic);
        this.name = "ParseError";
    }
}
export class RuntimeError extends EngError {
    callTrail = [];
    constructor(diagnostic) {
        super(diagnostic);
        this.name = "RuntimeError";
    }
}
/** Renders a friendly, line-oriented diagnostic. */
export function renderDiagnostic(diagnostic) {
    const lines = [];
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
//# sourceMappingURL=diagnostics.js.map