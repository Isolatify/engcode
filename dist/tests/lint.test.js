import test from "node:test";
import assert from "node:assert/strict";
import { lintSource } from "../src/lint.js";
function messages(source) {
    return lintSource("test.eng", source).map((diagnostic) => diagnostic.message);
}
test("lint is quiet for a small clear program", () => {
    assert.deepEqual(messages(['set name to "Sam"', 'say "Hello, " plus name'].join("\n")), []);
});
test("lint warns about names ending in an operator word", () => {
    const notes = messages(["set score plus to 1", "say score plus"].join("\n"));
    assert.ok(notes.some((note) => note.includes('ends with the operator word "plus"')));
});
test("lint warns about unused names", () => {
    const notes = messages(['set name to "Sam"', 'say "Hello"'].join("\n"));
    assert.ok(notes.some((note) => note.includes('"name" is set but never used')));
});
test("lint warns about shadowing a built-in", () => {
    const notes = messages(["set text to 1", "say text"].join("\n"));
    assert.ok(notes.some((note) => note.includes("also a built-in phrase")));
});
test("lint warns about tabs, long lines, TODO notes, and empty blocks", () => {
    const notes = messages([
        "\tsay \"tabbed\"",
        'say "' + "x".repeat(140) + '"',
        "note: TODO finish this",
        "if yes:",
        "end",
    ].join("\n"));
    assert.ok(notes.some((note) => note.includes("indented with a tab")));
    assert.ok(notes.some((note) => note.includes("characters long")));
    assert.ok(notes.some((note) => note.includes("TODO note")));
    assert.ok(notes.some((note) => note.includes("block is empty")));
});
test("lint reports capability usage as warnings", () => {
    const file = messages(['write "hi" to file "note.txt"', "read file \"note.txt\" and save it as text", 'say "ok"'].join("\n"));
    assert.ok(file.some((note) => note.includes("use project files")));
    const network = messages(['get data from "https://example.com" and save it as reply', "say reply"].join("\n"));
    assert.ok(network.some((note) => note.includes("use the network")));
    const storage = messages(['save "blue" to the device as "colour"', 'load "colour" from the device and save it as colour', "say colour"].join("\n"));
    assert.ok(storage.some((note) => note.includes("use device storage")));
});
test("lint ignores unreadable source", () => {
    assert.deepEqual(messages('say "unclosed'), []);
});
//# sourceMappingURL=lint.test.js.map