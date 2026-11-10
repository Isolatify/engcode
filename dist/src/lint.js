import { Diagnostic, makeSource, spanFromToken } from "./diagnostics.js";
import { Lexer } from "./lexer.js";
import { prescanNames } from "./names.js";
const AMBIGUOUS_ENDINGS = new Set([
    "and",
    "or",
    "is",
    "not",
    "plus",
    "minus",
    "times",
    "divided",
    "by",
    "to",
    "from",
    "with",
    "as",
    "in",
    "called",
    "showing",
    "level",
    "default",
    "that",
    "contains",
    "between",
]);
const BUILTIN_NAMES = new Set([
    "uppercase",
    "lowercase",
    "trim",
    "length",
    "round",
    "floor",
    "ceiling",
    "absolute value",
    "square root",
    "sine",
    "cosine",
    "tangent",
    "number from",
    "text",
    "json of",
    "data from json",
    "random number",
    "random decimal",
    "random item",
    "item",
    "last item",
    "minimum",
    "maximum",
    "power",
    "split",
    "join",
    "replace",
    "position",
    "now",
    "today",
    "pi",
    "e",
]);
/** Extra, non-blocking advice shown by `engcode lint` and `engcode check --lint`. */
export function lintSource(filePath, text) {
    let tokens;
    try {
        tokens = Lexer.lex(filePath, text);
    }
    catch {
        return [];
    }
    const source = makeSource(filePath, text);
    const diagnostics = [];
    checkLines(source, diagnostics);
    checkNames(source, tokens, diagnostics);
    checkEmptyBlocks(source, tokens, diagnostics);
    checkCapabilities(source, tokens, diagnostics);
    return diagnostics;
}
function warning(message, span, hint) {
    return new Diagnostic(message, span, undefined, hint, "warning");
}
function checkLines(source, diagnostics) {
    source.lines.forEach((line, index) => {
        const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
        if (indentation.includes("\t")) {
            diagnostics.push(warning("This line is indented with a tab.", { file: source, line: index + 1, column: 1, length: Math.max(1, indentation.length) }, "EngCode indents with four spaces. Run `engcode format` to fix it."));
        }
        if (line.length > 120) {
            diagnostics.push(warning(`This line is ${line.length} characters long.`, { file: source, line: index + 1, column: 121, length: line.length - 120 }, "Short lines are easier to read. Split the statement into smaller steps."));
        }
        const comment = line.match(/note\s*:.*\b(TODO|FIXME|XXX)\b/i);
        if (comment) {
            const column = line.toLowerCase().indexOf(comment[1].toLowerCase()) + 1;
            diagnostics.push(warning(`There is a ${comment[1].toUpperCase()} note on this line.`, { file: source, line: index + 1, column, length: comment[1].length }, "Finish the idea before sharing the program, or turn it into a normal note."));
        }
    });
}
function checkNames(source, tokens, diagnostics) {
    const names = prescanNames(tokens);
    for (const name of names.declared) {
        const words = name.split(/\s+/);
        const last = words[words.length - 1].toLowerCase();
        if (AMBIGUOUS_ENDINGS.has(last)) {
            const token = findNameToken(tokens, name);
            if (!token)
                continue;
            diagnostics.push(warning(`The name "${name}" ends with the operator word "${last}".`, spanFromToken(token), `This can be read two ways. Try a name such as "${name} value" instead.`));
        }
        if (BUILTIN_NAMES.has(name.toLowerCase())) {
            const token = findNameToken(tokens, name);
            if (!token)
                continue;
            diagnostics.push(warning(`The name "${name}" is also a built-in phrase.`, spanFromToken(token), "Rename it so readers can tell your value apart from the built-in."));
        }
    }
    for (const name of simpleDeclarations(tokens)) {
        if (countName(tokens, name) <= 1) {
            const token = findNameToken(tokens, name);
            if (!token)
                continue;
            diagnostics.push(warning(`The name "${name}" is set but never used.`, spanFromToken(token), "Use it later, or remove the line that sets it."));
        }
    }
}
function checkEmptyBlocks(source, tokens, diagnostics) {
    const lines = splitTokenLines(tokens);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const last = line[line.length - 1];
        if (!last || last.kind !== "colon")
            continue;
        if (isDeclarationHeader(line))
            continue;
        const next = lines[index + 1];
        if (next && next[0]?.lower === "end") {
            diagnostics.push(warning("This block is empty.", spanFromToken(line[0]), "Add a step inside the block, or remove the block for now."));
        }
    }
}
function checkCapabilities(source, tokens, diagnostics) {
    const firstWords = new Set(splitTokenLines(tokens)
        .map((line) => line[0]?.lower)
        .filter((word) => word !== undefined));
    if (firstWords.has("read") || firstWords.has("write") || firstWords.has("append") || firstWords.has("delete")) {
        diagnostics.push(warning("This program can use project files.", { file: source, line: 1, column: 1, length: 1 }, "Files stay inside the project folder. EngCode always limits file access to that folder."));
    }
    if (firstWords.has("get") || firstWords.has("send")) {
        diagnostics.push(warning("This program can use the network.", { file: source, line: 1, column: 1, length: 1 }, "Requests must use HTTPS. Add --allow-network when you run it."));
    }
    if (firstWords.has("save") || firstWords.has("load")) {
        diagnostics.push(warning("This program can use device storage.", { file: source, line: 1, column: 1, length: 1 }, "Device storage lives in .engcode/storage.json inside the project."));
    }
}
function splitTokenLines(tokens) {
    const lines = [];
    let current = [];
    for (const token of tokens) {
        if (token.kind === "newline" || token.kind === "eof") {
            if (current.length > 0)
                lines.push(current);
            current = [];
        }
        else {
            current.push(token);
        }
    }
    if (current.length > 0)
        lines.push(current);
    return lines;
}
function isDeclarationHeader(line) {
    const first = line[0]?.lower;
    return first === "define" || first === "kind" || first === "it";
}
function findNameToken(tokens, name) {
    const words = name.split(/\s+/);
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.kind !== "word" || token.text !== words[0])
            continue;
        let matched = true;
        for (let offset = 1; offset < words.length; offset += 1) {
            const next = tokens[index + offset];
            if (!next || next.kind !== "word" || next.text !== words[offset]) {
                matched = false;
                break;
            }
        }
        if (matched)
            return token;
    }
    return null;
}
function countName(tokens, name) {
    const words = name.split(/\s+/);
    let count = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.kind !== "word" || token.text !== words[0])
            continue;
        let matched = true;
        for (let offset = 1; offset < words.length; offset += 1) {
            const next = tokens[index + offset];
            if (!next || next.kind !== "word" || next.text !== words[offset]) {
                matched = false;
                break;
            }
        }
        if (matched)
            count += 1;
    }
    return count;
}
/** Names introduced by a plain `set`, `ask`, `state`, or `keep track` line. */
function simpleDeclarations(tokens) {
    const names = [];
    for (const line of splitTokenLines(tokens)) {
        const first = line[0];
        if (!first || first.kind !== "word")
            continue;
        if (first.lower === "set" || first.lower === "state") {
            const end = line.findIndex((token, index) => index > 0 && token.kind === "word" && (token.lower === "to" || token.lower === "is"));
            const target = line.slice(1, end < 0 ? line.length : end);
            if (target.some((token) => token.kind === "property"))
                continue;
            const name = nameFromWords(target);
            if (name)
                names.push(name);
        }
        else if (first.lower === "ask" || first.lower === "read" || first.lower === "load") {
            const asIndex = line.findIndex((token) => token.kind === "word" && token.lower === "as");
            if (asIndex >= 0) {
                const name = nameFromWords(line.slice(asIndex + 1));
                if (name)
                    names.push(name);
            }
        }
        else if (first.lower === "keep" && line[1]?.lower === "track" && line[2]?.lower === "of") {
            const asIndex = line.findIndex((token, index) => index > 2 && token.kind === "word" && token.lower === "as");
            const end = asIndex < 0 ? line.length : asIndex;
            const name = nameFromWords(line.slice(3, end));
            if (name)
                names.push(name);
        }
    }
    return [...new Set(names)];
}
function nameFromWords(tokens) {
    const words = [];
    for (const token of tokens) {
        if (token.kind !== "word")
            break;
        words.push(token.text);
    }
    return words.join(" ");
}
//# sourceMappingURL=lint.js.map