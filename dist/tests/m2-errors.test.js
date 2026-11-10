import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { RuntimeError } from "../src/diagnostics.js";
import { parse, runProgram, runSource } from "./helpers.js";
function runtimeError(source, pattern) {
    assert.throws(() => runProgram(parse(source)), (error) => error instanceof RuntimeError && pattern.test(error.diagnostic.message));
}
function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "engcode-errors-"));
}
const dog = [
    "define a kind of thing called Dog:",
    "    it has name",
    "end",
    'set rex to a new Dog with name "Rex"',
].join("\n");
test("count needs two numbers", () => {
    runtimeError('count from "a" to 2:\n    say counter\nend', /needs two numbers/);
});
test("reading a missing file explains the problem", () => {
    assert.throws(() => runSource('read file "missing.txt" and save it as notes', [], () => 0, {
        fileRoot: tempDir(),
    }), (error) => error instanceof RuntimeError && /could not read the file/.test(error.diagnostic.message));
});
test("listing a missing folder explains the problem", () => {
    assert.throws(() => runSource('list files in "missing" and save it as names', [], () => 0, {
        fileRoot: tempDir(),
    }), (error) => error instanceof RuntimeError && /could not open the folder/.test(error.diagnostic.message));
});
test("wait refuses a negative number", () => {
    runtimeError("wait -1 seconds", /needs a number, 0 or more/);
});
test("setting an unknown object field fails", () => {
    assert.throws(() => runProgram(parse(`${dog}\nset rex's color to "brown"`)), (error) => error instanceof RuntimeError && /does not have a field called "color"/.test(error.diagnostic.message));
});
test("setting a property on text fails", () => {
    runtimeError('set name to "Sam"\nset name\'s size to 2', /only set a property on a table or object/);
});
test("reading a property from a number fails", () => {
    runtimeError("set n to 5\nsay n's size", /only read a property from a table or object/);
});
test("calling a number fails with a friendly message", () => {
    runtimeError("set f to 5\ncall f", /can't call a number/);
});
test("plus cannot mix yes or no with a number", () => {
    runtimeError("say yes plus 1", /can't join yes or no and a number/);
});
test("times needs numbers", () => {
    runtimeError('say "a" times 2', /needs numbers on both sides/);
});
test("is empty needs a collection or text", () => {
    runtimeError('if 3 is empty:\n    say "empty"\nend', /needs text, a list, a table, or nothing/);
});
test("is not empty needs a collection or text", () => {
    runtimeError('if 3 is not empty:\n    say "full"\nend', /needs text, a list, a table, or nothing/);
});
test("item positions must be whole numbers", () => {
    runtimeError('say item 1.5 of a list of "a"', /whole-number position/);
});
test("item needs a list or text", () => {
    runtimeError("say item 1 of 5", /needs a list or text/);
});
test("last item needs a list or text", () => {
    runtimeError("say last item of 5", /needs a list or text/);
});
test("year of needs a time value", () => {
    runtimeError("say year of 5", /needs a time value such as now/);
});
test("format of needs a time value", () => {
    runtimeError('say format of 5 with "YYYY"', /needs a time value such as now/);
});
test("a function rejects too many arguments", () => {
    runtimeError("define one with a:\n    give back a\nend\nsay one 1, 2", /takes 1 argument, but 2 were given/);
});
test("a function needs every required argument", () => {
    runtimeError("define one with a:\n    give back a\nend\ncall one", /I need a value for "a"/);
});
test("sort needs a list", () => {
    runtimeError("set n to 3\nsort n", /needs a list/);
});
test("reverse needs a list or text", () => {
    runtimeError("set n to 3\nreverse n", /needs a list or text/);
});
test("shuffle needs a list", () => {
    runtimeError("set n to 3\nshuffle n", /needs a list/);
});
test("a damaged device file is treated as empty", () => {
    const directory = tempDir();
    const storage = path.join(directory, ".engcode", "storage.json");
    fs.mkdirSync(path.dirname(storage), { recursive: true });
    fs.writeFileSync(storage, "not json");
    const result = runSource('load "key" from the device and save it as value\nsay value', [], () => 0, {
        fileRoot: directory,
    });
    assert.equal(result.output, "nothing\n");
});
test("bad built-in arguments name the expected type", () => {
    runtimeError("say length of 5", /needs text, a list, or a table/);
    runtimeError('say round of "a"', /expected a number/);
    runtimeError('say random item of "text"', /expected a list/);
    runtimeError('say number from "ten"', /can't read "ten" as a number/);
});
//# sourceMappingURL=m2-errors.test.js.map