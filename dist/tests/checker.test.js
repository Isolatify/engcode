import test from "node:test";
import assert from "node:assert/strict";
import { checkText } from "./helpers.js";
test("accepts a valid program", () => {
    const diagnostics = checkText([
        "set total to 0",
        "repeat 3 times:",
        "    change total to total plus 1",
        "end",
        'say "Total: " plus total',
    ].join("\n"));
    assert.deepEqual(diagnostics, []);
});
test("reports an unknown name with a suggestion", () => {
    const diagnostics = checkText('set name to "Sam"\nsay naem');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /don't know the name "naem"/);
    assert.match(diagnostics[0], /Did you mean "name"\?/);
});
test("reports change of an unknown name", () => {
    const diagnostics = checkText("change age to 26");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /don't know the name "age"/);
    assert.match(diagnostics[0], /Use "set" to create it first/);
});
test("reports a function called with too few arguments", () => {
    const diagnostics = checkText(["define add with a and b:", "    give back a plus b", "end", "say add 2"].join("\n"));
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /needs 1 more argument/);
});
test("reports a function called with too many arguments", () => {
    const diagnostics = checkText(["define greet with name:", '    say "Hi " plus name', "end", 'greet "a" and "b"'].join("\n"));
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /takes 1 argument, but 2 were given/);
});
test("reports give back outside a function", () => {
    const diagnostics = checkText("give back 5");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /needs to be inside a function/);
});
test("reports stop outside a loop", () => {
    const diagnostics = checkText("stop the loop");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /needs to be inside a loop/);
});
test("reports a non-boolean condition", () => {
    const diagnostics = checkText("set count to 3\nif count:\n    say 1\nend");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /condition must be yes or no/);
    assert.match(diagnostics[0], /does not treat other values/);
});
test("reports text in arithmetic", () => {
    const diagnostics = checkText('set total to "ten" minus 2');
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /minus.*needs a number/);
});
test("reports a block-scoped name used outside its block", () => {
    const diagnostics = checkText("if yes:\n    set inner to 1\nend\nsay inner");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /don't know the name "inner"/);
});
test("allows set inside a block to update an outer name", () => {
    const diagnostics = checkText("set x to 1\nif yes:\n    set x to 2\nend\nsay x");
    assert.deepEqual(diagnostics, []);
});
test("allows recursion inside a function", () => {
    const diagnostics = checkText([
        "define countdown with n:",
        "    if n is greater than 0:",
        '        say "tick"',
        "        countdown n minus 1",
        "    end",
        "end",
        "countdown 3",
    ].join("\n"));
    assert.deepEqual(diagnostics, []);
});
test("allows function bodies to use top-level names declared later", () => {
    const diagnostics = checkText(["define show with score:", "    say score", "end", "set high score to 10", "show high score"].join("\n"));
    assert.deepEqual(diagnostics, []);
});
test("reports contains on a number", () => {
    const diagnostics = checkText("if 5 contains 1:\n    say 1\nend");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /contains.*needs text, a list, or a table/);
});
test("reports the error value outside a failure block", () => {
    const diagnostics = checkText("say the error");
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /only works inside "if it fails"/);
});
test("allows the error value inside a failure block", () => {
    const diagnostics = checkText(["try:", "    set x to 1 divided by 0", "if it fails:", "    say the error", "end"].join("\n"));
    assert.deepEqual(diagnostics, []);
});
//# sourceMappingURL=checker.test.js.map