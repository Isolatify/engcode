import test from "node:test";
import assert from "node:assert/strict";
import { Diagnostic, makeSource, renderDiagnostic } from "../src/diagnostics.js";
test("renders a headline, source line, caret, and suggestion", () => {
    const text = 'set total to "ten" minus 2';
    const source = makeSource("budget.eng", text);
    const diagnostic = new Diagnostic("I can't subtract from text.", { file: source, line: 1, column: 15, length: 5 }, "set total to 10 minus 2");
    const rendered = renderDiagnostic(diagnostic);
    assert.match(rendered, /Oops — line 1 of budget\.eng/);
    assert.match(rendered, /1 \| set total to "ten" minus 2/);
    assert.match(rendered, /\^+/);
    assert.match(rendered, /I can't subtract from text\./);
    assert.match(rendered, /Try this:/);
    assert.match(rendered, /set total to 10 minus 2/);
});
test("aligns the caret on a later line", () => {
    const text = 'say "one"\nsay "two"';
    const source = makeSource("demo.eng", text);
    const diagnostic = new Diagnostic("Test message.", {
        file: source,
        line: 2,
        column: 1,
        length: 3,
    });
    const lines = renderDiagnostic(diagnostic).split("\n");
    assert.equal(lines[0], "Oops — line 2 of demo.eng");
    assert.equal(lines[2], "  2 | say \"two\"");
    assert.equal(lines[3], "      ^^^");
});
test("handles diagnostics without a span", () => {
    const rendered = renderDiagnostic(new Diagnostic("Something went wrong."));
    assert.equal(rendered, "Oops\n\nSomething went wrong.");
});
//# sourceMappingURL=diagnostics.test.js.map