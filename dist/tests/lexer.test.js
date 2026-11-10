import test from "node:test";
import assert from "node:assert/strict";
import { Lexer } from "../src/lexer.js";
import { ParseError } from "../src/diagnostics.js";
test("lexes words, numbers, text, and punctuation", () => {
    const tokens = Lexer.lex("test.eng", 'set age to 25\nsay "Hi"');
    assert.equal(tokens[0].kind, "word");
    assert.equal(tokens[0].text, "set");
    assert.equal(tokens[1].text, "age");
    assert.equal(tokens[2].text, "to");
    assert.equal(tokens[3].kind, "number");
    assert.equal(tokens[3].value, 25);
    assert.equal(tokens[4].kind, "newline");
    assert.equal(tokens[5].kind, "word");
    assert.equal(tokens[6].kind, "text");
    assert.equal(tokens[6].value, "Hi");
    assert.equal(tokens[7].kind, "eof");
});
test("keywords are lower-cased but names keep their spelling", () => {
    const tokens = Lexer.lex("test.eng", "SET PlayerScore TO 10");
    assert.equal(tokens[0].lower, "set");
    assert.equal(tokens[1].text, "PlayerScore");
    assert.equal(tokens[1].lower, "playerscore");
});
test("supports string escapes", () => {
    const tokens = Lexer.lex("test.eng", 'say "line\\nquote \\" tab\\t slash\\\\"');
    assert.equal(tokens[1].value, 'line\nquote " tab\t slash\\');
});
test("strips note comments including trailing comments", () => {
    const tokens = Lexer.lex("test.eng", 'say "Hi" note: a greeting\nnote: whole line\nsay "Bye"');
    const texts = tokens.filter((token) => token.kind === "text").map((token) => token.value);
    assert.deepEqual(texts, ["Hi", "Bye"]);
});
test("recognizes the property operator", () => {
    const tokens = Lexer.lex("test.eng", "say person's name");
    assert.equal(tokens[1].kind, "word");
    assert.equal(tokens[2].kind, "property");
    assert.equal(tokens[2].text, "'s");
    assert.equal(tokens[3].text, "name");
});
test("recognizes hex colors", () => {
    const tokens = Lexer.lex("test.eng", "#0f766e #fff");
    assert.equal(tokens[0].kind, "hex");
    assert.equal(tokens[0].text, "#0f766e");
    assert.equal(tokens[1].kind, "hex");
    assert.equal(tokens[1].text, "#fff");
});
test("tracks CRLF line and column positions", () => {
    const tokens = Lexer.lex("test.eng", 'say "a"\r\nset x to 1');
    const setToken = tokens.find((token) => token.kind === "word" && token.text === "set");
    assert.equal(setToken.line, 2);
    assert.equal(setToken.column, 1);
});
test("keeps negative number literals together", () => {
    const tokens = Lexer.lex("test.eng", "set x to -4.5");
    const number = tokens.find((token) => token.kind === "number");
    assert.equal(number.value, -4.5);
});
test("reports a missing closing quote with a friendly message", () => {
    assert.throws(() => Lexer.lex("test.eng", 'say "hello'), (error) => {
        assert.ok(error instanceof ParseError);
        assert.match(error.diagnostic.message, /missing its closing quote/);
        assert.match(error.diagnostic.hint ?? "", /Add a/);
        return true;
    });
});
test("reports semicolons and braces with beginner fixes", () => {
    assert.throws(() => Lexer.lex("test.eng", "say 1;"), (error) => error instanceof ParseError && /semicolons/.test(error.diagnostic.message));
    assert.throws(() => Lexer.lex("test.eng", "if yes {"), (error) => error instanceof ParseError && /curly braces/.test(error.diagnostic.message));
});
test("reports an apostrophe that is not 's", () => {
    assert.throws(() => Lexer.lex("test.eng", "say Sam' name"), (error) => error instanceof ParseError && /apostrophe/.test(error.diagnostic.message));
});
test("reports an invalid hex color", () => {
    assert.throws(() => Lexer.lex("test.eng", "#12"), (error) => error instanceof ParseError && /not look like a color/.test(error.diagnostic.message));
});
//# sourceMappingURL=lexer.test.js.map