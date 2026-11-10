export function tokenText(token) {
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
//# sourceMappingURL=tokens.js.map