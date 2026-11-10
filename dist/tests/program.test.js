import test from "node:test";
import assert from "node:assert/strict";
import { analyze, looksLikeApp } from "../src/program.js";
test("analyze reports a lexer error without throwing", () => {
    const analysis = analyze("test.eng", 'say "unclosed');
    assert.equal(analysis.diagnostics.length, 1);
    assert.match(analysis.diagnostics[0].message, /closing quote/);
    assert.equal(analysis.tokens.length, 0);
});
test("analyze reports a parser error without throwing", () => {
    const analysis = analyze("test.eng", 'say "hi"\nend');
    assert.equal(analysis.diagnostics.length, 1);
    assert.match(analysis.diagnostics[0].message, /extra "end"/);
    assert.ok(analysis.names);
    assert.equal(analysis.program, undefined);
});
test("analyze returns a checked program for valid input", () => {
    const analysis = analyze("test.eng", 'say "hi"');
    assert.deepEqual(analysis.diagnostics, []);
    assert.ok(analysis.program);
    assert.ok(analysis.names);
});
test("detects app files", () => {
    assert.equal(looksLikeApp('app "Demo":'), true);
    assert.equal(looksLikeApp("  app :"), true);
    assert.equal(looksLikeApp('say "app"'), false);
    assert.equal(looksLikeApp("apply 1"), false);
});
//# sourceMappingURL=program.test.js.map