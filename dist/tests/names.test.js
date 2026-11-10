import test from "node:test";
import assert from "node:assert/strict";
import { prescanNames, matchNameAt, isHardDelimiter } from "../src/names.js";
import { lex } from "./helpers.js";
test("collects multi-word names declared with set", () => {
    const names = prescanNames(lex("set player score to 0\nset is happy to yes"));
    assert.ok(names.variables.has("player score"));
    assert.ok(names.variables.has("is happy"));
    assert.equal(names.words.get("player score"), 2);
});
test("collects names that look like keywords", () => {
    const names = prescanNames(lex("set nothing here to nothing\nsay nothing here"));
    assert.ok(names.variables.has("nothing here"));
});
test("collects function names and parameter names", () => {
    const names = prescanNames(lex('define welcome with first name and last name default "Doe":\n    say first name\nend'));
    assert.ok(names.functions.has("welcome"));
    assert.equal(names.functions.get("welcome").paramCount, 2);
    assert.equal(names.functions.get("welcome").requiredCount, 1);
    assert.ok(names.variables.has("first name"));
    assert.ok(names.variables.has("last name"));
});
test("collects loop, ask, count, and state names", () => {
    const names = prescanNames(lex([
        "for each big item in items:",
        "    ask \"Name?\" and save it as full name",
        "    count from 1 to 3 as step number:",
        "        say step number",
        "    end",
        "end",
        "keep track of high score as 0",
    ].join("\n")));
    assert.ok(names.variables.has("big item"));
    assert.ok(names.variables.has("full name"));
    assert.ok(names.variables.has("step number"));
    assert.ok(names.variables.has("high score"));
});
test("collects add and remove targets", () => {
    const names = prescanNames(lex('add 5 to player score\nremove "x" from task list'));
    assert.ok(names.variables.has("player score"));
    assert.ok(names.variables.has("task list"));
});
test("sorts names longest first", () => {
    const names = prescanNames(lex("set is happy to yes\nset a to 1\nset big player score to 2"));
    assert.equal(names.all[0], "big player score");
    const happyIndex = names.all.indexOf("is happy");
    const aIndex = names.all.indexOf("a");
    assert.ok(happyIndex < aIndex);
});
test("matches the longest declared name at a position", () => {
    const tokens = lex("set is happy to yes\nif is happy is yes:\n    say 1\nend");
    const names = prescanNames(tokens);
    const ifIndex = tokens.findIndex((token) => token.kind === "word" && token.text === "if");
    const match = matchNameAt(names, tokens, ifIndex + 1);
    assert.equal(match?.name, "is happy");
    assert.equal(match?.count, 2);
});
test("knows the hard delimiters", () => {
    assert.equal(isHardDelimiter("to"), true);
    assert.equal(isHardDelimiter("from"), true);
    assert.equal(isHardDelimiter("that"), true);
    assert.equal(isHardDelimiter("is"), false);
    assert.equal(isHardDelimiter("nothing"), false);
});
//# sourceMappingURL=names.test.js.map