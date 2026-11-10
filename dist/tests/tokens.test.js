import test from "node:test";
import assert from "node:assert/strict";
import { Lexer } from "../src/lexer.js";
import { tokenText } from "../src/tokens.js";
test("describes every token kind for error messages", () => {
    const tokens = Lexer.lex("test.eng", 'say "hi", (x)\n: person\'s 5');
    const byKind = (kind) => tokens.find((token) => token.kind === kind);
    assert.equal(tokenText(byKind("newline")), "the end of the line");
    assert.equal(tokenText(byKind("eof")), "the end of the file");
    assert.equal(tokenText(byKind("text")), '"hi"');
    assert.equal(tokenText(byKind("comma")), '","');
    assert.equal(tokenText(byKind("lparen")), '"("');
    assert.equal(tokenText(byKind("rparen")), '")"');
    assert.equal(tokenText(byKind("property")), "'s");
    assert.equal(tokenText(byKind("colon")), '":"');
    assert.equal(tokenText(byKind("number")), '"5"');
    assert.equal(tokenText(byKind("word")), '"say"');
});
//# sourceMappingURL=tokens.test.js.map