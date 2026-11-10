import { Diagnostic, ParseError, spanFromToken } from "./diagnostics.js";
import { matchNameAt } from "./names.js";
import { tokenText } from "./tokens.js";
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
/** Screen blocks understood by the app model. */
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
/** Blocks that hold other blocks and end with `end`. */
const UI_CONTAINERS = new Set([
    "section",
    "row",
    "column",
    "grid",
    "card",
    "menu",
    "navigation bar",
    "footer",
    "form",
    "popup",
    "tabs",
    "tab",
]);
/** Leaf blocks whose first item is visible text. */
const UI_LABELED = new Set([
    "heading",
    "paragraph",
    "text",
    "button",
    "checkbox",
    "switch",
    "radio choice",
    "image",
    "video",
    "audio",
    "link",
    "icon",
]);
/** The safe properties that `change ... of ...` may update. */
const UI_CHANGE_PROPERTIES = [
    "text",
    "value",
    "background",
    "text color",
    "font size",
    "width",
    "height",
    "rounded corners",
    "padding",
    "margin",
    "border",
    "opacity",
    "alignment",
];
/** English color words, including the modifiers that may lead them. */
const COLOR_WORDS = new Set([
    "black",
    "white",
    "gray",
    "grey",
    "silver",
    "red",
    "maroon",
    "orange",
    "amber",
    "yellow",
    "olive",
    "lime",
    "green",
    "teal",
    "blue",
    "navy",
    "purple",
    "violet",
    "indigo",
    "pink",
    "brown",
    "gold",
    "cyan",
    "magenta",
    "turquoise",
    "salmon",
    "coral",
    "beige",
    "ivory",
    "khaki",
    "lavender",
    "plum",
    "crimson",
    "aqua",
    "transparent",
    "light",
    "dark",
    "pale",
    "bright",
    "deep",
    "hot",
    "sky",
    "royal",
    "forest",
    "midnight",
]);
const DRAW_SHAPES = new Set(["rectangle", "circle", "text", "line", "image"]);
/** Style values that are plain words rather than text. */
const STYLE_KEYWORDS = new Set([
    "full",
    "half",
    "auto",
    "none",
    "row",
    "column",
    "grid",
    "center",
    "left",
    "right",
    "top",
    "bottom",
    "middle",
    "space between",
    "space around",
    "space evenly",
    "yes",
    "no",
    "wrap",
    "nowrap",
    "bold",
    "normal",
    "italic",
    "underline",
    "hidden",
    "visible",
    "fixed",
    "sticky",
    "absolute",
    "relative",
    "flex",
    "block",
    "inline",
    "solid",
    "dashed",
    "dotted",
]);
/** CSS units that attach directly to the number before them, as in `42vh`. */
const STYLE_UNITS = new Set([
    "px",
    "vh",
    "vw",
    "vmin",
    "vmax",
    "rem",
    "em",
    "ex",
    "ch",
    "fr",
    "deg",
    "rad",
    "turn",
    "ms",
    "s",
    "pt",
    "pc",
    "cm",
    "mm",
    "in",
]);
/** Turns a style value's tokens back into readable text, e.g. `rgb(1, 2, 3)`. */
function tokensToStyleText(tokens) {
    let text = "";
    for (const token of tokens) {
        switch (token.kind) {
            case "text":
                text += String(token.value);
                break;
            case "number":
            case "hex":
                text += String(token.value);
                break;
            case "comma":
                text += ",";
                break;
            case "colon":
                text += ":";
                break;
            case "lparen":
                text += "(";
                break;
            case "rparen":
                text += ")";
                break;
            default: {
                const joinsNumber = token.kind === "word" && STYLE_UNITS.has(token.lower) && /[\d.]$/.test(text);
                if (!joinsNumber && text.length > 0 && !text.endsWith("(") && !text.endsWith(" "))
                    text += " ";
                text += token.text;
                break;
            }
        }
    }
    return text.replace(/,(\S)/g, ", $1");
}
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
export class Parser {
    tokens;
    names;
    options;
    pos = 0;
    constructor(tokens, names, options = {}) {
        this.tokens = tokens;
        this.names = names;
        this.options = options;
    }
    static parse(tokens, names, options = {}) {
        return new Parser(tokens, names, options).parseProgram();
    }
    parseProgram() {
        const body = [];
        this.skipNewlines();
        while (!this.atEnd()) {
            if (this.isWord("end")) {
                this.error("There is an extra \"end\" here.", this.peek(), "Remove this line, or add the block it was meant to close.");
            }
            if (this.isWord("otherwise")) {
                this.error('"otherwise" does not have an "if" above it.', this.peek(), "Put it inside an if block.");
            }
            if (this.isWord("if") && this.isWord("it", 1) && this.isWord("fails", 2)) {
                this.error('"if it fails" does not have a "try" above it.', this.peek(), "Put it inside a try block.");
            }
            body.push(this.parseStatement());
            this.expectLineEnd();
            this.skipNewlines();
        }
        return { kind: "program", body };
    }
    // ---------------------------------------------------------------- statements
    parseStatement() {
        const token = this.peek();
        if (token.kind !== "word") {
            this.error(`I expected a statement here, but found ${tokenText(token)}.`, token);
        }
        switch (token.lower) {
            case "say":
                return this.parseSay();
            case "ask":
                return this.parseAsk();
            case "set":
                return this.parseSet();
            case "change":
                if (this.looksLikeUiChange())
                    return this.parseChangeOf();
                return this.parseChange();
            case "add":
                return this.parseAddOrRemove("add");
            case "remove":
                return this.parseAddOrRemove("remove");
            case "if":
                return this.parseIf();
            case "repeat":
                return this.parseRepeat();
            case "for":
                return this.parseForEach();
            case "count":
                return this.parseCount();
            case "while":
                return this.parseWhile();
            case "stop":
                return this.parseStop();
            case "skip":
                return this.parseSkip();
            case "define":
                return this.parseDefine();
            case "give":
                return this.parseGiveBack();
            case "try":
                return this.parseTry();
            case "use":
                return this.parseUse();
            case "keep":
                return this.parseKeepTrack();
            case "call":
                return this.parseCallValueStatement();
            case "sort":
                return this.parseSort();
            case "reverse":
                return this.parseReverse();
            case "shuffle":
                return this.parseShuffle();
            case "read":
                return this.parseReadFile();
            case "write":
                return this.parseWriteFile(false);
            case "append":
                return this.parseWriteFile(true);
            case "delete":
                return this.parseDelete();
            case "list":
                return this.parseListFiles();
            case "wait":
                return this.parseWait();
            case "save":
                return this.parseSaveDevice();
            case "load":
                return this.parseLoadDevice();
            case "get":
                return this.parseGetData();
            case "send":
                return this.parseSendData();
            case "app":
                this.requireApps(token);
                return this.parseApp();
            case "style":
                this.requireApps(token);
                return this.parseStyle();
            case "theme":
                this.requireApps(token);
                return this.parseTheme();
            case "when":
                this.requireApps(token);
                return this.parseWhen();
            case "every":
                this.requireApps(token);
                return this.parseEvery();
            case "show":
                if (!this.isKind("text", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parseShow();
            case "hide":
                if (!this.isKind("text", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parseHide();
            case "clear":
                if (!this.isKind("text", 1) && !this.isWord("canvas", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parseClear();
            case "go":
                if (!this.isWord("to", 1) || !this.isWord("page", 2))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parseGoToPage();
            case "open":
                if (!this.isWord("popup", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parsePopup("open-popup");
            case "close":
                if (!this.isWord("popup", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parsePopup("close-popup");
            case "play":
                if (!this.isWord("sound", 1))
                    return this.parseCallOrMethod();
                this.requireApps(token);
                return this.parsePlaySound();
            case "draw":
                if (this.peek(1).kind !== "word" || !DRAW_SHAPES.has(this.peek(1).lower)) {
                    return this.parseCallOrMethod();
                }
                this.requireApps(token);
                return this.parseDraw();
            default:
                return this.parseCallOrMethod();
        }
        throw new Error("unreachable");
    }
    parseSay() {
        const token = this.expectWord("say");
        const value = this.parseExpression();
        return { kind: "say", value, token };
    }
    parseAsk() {
        const token = this.expectWord("ask");
        let number = false;
        if (this.isWord("for") && this.isWord("a", 1) && this.isWord("number", 2)) {
            this.pos += 3;
            number = true;
        }
        const prompt = this.parseExpression(() => this.isPhrase(["and", "save", "it", "as"]));
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the question.');
        const name = this.parseNameToLineEnd();
        return { kind: "ask", prompt, name: name.name, number, token };
    }
    parseSet() {
        const token = this.expectWord("set");
        const target = this.parseTarget(new Set(["to"]));
        this.expectWord("to", 'I expected "to" after the name, as in "set name to 25".');
        const value = this.parseExpression();
        return { kind: "set", target, value, token };
    }
    parseChange() {
        const token = this.expectWord("change");
        const target = this.parseTarget(new Set(["to"]));
        this.expectWord("to", 'I expected "to" after the name, as in "change age to 26".');
        const value = this.parseExpression();
        return { kind: "change", target, value, token };
    }
    parseAddOrRemove(kind) {
        const token = this.expectWord(kind);
        const delimiter = kind === "add" ? "to" : "from";
        const hasDelimiter = this.findWordOnLine(delimiter, true) >= 0;
        if (!hasDelimiter) {
            // "add 2 and 3" is a function call when "to" is absent.
            return this.parseCallAfterName(kind, token);
        }
        const value = this.parseExpression(() => this.isWord(delimiter));
        this.expectWord(delimiter, `I expected "${delimiter}" here.`);
        const target = this.parseTarget(new Set());
        if (kind === "add") {
            const stmt = { kind: "add", value, target, token };
            return stmt;
        }
        const stmt = { kind: "remove", value, target, token };
        return stmt;
    }
    parseIf() {
        const token = this.expectWord("if");
        const branches = [];
        let otherwise;
        let condition = this.parseExpression(() => this.isKind("colon"));
        this.expectKind("colon", 'I expected ":" at the end of the "if" line.');
        let body = this.parseBlockBody(() => this.isWord("end") || this.isWord("otherwise"));
        branches.push({ condition, body, token });
        while (this.isWord("otherwise")) {
            this.pos += 1;
            if (this.isWord("if")) {
                const branchToken = this.peek();
                this.pos += 1;
                condition = this.parseExpression(() => this.isKind("colon"));
                this.expectKind("colon", 'I expected ":" at the end of the "otherwise if" line.');
                body = this.parseBlockBody(() => this.isWord("end") || this.isWord("otherwise"));
                branches.push({ condition, body, token: branchToken });
                continue;
            }
            this.expectKind("colon", 'I expected ":" after "otherwise".');
            otherwise = this.parseBlockBody(() => this.isWord("end"));
            break;
        }
        this.expectWord("end", 'I expected "end" to close this "if" block.');
        return { kind: "if", branches, otherwise, token };
    }
    parseRepeat() {
        const token = this.expectWord("repeat");
        const count = this.parseExpression(() => this.isWord("times"));
        this.expectWord("times", 'I expected "times" after the repeat count.');
        this.expectKind("colon", 'I expected ":" after "times".');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this "repeat" block.');
        return { kind: "repeat", count, body, token };
    }
    parseForEach() {
        const token = this.expectWord("for");
        this.expectWord("each", 'I expected "for each name in list".');
        const name = this.parseNameUntil(new Set(["in"]));
        this.expectWord("in", 'I expected "in" after the loop name.');
        const iterable = this.parseExpression(() => this.isKind("colon"));
        this.expectKind("colon", 'I expected ":" at the end of the "for each" line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this "for each" block.');
        return { kind: "for-each", name: name.name, iterable, body, token };
    }
    parseCount() {
        const token = this.expectWord("count");
        this.expectWord("from", 'I expected "count from 1 to 10".');
        const start = this.parseExpression(() => this.isWord("to"));
        this.expectWord("to", 'I expected "to" in "count from 1 to 10".');
        const end = this.parseExpression(() => this.isWord("as") || this.isKind("colon"));
        let name = "counter";
        if (this.matchWord("as")) {
            name = this.parseNameUntil(new Set(["colon"])).name;
        }
        this.expectKind("colon", 'I expected ":" at the end of the "count" line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this "count" block.');
        return { kind: "count", start, end, name, body, token };
    }
    parseWhile() {
        const token = this.expectWord("while");
        const condition = this.parseExpression(() => this.isKind("colon"));
        this.expectKind("colon", 'I expected ":" at the end of the "while" line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this "while" block.');
        return { kind: "while", condition, body, token };
    }
    parseStop() {
        const token = this.expectWord("stop");
        this.expectWord("the", 'Write "stop the loop".');
        this.expectWord("loop", 'Write "stop the loop".');
        return { kind: "stop", token };
    }
    parseSkip() {
        const token = this.expectWord("skip");
        this.expectWord("to", 'Write "skip to the next one".');
        this.expectWord("the", 'Write "skip to the next one".');
        this.expectWord("next", 'Write "skip to the next one".');
        this.expectWord("one", 'Write "skip to the next one".');
        return { kind: "skip", token };
    }
    parseDefine() {
        const token = this.expectWord("define");
        if (this.isWord("a") &&
            this.isWord("kind", 1) &&
            this.isWord("of", 2) &&
            this.isWord("thing", 3) &&
            this.isWord("called", 4)) {
            this.pos += 5;
            return this.parseKind(token);
        }
        const name = this.parseNameUntil(new Set(["with"]), true);
        let params = [];
        if (this.matchWord("with")) {
            params = this.parseParameters("colon");
        }
        this.expectKind("colon", 'I expected ":" at the end of the "define" line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this function.');
        return { kind: "define", name: name.name, params, body, token };
    }
    parseKind(token) {
        const name = this.parseNameUntil(new Set(["colon"])).name;
        this.expectKind("colon", 'I expected ":" at the end of the kind line.');
        const fields = [];
        const methods = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            if (this.isWord("it") && this.isWord("has", 1)) {
                this.pos += 2;
                this.parseFieldDeclarations(fields);
                this.expectLineEnd();
            }
            else if (this.isWord("it") && this.isWord("can", 1)) {
                this.pos += 2;
                methods.push(this.parseMethodDeclaration());
            }
            else {
                this.error('A kind can only contain "it has ..." and "it can ...:" lines.', this.peek(), 'For example: "it has name and age" or "it can bark:".');
            }
            this.skipNewlines();
        }
        this.expectWord("end", 'I expected "end" to close this kind.');
        return { kind: "kind", name, fields, methods, token };
    }
    parseFieldDeclarations(fields) {
        while (!this.atEnd() && !this.isKind("newline")) {
            if (this.matchKind("comma") || this.matchWord("and"))
                continue;
            const token = this.peek();
            if (token.kind === "text") {
                this.pos += 1;
                fields.push({ name: String(token.value), token });
                continue;
            }
            if (token.kind === "word") {
                this.pos += 1;
                fields.push({ name: token.text, token });
                continue;
            }
            this.error("I expected a field name here.", token);
        }
    }
    parseMethodDeclaration() {
        const token = this.peek();
        if (token.kind !== "word") {
            this.error("I expected a method name after \"it can\".", token);
        }
        this.pos += 1;
        const name = token.text;
        let params = [];
        if (this.matchWord("with")) {
            params = this.parseParameters("colon");
        }
        this.expectKind("colon", 'I expected ":" at the end of the method line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this method.');
        return { name, params, body, token };
    }
    parseGiveBack() {
        const token = this.expectWord("give");
        this.expectWord("back", 'Write "give back" to return a value.');
        if (this.isKind("newline") || this.atEnd()) {
            return { kind: "give-back", token };
        }
        const value = this.parseExpression();
        return { kind: "give-back", value, token };
    }
    parseTry() {
        const token = this.expectWord("try");
        this.expectKind("colon", 'I expected ":" after "try".');
        const body = this.parseBlockBody(() => this.isWord("end") || this.isPhrase(["if", "it", "fails"]));
        this.expectPhrase(["if", "it", "fails"], 'I expected "if it fails:" after the try block.');
        this.expectKind("colon", 'I expected ":" after "if it fails".');
        const handler = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this "try" block.');
        return { kind: "try", body, handler, token };
    }
    parseUse() {
        const token = this.expectWord("use");
        if (this.isWord("theme")) {
            this.pos += 1;
            const theme = this.peek();
            if (theme.kind !== "text") {
                this.error('I expected a quoted theme name, as in use theme "dark".', theme);
            }
            this.pos += 1;
            return { kind: "use", target: String(theme.value), isPath: false, isTheme: true, token };
        }
        const next = this.peek();
        if (next.kind === "text") {
            this.pos += 1;
            return { kind: "use", target: String(next.value), isPath: true, isTheme: false, token };
        }
        if (next.kind === "word") {
            this.pos += 1;
            return { kind: "use", target: next.text, isPath: false, isTheme: false, token };
        }
        this.error('I expected a module or file after "use".', next);
    }
    parseKeepTrack() {
        const token = this.expectWord("keep");
        this.expectWord("track", 'Write "keep track of name as value".');
        this.expectWord("of", 'Write "keep track of name as value".');
        const name = this.parseNameUntil(new Set(["as"]));
        this.expectWord("as", 'I expected "as" before the starting value.');
        const value = this.parseExpression();
        return { kind: "state", name: name.name, value, token };
    }
    parseCallValueStatement() {
        const token = this.expectWord("call");
        const callee = this.parseExpression(() => this.isWord("with"));
        let args = [];
        if (this.matchWord("with")) {
            args = this.parseArguments();
        }
        return { kind: "call-value-stmt", callee, args, token };
    }
    parseSort() {
        const token = this.expectWord("sort");
        const value = this.parseExpression(() => this.isWord("descending"));
        const descending = this.matchWord("descending");
        return { kind: "sort", value, descending, token };
    }
    parseReverse() {
        const token = this.expectWord("reverse");
        const value = this.parseExpression();
        return { kind: "reverse", value, token };
    }
    parseShuffle() {
        const token = this.expectWord("shuffle");
        const value = this.parseExpression();
        return { kind: "shuffle", value, token };
    }
    // ------------------------------------------------------------------- apps
    requireApps(token) {
        if (this.options.allowApps)
            return;
        this.error(`"${token.text}" belongs to an app.`, token, 'Web apps are built with "engcode build web" or opened with "engcode serve".');
    }
    expectTextValue(message) {
        const token = this.peek();
        if (token.kind !== "text") {
            this.error(message, token, 'Put the name in double quotes, as in "Home".');
        }
        this.pos += 1;
        return String(token.value);
    }
    parseApp() {
        const token = this.expectWord("app");
        const name = this.expectTextValue('I expected the app name in quotes.');
        this.expectKind("colon", 'I expected ":" at the end of the app line.');
        const pages = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            if (!this.isWord("page")) {
                this.error('An app contains "page" blocks.', this.peek(), 'Write page "Home": followed by the screen blocks, then end.');
            }
            pages.push(this.parsePage());
            this.skipNewlines();
        }
        this.expectWord("end", 'I expected "end" to close this app.');
        if (pages.length === 0) {
            this.error("This app has no pages.", token, 'Add page "Home": with something on it.');
        }
        return { kind: "app", name, pages, token };
    }
    parsePage() {
        const token = this.expectWord("page");
        const name = this.expectTextValue('I expected the page name in quotes.');
        this.expectKind("colon", 'I expected ":" at the end of the page line.');
        const body = this.parseUiNodes();
        this.expectWord("end", 'I expected "end" to close this page.');
        return { kind: "page", name, body, token };
    }
    parseUiNodes() {
        const nodes = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            nodes.push(this.parseUiNode());
            this.expectLineEnd();
            this.skipNewlines();
        }
        return nodes;
    }
    parseUiNode() {
        const token = this.peek();
        if (token.kind !== "word") {
            this.error("I expected a screen block here.", token);
        }
        let element;
        if (this.isWord("navigation") && this.isWord("bar", 1)) {
            this.pos += 2;
            element = "navigation bar";
        }
        else if (this.isWord("text") && this.isWord("area", 1)) {
            this.pos += 2;
            element = "text area";
        }
        else if (this.isWord("radio") && this.isWord("choice", 1)) {
            this.pos += 2;
            element = "radio choice";
        }
        else if (UI_ELEMENTS.has(token.lower)) {
            this.pos += 1;
            element = token.lower;
        }
        else {
            this.error(`I don't know the screen block "${token.text}".`, token, "Use a block such as heading, paragraph, text, button, input, row, column, section, card, list, table, or canvas.");
        }
        const node = {
            kind: "ui",
            element,
            choices: [],
            columns: [],
            submits: false,
            required: false,
            children: [],
            token,
        };
        if (UI_CONTAINERS.has(element)) {
            if (!this.isKind("colon") && !this.isWord("called")) {
                node.label = this.parseExpression(() => this.isWord("called") || this.isKind("colon"));
            }
            if (this.matchWord("called"))
                node.id = this.expectTextValue('I expected an id in quotes.');
            this.expectKind("colon", `I expected ":" after this ${element}.`);
            node.children = this.parseUiNodes();
            this.expectWord("end", `I expected "end" to close this ${element}.`);
            return node;
        }
        if (UI_LABELED.has(element)) {
            if (!this.isKind("newline") && !this.isWord("called") && !this.isWord("with")) {
                node.label = this.parseExpression(() => this.uiAttributeStop());
            }
        }
        while (!this.atEnd() && !this.isKind("newline")) {
            if (this.matchWord("called")) {
                node.id = this.expectTextValue('I expected an id in quotes.');
            }
            else if (this.matchWord("level")) {
                node.level = this.expectNumber("I expected a heading level such as 2.");
            }
            else if (this.matchWord("submits")) {
                node.submits = true;
            }
            else if (this.matchWord("required")) {
                node.required = true;
            }
            else if (this.matchWord("loops") || this.matchWord("loop")) {
                node.loop = true;
            }
            else if (this.matchWord("showing")) {
                node.showing = this.parseExpression(() => this.uiAttributeStop());
            }
            else if (this.matchWord("to")) {
                node.linkTo = this.parseExpression(() => this.uiAttributeStop());
            }
            else if (this.matchWord("with") || this.matchWord("and")) {
                this.parseUiAttribute(node);
            }
            else {
                this.error(`I didn't expect ${tokenText(this.peek())} in this ${element}.`, this.peek(), "Use called, with, showing, level, submits, required, or loops.");
            }
        }
        return node;
    }
    parseUiAttribute(node) {
        const token = this.peek();
        if (token.kind !== "word") {
            this.error("I expected an attribute after \"with\".", token);
        }
        const name = token.lower;
        this.pos += 1;
        switch (name) {
            case "label":
                node.label = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "hint":
                node.hint = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "starting":
                node.starting = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "description":
                node.description = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "poster":
                node.poster = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "loops":
            case "loop":
                node.loop = true;
                return;
            case "minimum":
                node.minimum = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "maximum":
                node.maximum = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "width":
                node.width = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "height":
                node.height = this.parseExpression(() => this.uiAttributeStop());
                return;
            case "choices":
                this.parseUiList(node.choices);
                return;
            case "columns":
                this.parseUiList(node.columns);
                return;
            default:
                this.error(`I don't know the attribute "${name}".`, token, "Use label, hint, starting, description, poster, choices, columns, minimum, maximum, width, or height.");
        }
    }
    parseUiList(into) {
        while (!this.atEnd() && !this.isKind("newline")) {
            if (this.matchKind("comma") || this.matchWord("and"))
                continue;
            into.push(this.parseExpression(() => this.isKind("comma") || this.isWord("and") || this.isKind("newline")));
        }
    }
    uiAttributeStop() {
        return (this.isKind("newline") ||
            this.isKind("colon") ||
            this.isWord("called") ||
            this.isWord("with") ||
            this.isWord("and") ||
            this.isWord("level") ||
            this.isWord("showing") ||
            this.isWord("to") ||
            this.isWord("submits") ||
            this.isWord("required"));
    }
    looksLikeUiChange() {
        return UI_CHANGE_PROPERTIES.some((property) => {
            const words = property.split(" ");
            if (!words.every((word, index) => this.isWord(word, index + 1)))
                return false;
            return this.isWord("of", words.length + 1);
        });
    }
    parseChangeOf() {
        const token = this.expectWord("change");
        const words = [];
        while (!this.atEnd() && !this.isWord("of")) {
            const next = this.peek();
            if (next.kind !== "word")
                break;
            words.push(next.text);
            this.pos += 1;
        }
        if (words.length === 0)
            this.error('Write "change text of id to value".', token);
        this.expectWord("of", 'I expected "of" after the screen property.');
        const id = this.expectTextValue('I expected the element id in quotes.');
        this.expectWord("to", 'I expected "to" before the new value.');
        const value = this.parseUiChangeValue();
        return { kind: "change-of", property: words.join(" ").toLowerCase(), id, value, token };
    }
    parseUiChangeValue() {
        const token = this.peek();
        if (token.kind === "hex") {
            this.pos += 1;
            return { kind: "text", value: String(token.value), token };
        }
        if (token.kind === "word") {
            const saved = this.pos;
            const words = [];
            while (!this.atEnd() && this.peek().kind === "word" && COLOR_WORDS.has(this.peek().lower)) {
                words.push(this.peek().text);
                this.pos += 1;
            }
            if (words.length > 0 &&
                (this.atEnd() || this.isKind("newline"))) {
                return { kind: "text", value: words.join(" "), token };
            }
            this.pos = saved;
        }
        return this.parseExpression();
    }
    parseShow() {
        const token = this.expectWord("show");
        const id = this.expectTextValue('Write show "element id".');
        return { kind: "show", id, token };
    }
    parseHide() {
        const token = this.expectWord("hide");
        const id = this.expectTextValue('Write hide "element id".');
        return { kind: "hide", id, token };
    }
    parseClear() {
        const token = this.expectWord("clear");
        if (this.matchWord("canvas")) {
            const id = this.expectTextValue('Write clear canvas "board" to #111827.');
            this.expectWord("to", 'I expected "to" before the canvas color.');
            const color = this.parseColorPhrase();
            return { kind: "clear-canvas", id, color, token };
        }
        const id = this.expectTextValue('Write clear "element id".');
        return { kind: "clear", id, token };
    }
    parseGoToPage() {
        const token = this.expectWord("go");
        this.expectWord("to", 'Write go to page "Settings".');
        this.expectWord("page", 'Write go to page "Settings".');
        const page = this.expectTextValue('I expected the page name in quotes.');
        return { kind: "go-to-page", page, token };
    }
    parsePopup(kind) {
        const token = this.expectWord(kind === "open-popup" ? "open" : "close");
        this.expectWord("popup", `Write ${kind === "open-popup" ? "open" : "close"} popup "id".`);
        const id = this.expectTextValue('I expected the popup id in quotes.');
        return { kind, id, token };
    }
    parsePlaySound() {
        const token = this.expectWord("play");
        this.expectWord("sound", 'Write play sound "ding.mp3".');
        const path = this.parseExpression();
        return { kind: "play-sound", path, token };
    }
    parseColorPhrase() {
        const token = this.peek();
        if (token.kind === "hex") {
            this.pos += 1;
            return String(token.value);
        }
        const words = [];
        while (!this.atEnd() && !this.isKind("newline")) {
            const next = this.peek();
            if (next.kind !== "word")
                break;
            words.push(next.text);
            this.pos += 1;
        }
        if (words.length === 0) {
            this.error("I expected a color here.", token, "Use a color such as white, dark blue, or #111827.");
        }
        return words.join(" ");
    }
    parseDraw() {
        const token = this.expectWord("draw");
        const shapeToken = this.peek();
        if (shapeToken.kind !== "word" || !DRAW_SHAPES.has(shapeToken.lower)) {
            this.error("I expected rectangle, circle, text, line, or image after \"draw\".", shapeToken);
        }
        const shape = shapeToken.lower;
        this.pos += 1;
        const statement = { kind: "draw", shape, id: "", token };
        if (shape === "text") {
            statement.text = this.parseExpression(() => this.isWord("on"));
        }
        else if (shape === "image") {
            statement.path = this.parseExpression(() => this.isWord("on"));
        }
        this.expectWord("on", 'I expected "on \\"canvas id\\"" in this draw statement.');
        statement.id = this.expectTextValue('I expected the canvas id in quotes.');
        if (shape === "line") {
            this.expectWord("from", 'Write draw line on "board" from x 0 and y 0 to x 10 and y 10 in white.');
            this.expectWord("x", 'I expected "x" after "from".');
            statement.fromX = this.parseExpression(() => this.isWord("and"));
            this.expectWord("and", 'I expected "and y" in the line position.');
            this.expectWord("y", 'I expected "y" in the line position.');
            statement.fromY = this.parseExpression(() => this.isWord("to"));
            this.expectWord("to", 'I expected "to x ... and y ..." in the line position.');
            this.expectWord("x", 'I expected "x" after "to".');
            statement.toX = this.parseExpression(() => this.isWord("and"));
            this.expectWord("and", 'I expected "and y" in the line position.');
            this.expectWord("y", 'I expected "y" in the line position.');
            statement.toY = this.parseExpression(() => this.isWord("in"));
        }
        else {
            this.expectWord("at", 'I expected "at x ... and y ..." in this draw statement.');
            this.expectWord("x", 'I expected "x" after "at".');
            statement.x = this.parseExpression(() => this.isWord("and"));
            this.expectWord("and", 'I expected "and y" in the draw position.');
            this.expectWord("y", 'I expected "y" in the draw position.');
            statement.y = this.parseExpression(() => this.isWord("with") || this.isWord("in"));
            if (this.matchWord("with")) {
                const sizeName = this.peek();
                if (sizeName.kind === "word" && sizeName.lower === "width") {
                    this.pos += 1;
                    statement.width = this.parseExpression(() => this.isWord("and"));
                    this.expectWord("and", 'I expected "and height" after the width.');
                    this.expectWord("height", 'I expected "height" after "and".');
                    statement.height = this.parseExpression(() => this.isWord("in"));
                }
                else if (sizeName.kind === "word" && sizeName.lower === "size") {
                    this.pos += 1;
                    statement.size = this.parseExpression(() => this.isWord("in"));
                }
                else {
                    this.error('I expected "width" or "size" after "with".', sizeName);
                }
            }
        }
        if (this.matchWord("in"))
            statement.color = this.parseColorPhrase();
        return statement;
    }
    parseStyle() {
        const token = this.expectWord("style");
        let target = "everything";
        let targetType = "everything";
        if (this.matchWord("everything")) {
            target = "everything";
            targetType = "everything";
        }
        else if (this.peek().kind === "text") {
            target = String(this.peek().value);
            targetType = "id";
            this.pos += 1;
        }
        else if (this.peek().kind === "word") {
            const words = [this.peek().text];
            this.pos += 1;
            while (!this.atEnd() &&
                this.peek().kind === "word" &&
                !this.isWord("on") &&
                !this.isWord("in")) {
                words.push(this.peek().text);
                this.pos += 1;
            }
            target = words.join(" ");
            targetType = "kind";
        }
        else {
            this.error('I expected a style target such as everything or "button id".', this.peek());
        }
        let media;
        if (this.matchWord("on")) {
            const words = [];
            while (!this.atEnd() && !this.isWord("in") && !this.isKind("colon")) {
                const next = this.peek();
                if (next.kind !== "word")
                    break;
                words.push(next.text);
                this.pos += 1;
            }
            media = words.join(" ").toLowerCase();
            if (media.length === 0)
                this.error('I expected "small screens" after "on".', this.peek());
        }
        let dark = false;
        if (this.matchWord("in")) {
            this.expectWord("dark", 'Write "in dark mode".');
            this.expectWord("mode", 'Write "in dark mode".');
            dark = true;
        }
        this.expectKind("colon", 'I expected ":" at the end of the style line.');
        const declarations = [];
        const states = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            if (this.isWord("when")) {
                states.push(this.parseStyleState());
            }
            else {
                declarations.push(this.parseStyleDeclaration());
                this.expectLineEnd();
            }
            this.skipNewlines();
        }
        this.expectWord("end", 'I expected "end" to close this style.');
        return { kind: "style", target, targetType, media, dark, declarations, states, token };
    }
    parseTheme() {
        const token = this.expectWord("theme");
        const name = this.expectTextValue('I expected a theme name in quotes.');
        let dark = false;
        if (this.matchWord("in")) {
            this.expectWord("dark", 'Write "in dark mode".');
            this.expectWord("mode", 'Write "in dark mode".');
            dark = true;
        }
        this.expectKind("colon", 'I expected ":" at the end of the theme line.');
        const declarations = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            declarations.push(this.parseStyleDeclaration());
            this.expectLineEnd();
            this.skipNewlines();
        }
        this.expectWord("end", 'I expected "end" to close this theme.');
        return { kind: "theme", name, dark, declarations, token };
    }
    parseStyleState() {
        const token = this.expectWord("when");
        const words = [];
        while (!this.atEnd() && !this.isKind("colon")) {
            const next = this.peek();
            if (next.kind !== "word")
                break;
            words.push(next.text);
            this.pos += 1;
        }
        this.expectKind("colon", 'I expected ":" at the end of the style state.');
        const declarations = [];
        this.skipNewlines();
        while (!this.atEnd() && !this.isWord("end")) {
            declarations.push(this.parseStyleDeclaration());
            this.expectLineEnd();
            this.skipNewlines();
        }
        this.expectWord("end", 'I expected "end" to close this style state.');
        return { state: words.join(" ").toLowerCase(), declarations, token };
    }
    parseStyleDeclaration() {
        const token = this.peek();
        const words = [];
        while (!this.atEnd() && !this.isKind("newline") && !this.isWord("is") && !this.isWord("of")) {
            const next = this.peek();
            if (next.kind !== "word")
                break;
            words.push(next.text);
            this.pos += 1;
        }
        if (words.length === 0) {
            this.error("I expected a style property here.", token);
        }
        if (!this.matchWord("is") && !this.matchWord("of")) {
            this.error('I expected "is" or "of" after the style property.', this.peek(), 'For example: "background is blue" or "rounded corners of 8".');
        }
        const property = words.join(" ").toLowerCase();
        const value = this.parseStyleValue();
        return { property, value, token };
    }
    parseStyleValue() {
        const start = this.pos;
        let end = start;
        while (end < this.tokens.length) {
            const token = this.tokens[end];
            if (token.kind === "newline" || token.kind === "eof")
                break;
            end += 1;
        }
        const slice = this.tokens.slice(start, end);
        if (slice.length === 0) {
            this.error("I expected a value after the style property.", this.peek());
        }
        this.pos = end;
        if (slice.length === 1) {
            const only = slice[0];
            if (only.kind === "number")
                return { type: "number", value: Number(only.value) };
            if (only.kind === "hex")
                return { type: "color", value: String(only.value) };
            if (only.kind === "text")
                return { type: "text", value: String(only.value) };
        }
        if (slice.length === 2 &&
            slice[0].kind === "number" &&
            slice[1].kind === "word" &&
            slice[1].lower === "percent") {
            return { type: "percent", value: Number(slice[0].value) };
        }
        const raw = tokensToStyleText(slice);
        const lower = raw.toLowerCase();
        if (slice.every((item) => item.kind === "word" && COLOR_WORDS.has(item.lower))) {
            return { type: "color", value: lower };
        }
        if (lower.startsWith("rgb("))
            return { type: "color", value: raw };
        if (STYLE_KEYWORDS.has(lower))
            return { type: "keyword", value: lower };
        return { type: "text", value: raw };
    }
    parseWhen() {
        const token = this.expectWord("when");
        let event;
        if (this.matchWord("the")) {
            if (this.matchWord("page")) {
                this.expectWord("opens", 'Write "when the page opens:".');
                event = { type: "page-open" };
            }
            else if (this.matchWord("user")) {
                if (this.matchWord("types")) {
                    this.expectWord("in", 'Write "when the user types in \\"id\\":".');
                    event = { type: "typing", id: this.expectTextValue('I expected an input id.') };
                }
                else if (this.matchWord("presses")) {
                    this.expectWord("key", 'Write "when the user presses key \\"Enter\\":".');
                    event = { type: "key", key: this.expectTextValue('I expected a key name.') };
                }
                else {
                    this.error('I expected "types in" or "presses key".', this.peek());
                }
            }
            else if (this.matchWord("mouse")) {
                if (this.matchWord("enters")) {
                    event = { type: "mouse-enter", id: this.expectTextValue('I expected an element id.') };
                }
                else if (this.matchWord("leaves")) {
                    event = { type: "mouse-leave", id: this.expectTextValue('I expected an element id.') };
                }
                else {
                    this.error('I expected "enters" or "leaves".', this.peek());
                }
            }
            else if (this.matchWord("window")) {
                this.expectWord("is", 'Write "when the window is resized:".');
                this.expectWord("resized", 'Write "when the window is resized:".');
                event = { type: "resize" };
            }
            else {
                this.error('I expected "page", "user", "mouse", or "window" after "the".', this.peek());
            }
        }
        else if (this.matchWord("page")) {
            const page = this.expectTextValue('I expected a page name.');
            this.expectWord("opens", 'Write "when page \\"Home\\" opens:".');
            event = { type: "page-open", page };
        }
        else if (this.peek().kind === "text") {
            const id = String(this.peek().value);
            this.pos += 1;
            if (this.matchWord("is")) {
                if (this.matchWord("clicked"))
                    event = { type: "click", id };
                else if (this.matchWord("hovered"))
                    event = { type: "hover", id };
                else if (this.matchWord("submitted"))
                    event = { type: "submit", id };
                else
                    this.error('I expected "clicked", "hovered", or "submitted".', this.peek());
            }
            else if (this.matchWord("changes")) {
                event = { type: "change", id };
            }
            else {
                this.error('I expected "is clicked", "changes", "is hovered", or "is submitted".', this.peek());
            }
        }
        else {
            this.error("I don't understand this event.", this.peek(), 'Try when "button id" is clicked: or when the page opens:.');
        }
        this.expectKind("colon", 'I expected ":" at the end of the when line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this event.');
        return { kind: "when", event, body, token };
    }
    parseEvery() {
        const token = this.expectWord("every");
        let seconds;
        let frame = false;
        if (this.matchWord("frame")) {
            frame = true;
        }
        else {
            const numberToken = this.peek();
            if (numberToken.kind !== "number") {
                this.error('Write "every 5 seconds:" or "every frame:".', numberToken);
            }
            seconds = Number(numberToken.value);
            this.pos += 1;
            this.expectWord("seconds", 'I expected "seconds" after the number.');
        }
        this.expectKind("colon", 'I expected ":" at the end of the every line.');
        const body = this.parseBlockBody(() => this.isWord("end"));
        this.expectWord("end", 'I expected "end" to close this timer.');
        return { kind: "every", seconds, frame, body, token };
    }
    expectNumber(message) {
        const token = this.peek();
        if (token.kind !== "number") {
            this.error(message, token);
        }
        this.pos += 1;
        return Number(token.value);
    }
    parseReadFile() {
        const token = this.expectWord("read");
        this.expectWord("file", 'Write "read file path and save it as name".');
        const path = this.parseExpression(() => this.isPhrase(["and", "save", "it", "as"]));
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the file path.');
        const name = this.parseNameToLineEnd();
        return { kind: "read-file", path, name: name.name, token };
    }
    parseWriteFile(append) {
        const token = this.expectWord(append ? "append" : "write");
        const value = this.parseExpression(() => this.isWord("to") && this.isWord("file", 1));
        this.expectWord("to", `I expected "to file path" after the value.`);
        this.expectWord("file", `I expected "file" after "to".`);
        const path = this.parseExpression();
        return { kind: "write-file", path, value, append, token };
    }
    parseDelete() {
        const token = this.expectWord("delete");
        if (this.matchWord("file")) {
            const path = this.parseExpression();
            return { kind: "delete-file", path, token };
        }
        const key = this.parseExpression(() => this.isPhrase(["from", "the", "device"]));
        this.expectPhrase(["from", "the", "device"], 'Write "delete file path" or "delete key from the device".');
        return { kind: "delete-device", key, token };
    }
    parseListFiles() {
        const token = this.expectWord("list");
        this.expectWord("files", 'Write "list files in folder and save it as names".');
        this.expectWord("in", 'Write "list files in folder and save it as names".');
        const path = this.parseExpression(() => this.isPhrase(["and", "save", "it", "as"]));
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the folder.');
        const name = this.parseNameToLineEnd();
        return { kind: "list-files", path, name: name.name, token };
    }
    parseWait() {
        const token = this.expectWord("wait");
        const seconds = this.parseExpression(() => this.isWord("seconds"));
        this.expectWord("seconds", 'Write "wait 2 seconds".');
        return { kind: "wait", seconds, token };
    }
    parseSaveDevice() {
        const token = this.expectWord("save");
        const value = this.parseExpression(() => this.isPhrase(["to", "the", "device", "as"]));
        this.expectPhrase(["to", "the", "device", "as"], 'Write "save value to the device as key".');
        const key = this.parseExpression();
        return { kind: "save-device", key, value, token };
    }
    parseLoadDevice() {
        const token = this.expectWord("load");
        const key = this.parseExpression(() => this.isPhrase(["from", "the", "device"]));
        this.expectPhrase(["from", "the", "device"], 'Write "load key from the device".');
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the device key.');
        const name = this.parseNameToLineEnd();
        return { kind: "load-device", key, name: name.name, token };
    }
    parseGetData() {
        const token = this.expectWord("get");
        this.expectWord("data", 'Write "get data from address and save it as name".');
        this.expectWord("from", 'Write "get data from address and save it as name".');
        const url = this.parseExpression(() => this.isPhrase(["and", "save", "it", "as"]));
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the address.');
        const name = this.parseNameToLineEnd();
        return { kind: "get-data", url, name: name.name, token };
    }
    parseSendData() {
        const token = this.expectWord("send");
        this.expectWord("data", 'Write "send data value to address and save it as name".');
        const value = this.parseExpression(() => this.isWord("to"));
        this.expectWord("to", 'I expected "to address" after the data.');
        const url = this.parseExpression(() => this.isPhrase(["and", "save", "it", "as"]));
        this.expectPhrase(["and", "save", "it", "as"], 'I expected "and save it as name" after the address.');
        const name = this.parseNameToLineEnd();
        return { kind: "send-data", url, value, name: name.name, token };
    }
    parseCallOrMethod() {
        const token = this.peek();
        const match = matchNameAt(this.names, this.tokens, this.pos);
        if (match) {
            if (this.names.functions.has(match.name)) {
                this.pos += match.count;
                return this.parseCallAfterName(match.name, token);
            }
            // A declared value followed by a word is a method call: rex celebrate
            this.pos += match.count;
            const next = this.peek();
            if (next.kind === "word" && !CLAUSE_WORDS.has(next.lower)) {
                this.pos += 1;
                const args = this.canStartExpression() ? this.parseArguments() : [];
                const stmt = { kind: "method-stmt", object: match.name, method: next.text, args, token };
                return stmt;
            }
            this.error(`I don't know what to do with "${match.name}" on its own.`, token, 'To call a function, write its name followed by its arguments, or use "call ... with ...".');
        }
        const word = this.peek();
        if (word.kind === "word") {
            this.pos += 1;
            return this.parseCallAfterName(word.text, token);
        }
        this.error("I expected a statement here.", word);
    }
    parseCallAfterName(name, token) {
        const args = this.canStartExpression() ? this.parseArguments() : [];
        return { kind: "call-stmt", name, args, token };
    }
    // ------------------------------------------------------------------ targets
    parseTarget(stopWords) {
        const start = this.peek();
        const words = [];
        while (true) {
            const token = this.peek();
            if (token.kind === "property" || token.kind === "colon" || token.kind === "newline" || token.kind === "eof") {
                break;
            }
            if (token.kind === "word" && stopWords.has(token.lower))
                break;
            if (token.kind !== "word")
                break;
            words.push(token.text);
            this.pos += 1;
        }
        if (words.length === 0) {
            this.error("I expected a name here.", start);
        }
        let target = { kind: "variable", name: words.join(" "), token: start };
        while (this.isKind("property")) {
            const propertyToken = this.peek();
            this.pos += 1;
            const key = this.parsePropertyKey();
            target = { kind: "property", base: target, key, token: propertyToken };
        }
        return target;
    }
    parsePropertyKey() {
        const token = this.peek();
        if (token.kind === "text") {
            this.pos += 1;
            return String(token.value);
        }
        if (token.kind === "word") {
            this.pos += 1;
            return token.text;
        }
        this.error("I expected a property name after 's.", token, 'Write person\'s name, or quote a key with spaces: person\'s "home address".');
    }
    // --------------------------------------------------------------------- names
    parseNameToLineEnd() {
        return this.parseNameUntil(new Set(), false, true);
    }
    parseNameUntil(stopWords, stopAtWith = false, stopAtLineEnd = false) {
        const start = this.peek();
        const words = [];
        while (true) {
            const token = this.peek();
            if (token.kind === "colon" || token.kind === "newline" || token.kind === "eof")
                break;
            if (token.kind === "word" && stopWords.has(token.lower))
                break;
            if (stopAtWith && token.kind === "word" && token.lower === "with")
                break;
            if (stopAtLineEnd && token.kind !== "word")
                break;
            if (token.kind !== "word")
                break;
            words.push(token.text);
            this.pos += 1;
        }
        if (words.length === 0) {
            this.error("I expected a name here.", start);
        }
        return { name: words.join(" "), token: start };
    }
    parseParameters(end) {
        const params = [];
        while (!this.atEnd()) {
            if (end === "colon" ? this.isKind("colon") : this.isWord("that"))
                break;
            const token = this.peek();
            const words = [];
            while (true) {
                const next = this.peek();
                if (next.kind === "colon" ||
                    next.kind === "newline" ||
                    next.kind === "eof" ||
                    next.kind === "comma" ||
                    (next.kind === "word" &&
                        (next.lower === "and" ||
                            next.lower === "default" ||
                            (end === "that" && next.lower === "that")))) {
                    break;
                }
                if (next.kind !== "word")
                    break;
                words.push(next.text);
                this.pos += 1;
            }
            if (words.length === 0) {
                this.error("I expected a name for the parameter.", token);
            }
            let defaultValue;
            if (this.matchWord("default")) {
                defaultValue = this.parseComparison(() => this.isKind("comma") || this.isWord("and") || this.isKind("colon") || this.isWord("that"));
            }
            params.push({ name: words.join(" "), defaultValue, token });
            if (this.matchKind("comma") || this.matchWord("and"))
                continue;
            break;
        }
        return params;
    }
    expectLineEnd() {
        if (this.isKind("newline")) {
            this.pos += 1;
            return;
        }
        if (this.atEnd())
            return;
        const token = this.peek();
        this.error(`I didn't expect ${tokenText(token)} here.`, token, "Put each statement on its own line, or remove the extra words.");
    }
    parseBlockBody(isEnd) {
        const body = [];
        this.skipNewlines();
        while (!this.atEnd() && !isEnd()) {
            if (this.isWord("end") || this.isWord("otherwise"))
                break;
            body.push(this.parseStatement());
            this.expectLineEnd();
            this.skipNewlines();
        }
        return body;
    }
    // ---------------------------------------------------------------- expressions
    parseExpression(stop) {
        return this.parseOr(stop);
    }
    parseOr(stop) {
        let left = this.parseAnd(stop);
        while (!stop?.() && this.isWord("or")) {
            const token = this.peek();
            this.pos += 1;
            const right = this.parseAnd(stop);
            left = { kind: "binary", operator: "or", left, right, token };
        }
        return left;
    }
    parseAnd(stop) {
        let left = this.parseNot(stop);
        while (!stop?.() && this.isWord("and")) {
            const token = this.peek();
            this.pos += 1;
            const right = this.parseNot(stop);
            left = { kind: "binary", operator: "and", left, right, token };
        }
        return left;
    }
    parseNot(stop) {
        if (!stop?.() && this.isWord("not")) {
            const token = this.peek();
            this.pos += 1;
            const operand = this.parseNot(stop);
            return { kind: "unary", operator: "not", operand, token };
        }
        return this.parseComparison(stop);
    }
    parseComparison(stop) {
        const startToken = this.peek();
        const left = this.parseAdditive(stop);
        if (stop?.())
            return left;
        let operator = null;
        let right = [];
        let opToken = startToken;
        if (this.isWord("is")) {
            opToken = this.peek();
            this.pos += 1;
            let negated = false;
            if (this.isWord("not")) {
                this.pos += 1;
                negated = true;
            }
            if (this.isWord("empty")) {
                this.pos += 1;
                operator = negated ? "is not empty" : "is empty";
            }
            else if (this.isWord("greater")) {
                if (negated) {
                    this.error('Write "not (a is greater than b)" instead.', opToken);
                }
                this.pos += 1;
                this.expectWord("than", 'I expected "than" here.');
                right = [this.parseAdditive(stop)];
                operator = "greater than";
            }
            else if (this.isWord("less")) {
                if (negated) {
                    this.error('Write "not (a is less than b)" instead.', opToken);
                }
                this.pos += 1;
                this.expectWord("than", 'I expected "than" here.');
                right = [this.parseAdditive(stop)];
                operator = "less than";
            }
            else if (this.isWord("at")) {
                if (negated) {
                    this.error('Write "not (a is at least b)" instead.', opToken);
                }
                this.pos += 1;
                if (this.matchWord("least"))
                    operator = "at least";
                else if (this.matchWord("most"))
                    operator = "at most";
                else
                    this.error('I expected "at least" or "at most" here.', this.peek());
                right = [this.parseAdditive(stop)];
            }
            else if (this.isWord("between")) {
                if (negated) {
                    this.error('Write "not (a is between b and c)" instead.', opToken);
                }
                this.pos += 1;
                const low = this.parseAdditive(stop);
                this.expectWord("and", 'I expected "and" between the two ends of "is between".');
                const high = this.parseAdditive(stop);
                right = [low, high];
                operator = "between";
            }
            else {
                right = [this.parseAdditive(stop)];
                operator = negated ? "is not" : "is";
            }
        }
        else if (this.isWord("contains")) {
            opToken = this.peek();
            this.pos += 1;
            right = [this.parseAdditive(stop)];
            operator = "contains";
        }
        else if (this.isWord("starts")) {
            opToken = this.peek();
            this.pos += 1;
            this.expectWord("with", 'I expected "with" in "starts with".');
            right = [this.parseAdditive(stop)];
            operator = "starts with";
        }
        else if (this.isWord("ends")) {
            opToken = this.peek();
            this.pos += 1;
            this.expectWord("with", 'I expected "with" in "ends with".');
            right = [this.parseAdditive(stop)];
            operator = "ends with";
        }
        if (operator === null)
            return left;
        if (this.isComparisonStart()) {
            const chainToken = this.peek();
            this.error("Comparisons cannot be chained like this.", chainToken, 'Join two comparisons with "and", as in "age is at least 13 and age is at most 19".');
        }
        return { kind: "comparison", operator, left, right, token: opToken };
    }
    isComparisonStart() {
        return (this.isWord("is") ||
            this.isWord("contains") ||
            (this.isWord("starts") && this.isWord("with", 1)) ||
            (this.isWord("ends") && this.isWord("with", 1)));
    }
    parseAdditive(stop) {
        let left = this.parseMultiplicative(stop);
        while (!stop?.() && (this.isWord("plus") || this.isWord("minus"))) {
            const token = this.peek();
            const operator = token.lower;
            this.pos += 1;
            const right = this.parseMultiplicative(stop);
            left = { kind: "binary", operator, left, right, token };
        }
        return left;
    }
    parseMultiplicative(stop) {
        let left = this.parseUnary(stop);
        while (!stop?.() &&
            (this.isWord("times") || this.isWord("divided") || this.isWord("remainder"))) {
            const token = this.peek();
            let operator;
            if (token.lower === "times") {
                operator = "times";
                this.pos += 1;
            }
            else if (token.lower === "divided") {
                operator = "divided by";
                this.pos += 1;
                this.expectWord("by", 'I expected "by" in "divided by".');
            }
            else {
                operator = "remainder";
                this.pos += 1;
            }
            const right = this.parseUnary(stop);
            left = { kind: "binary", operator, left, right, token };
        }
        return left;
    }
    parseUnary(stop) {
        if (!stop?.() && this.isWord("minus")) {
            const token = this.peek();
            this.pos += 1;
            const operand = this.parseUnary(stop);
            return { kind: "unary", operator: "minus", operand, token };
        }
        return this.parsePostfix(stop);
    }
    parsePostfix(stop) {
        let expression = this.parsePrimary(stop);
        while (this.isKind("property")) {
            const token = this.peek();
            this.pos += 1;
            const key = this.parsePropertyKey();
            expression = { kind: "property", base: expression, key, token };
        }
        return expression;
    }
    parsePrimary(_stop) {
        const token = this.peek();
        if (token.kind === "number") {
            this.pos += 1;
            return { kind: "number", value: Number(token.value), token };
        }
        if (token.kind === "text") {
            this.pos += 1;
            return { kind: "text", value: String(token.value), token };
        }
        if (token.kind === "lparen") {
            this.pos += 1;
            const expression = this.parseExpression();
            this.expectKind("rparen", 'I expected ")" to close the group.');
            return expression;
        }
        if (token.kind === "hex") {
            this.error("Colors only make sense in a style block.", token, 'Use a color such as "blue" in a style, or put the color in quotes if it is text.');
        }
        const builtin = this.tryParseBuiltin();
        if (builtin)
            return builtin;
        const match = matchNameAt(this.names, this.tokens, this.pos);
        if (match) {
            const nameToken = this.peek();
            this.pos += match.count;
            const functionInfo = this.names.functions.get(match.name);
            if (functionInfo) {
                if (this.canStartExpression()) {
                    const args = this.parseArguments();
                    return { kind: "call", name: match.name, args, token: nameToken };
                }
                if (functionInfo.paramCount === 0) {
                    return { kind: "call", name: match.name, args: [], token: nameToken };
                }
                return { kind: "function-ref", name: match.name, token: nameToken };
            }
            return { kind: "variable", name: match.name, token: nameToken };
        }
        if (token.kind === "word") {
            switch (token.lower) {
                case "yes":
                case "no":
                    this.pos += 1;
                    return { kind: "boolean", value: token.lower === "yes", token };
                case "nothing":
                    this.pos += 1;
                    return { kind: "nothing", token };
                case "call": {
                    this.pos += 1;
                    const callee = this.parseExpression(() => this.isWord("with"));
                    let args = [];
                    if (this.matchWord("with"))
                        args = this.parseArguments();
                    return { kind: "call-value", callee, args, token };
                }
                case "the": {
                    if (this.isWord("error", 1)) {
                        this.pos += 2;
                        return { kind: "error-ref", token };
                    }
                    if (this.isWord("function", 1)) {
                        this.pos += 2;
                        const name = this.consumeDeclaredOrSingleName();
                        return { kind: "function-ref", name: name.name, token };
                    }
                    break;
                }
                case "a":
                case "an":
                    if (this.isConstructedLiteralStart()) {
                        return this.parseConstructedLiteral();
                    }
                    break;
                default:
                    break;
            }
        }
        // The name pre-scan covers declarations. If a word was never declared, take
        // one word and let the checker explain the problem with a suggestion.
        if (token.kind === "word" && !CLAUSE_WORDS.has(token.lower)) {
            this.pos += 1;
            if (this.canStartExpression()) {
                const args = this.parseArguments();
                return { kind: "call", name: token.text, args, token };
            }
            return { kind: "variable", name: token.text, token };
        }
        this.error(`I expected a value here, but found ${tokenText(token)}.`, token, 'A value can be a number, text in quotes, yes, no, nothing, a name, or an expression.');
    }
    isConstructedLiteralStart() {
        if (this.isWord("an")) {
            return this.isWord("empty", 1) && (this.isWord("list", 2) || this.isWord("table", 2));
        }
        if (!this.isWord("a"))
            return false;
        return ((this.isWord("list", 1) && this.isWord("of", 2)) ||
            (this.isWord("table", 1) && this.isWord("with", 2)) ||
            (this.isWord("empty", 1) && (this.isWord("list", 2) || this.isWord("table", 2))) ||
            this.isWord("function", 1) ||
            this.isWord("new", 1));
    }
    consumeDeclaredOrSingleName() {
        const match = matchNameAt(this.names, this.tokens, this.pos);
        if (match) {
            const token = this.peek();
            this.pos += match.count;
            return { name: match.name, token };
        }
        const token = this.peek();
        if (token.kind === "word") {
            this.pos += 1;
            return { name: token.text, token };
        }
        this.error("I expected a function name here.", token);
    }
    parseConstructedLiteral() {
        const token = this.peek();
        if (this.isWord("list", 1) && this.isWord("of", 2)) {
            this.pos += 3;
            const items = [this.parseComparison()];
            while (this.matchKind("comma") || this.matchWord("and")) {
                items.push(this.parseComparison());
            }
            return { kind: "list", items, token };
        }
        if (this.isWord("empty", 1) && this.isWord("list", 2)) {
            this.pos += 3;
            return { kind: "list", items: [], token };
        }
        if (this.isWord("table", 1) && this.isWord("with", 2)) {
            this.pos += 3;
            const entries = this.parseTableEntries();
            return { kind: "table", entries, token };
        }
        if (this.isWord("empty", 1) && this.isWord("table", 2)) {
            this.pos += 3;
            return { kind: "table", entries: [], token };
        }
        if (this.isWord("function", 1)) {
            this.pos += 2;
            return this.parseFunctionLiteral(token);
        }
        if (this.isWord("new", 1)) {
            this.pos += 2;
            const kindName = this.parseNameUntil(new Set(["with"])).name;
            let entries = [];
            if (this.matchWord("with"))
                entries = this.parseTableEntries();
            return { kind: "new", kindName, entries, token };
        }
        this.error("I expected a value after \"a\".", token, 'Try "a list of ...", "a table with ...", or "a new ...".');
    }
    parseFunctionLiteral(token) {
        let params = [];
        if (this.matchWord("with")) {
            params = this.parseParameters("that");
        }
        this.expectWord("that", 'I expected "that" after the function parameters.');
        if (this.isWord("gives") && this.isWord("back", 1)) {
            this.pos += 2;
            const expressionBody = this.parseExpression();
            return { kind: "function", params, body: [], expressionBody, token };
        }
        if (this.isWord("does")) {
            this.pos += 1;
            this.expectKind("colon", 'I expected ":" after "that does".');
            const body = this.parseBlockBody(() => this.isWord("end"));
            this.expectWord("end", 'I expected "end" to close this function.');
            return { kind: "function", params, body, token };
        }
        this.error('I expected "that gives back" or "that does:" here.', this.peek());
    }
    parseTableEntries() {
        const entries = [];
        while (true) {
            const keyToken = this.peek();
            let key;
            if (keyToken.kind === "text") {
                key = String(keyToken.value);
                this.pos += 1;
            }
            else if (keyToken.kind === "word") {
                key = keyToken.text;
                this.pos += 1;
            }
            else {
                this.error("I expected a key here.", keyToken, 'Use a single-word key, or quote a key with spaces.');
            }
            const value = this.parseComparison();
            entries.push({ key, value, token: keyToken });
            if (this.matchKind("comma"))
                continue;
            break;
        }
        return entries;
    }
    parseArguments() {
        const args = [this.parseComparison()];
        while (this.matchKind("comma") || this.matchWord("and")) {
            args.push(this.parseComparison());
        }
        return args;
    }
    canStartExpression() {
        const token = this.peek();
        if (token.kind === "number" || token.kind === "text" || token.kind === "lparen" || token.kind === "hex") {
            return true;
        }
        if (token.kind !== "word")
            return false;
        if (token.lower === "not" || token.lower === "minus")
            return true;
        if (CLAUSE_WORDS.has(token.lower))
            return false;
        return true;
    }
    // --------------------------------------------------------------- built-ins
    tryParseBuiltin() {
        const start = this.pos;
        const fail = () => {
            this.pos = start;
            return null;
        };
        const token = this.peek();
        if (token.kind !== "word")
            return null;
        // random number from A to B | random item of L | random decimal
        if (token.lower === "random") {
            if (this.isWord("number", 1) && this.isWord("from", 2)) {
                this.pos += 3;
                const from = this.parseAdditive();
                this.expectWord("to", 'I expected "to" in "random number from 1 to 10".');
                const to = this.parseAdditive();
                return { kind: "builtin", name: "random number", args: [from, to], token };
            }
            if (this.isWord("item", 1) && this.isWord("of", 2)) {
                this.pos += 3;
                const list = this.parseAdditive();
                return { kind: "builtin", name: "random item", args: [list], token };
            }
            if (this.isWord("decimal", 1)) {
                this.pos += 2;
                return { kind: "builtin", name: "random decimal", args: [], token };
            }
            return fail();
        }
        if (UNARY_BUILTINS.has(token.lower) && this.isWord("of", 1)) {
            this.pos += 2;
            const value = this.parseAdditive();
            return { kind: "builtin", name: token.lower, args: [value], token };
        }
        if (this.isWord("absolute") && this.isWord("value", 1) && this.isWord("of", 2)) {
            this.pos += 3;
            return { kind: "builtin", name: "absolute value", args: [this.parseAdditive()], token };
        }
        if (this.isWord("square") && this.isWord("root", 1) && this.isWord("of", 2)) {
            this.pos += 3;
            return { kind: "builtin", name: "square root", args: [this.parseAdditive()], token };
        }
        if (this.isWord("number") && this.isWord("from", 1)) {
            this.pos += 2;
            return { kind: "builtin", name: "number from", args: [this.parseAdditive()], token };
        }
        if (token.lower === "json" && this.isWord("of", 1)) {
            this.pos += 2;
            return { kind: "builtin", name: "JSON of", args: [this.parseAdditive()], token };
        }
        if (this.isWord("data") && this.isWord("from", 1) && this.isWord("json", 2)) {
            this.pos += 3;
            return { kind: "builtin", name: "data from JSON", args: [this.parseAdditive()], token };
        }
        if (this.isWord("item") && !this.isWord("of", 1)) {
            this.pos += 1;
            // In "item round of answers" the word "of" belongs to "item", so a
            // variable named "round" is the position even though "round of" is
            // also a built-in phrase.
            const bare = matchNameAt(this.names, this.tokens, this.pos);
            let index;
            if (bare &&
                this.names.variables.has(bare.name) &&
                this.tokens[this.pos + bare.count]?.lower === "of") {
                const nameToken = this.peek();
                this.pos += bare.count;
                index = { kind: "variable", name: bare.name, token: nameToken };
            }
            else {
                index = this.parseAdditive();
            }
            this.expectWord("of", 'I expected "of" in "item 2 of list".');
            const list = this.parseAdditive();
            return { kind: "builtin", name: "item", args: [index, list], token };
        }
        if (this.isWord("last") && this.isWord("item", 1) && this.isWord("of", 2)) {
            this.pos += 3;
            return { kind: "builtin", name: "last item", args: [this.parseAdditive()], token };
        }
        if ((this.isWord("minimum") || this.isWord("maximum") || this.isWord("power")) &&
            this.isWord("of", 1)) {
            const name = token.lower;
            this.pos += 2;
            const a = this.parseAdditive();
            this.expectWord("and", `I expected "and" in "${name} of a and b".`);
            const b = this.parseAdditive();
            return { kind: "builtin", name, args: [a, b], token };
        }
        if (this.isWord("split") && !this.isWord("of", 1)) {
            this.pos += 1;
            const text = this.parseAdditive();
            this.expectWord("by", 'I expected "by" in "split text by separator".');
            const separator = this.parseAdditive();
            return { kind: "builtin", name: "split", args: [text, separator], token };
        }
        if (this.isWord("join") && !this.isWord("of", 1)) {
            this.pos += 1;
            const list = this.parseAdditive();
            this.expectWord("with", 'I expected "with" in "join list with separator".');
            const separator = this.parseAdditive();
            return { kind: "builtin", name: "join", args: [list, separator], token };
        }
        if (this.isWord("replace")) {
            this.pos += 1;
            const find = this.parseAdditive();
            this.expectWord("with", 'I expected "with" in "replace a with b in text".');
            const replacement = this.parseAdditive();
            this.expectWord("in", 'I expected "in" in "replace a with b in text".');
            const text = this.parseAdditive();
            return { kind: "builtin", name: "replace", args: [find, replacement, text], token };
        }
        if (this.isWord("position") && this.isWord("of", 1)) {
            this.pos += 2;
            const find = this.parseAdditive();
            this.expectWord("in", 'I expected "in" in "position of a in text".');
            const text = this.parseAdditive();
            return { kind: "builtin", name: "position", args: [find, text], token };
        }
        if (this.isWord("format") && this.isWord("of", 1)) {
            this.pos += 2;
            const time = this.parseAdditive();
            this.expectWord("with", 'I expected "with" in "format of time with pattern".');
            const pattern = this.parseAdditive();
            return { kind: "builtin", name: "format", args: [time, pattern], token };
        }
        if (this.isWord("value") && this.isWord("of", 1)) {
            this.pos += 2;
            return { kind: "builtin", name: "value of", args: [this.parseAdditive()], token };
        }
        if (this.isWord("key") && this.peek(1).kind === "text") {
            this.pos += 1;
            const keyToken = this.peek();
            this.pos += 1;
            this.expectWord("is", 'I expected "is pressed" after the key name.');
            this.expectWord("pressed", 'I expected "is pressed" after the key name.');
            return {
                kind: "builtin",
                name: "key pressed",
                args: [{ kind: "text", value: String(keyToken.value), token: keyToken }],
                token,
            };
        }
        if (token.lower === "now" || token.lower === "today") {
            this.pos += 1;
            return { kind: "builtin", name: token.lower, args: [], token };
        }
        if (token.lower === "pi") {
            this.pos += 1;
            return { kind: "builtin", name: "pi", args: [], token };
        }
        if (token.lower === "e") {
            this.pos += 1;
            return { kind: "builtin", name: "e", args: [], token };
        }
        if (this.isWord("file")) {
            const save = this.pos;
            this.pos += 1;
            const path = this.parseAdditive();
            if (this.matchWord("exists")) {
                return { kind: "builtin", name: "file exists", args: [path], token };
            }
            this.pos = save;
        }
        return null;
    }
    // ------------------------------------------------------------------ helpers
    findWordOnLine(word, last) {
        let depth = 0;
        let found = -1;
        for (let i = this.pos; i < this.tokens.length; i += 1) {
            const token = this.tokens[i];
            if (token.kind === "newline" || token.kind === "eof")
                break;
            if (token.kind === "lparen")
                depth += 1;
            else if (token.kind === "rparen")
                depth = Math.max(0, depth - 1);
            else if (depth === 0 && token.kind === "word" && token.lower === word) {
                found = i;
                if (!last)
                    return i;
            }
        }
        return found;
    }
    skipNewlines() {
        while (this.isKind("newline"))
            this.pos += 1;
    }
    atEnd() {
        return this.peek().kind === "eof";
    }
    peek(offset = 0) {
        return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
    }
    isKind(kind, offset = 0) {
        return this.peek(offset).kind === kind;
    }
    matchKind(kind) {
        if (this.isKind(kind)) {
            this.pos += 1;
            return true;
        }
        return false;
    }
    expectKind(kind, message) {
        const token = this.peek();
        if (token.kind === kind) {
            this.pos += 1;
            return token;
        }
        this.error(message, token);
    }
    isWord(word, offset = 0) {
        const token = this.peek(offset);
        return token.kind === "word" && token.lower === word.toLowerCase();
    }
    matchWord(word) {
        if (this.isWord(word)) {
            this.pos += 1;
            return true;
        }
        return false;
    }
    expectWord(word, message, suggestion) {
        const token = this.peek();
        if (token.kind === "word" && token.lower === word.toLowerCase()) {
            this.pos += 1;
            return token;
        }
        this.error(message ?? `I expected "${word}" here.`, token, suggestion);
    }
    isPhrase(words, offset = 0) {
        return words.every((word, index) => this.isWord(word, offset + index));
    }
    matchPhrase(words) {
        if (this.isPhrase(words)) {
            this.pos += words.length;
            return true;
        }
        return false;
    }
    expectPhrase(words, message) {
        if (!this.matchPhrase(words)) {
            this.error(message, this.peek());
        }
    }
    error(message, token, suggestion, hint) {
        throw new ParseError(new Diagnostic(message, spanFromToken(token), suggestion, hint));
    }
}
//# sourceMappingURL=parser.js.map