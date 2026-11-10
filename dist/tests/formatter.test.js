import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectEngFiles, formatFile, formatSource } from "../src/formatter.js";
test("formatter indents blocks with four spaces", () => {
    const source = [
        'app "Demo":',
        'page "Home":',
        'heading "Hi"',
        "end",
        "end",
    ].join("\n");
    assert.equal(formatSource(source), ['app "Demo":', '    page "Home":', '        heading "Hi"', "    end", "end", ""].join("\n"));
});
test("formatter is idempotent", () => {
    const source = [
        "set  total   to  0",
        "repeat 3 times:",
        'say "Hello:"',
        "change total to total plus 1",
        "end",
    ].join("\n");
    const once = formatSource(source);
    const twice = formatSource(once);
    assert.equal(once, twice);
});
test("formatter keeps text and notes exactly", () => {
    const source = [
        'say "two  spaces and a colon:"',
        "note: keep   this   spacing and this:",
    ].join("\n");
    const formatted = formatSource(source);
    assert.match(formatted, /two  spaces and a colon:/);
    assert.match(formatted, /note: keep   this   spacing and this:/);
});
test("formatter lower-cases statement keywords but not names", () => {
    const formatted = formatSource(["Say \"Hi\"", "Set My Name to \"Sam\"", "say My Name"].join("\n"));
    assert.equal(formatted, ['say "Hi"', 'set My Name to "Sam"', "say My Name", ""].join("\n"));
});
test("formatter trims trailing spaces and collapses blank lines", () => {
    const formatted = formatSource(["say \"a\"   ", "", "", "say \"b\"", ""].join("\n"));
    assert.equal(formatted, ['say "a"', "", 'say "b"', ""].join("\n"));
});
test("formatter tidies punctuation without touching strings", () => {
    const formatted = formatSource(['set items to a list of "a" , "b"', 'say item 1 of items'].join("\n"));
    assert.equal(formatted, ['set items to a list of "a", "b"', "say item 1 of items", ""].join("\n"));
});
test("the word end inside a note does not close a block", () => {
    const source = ["if yes:", "    note: end is a word here", '    say "still inside"', "end"].join("\n");
    assert.equal(formatSource(source), ["if yes:", "    note: end is a word here", '    say "still inside"', "end", ""].join("\n"));
});
test("formatFile reports changes and lexer errors", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "engcode-format-"));
    const good = path.join(folder, "good.eng");
    fs.writeFileSync(good, 'Say "hi"   \n');
    const result = formatFile(good);
    assert.equal(result.changed, true);
    assert.equal(result.formatted, 'say "hi"\n');
    const bad = path.join(folder, "bad.eng");
    fs.writeFileSync(bad, 'say "unclosed\n');
    const failed = formatFile(bad);
    assert.ok(failed.error);
    assert.equal(failed.changed, false);
});
test("collectEngFiles walks folders and skips generated output", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "engcode-files-"));
    fs.mkdirSync(path.join(folder, "src"));
    fs.mkdirSync(path.join(folder, ".engcode"));
    fs.writeFileSync(path.join(folder, "main.eng"), "say 1\n");
    fs.writeFileSync(path.join(folder, "src", "helper.eng"), "say 2\n");
    fs.writeFileSync(path.join(folder, ".engcode", "skip.eng"), "say 3\n");
    fs.writeFileSync(path.join(folder, "readme.txt"), "hello\n");
    const files = collectEngFiles(folder).map((file) => path.basename(file));
    assert.deepEqual(files.sort(), ["helper.eng", "main.eng"]);
});
//# sourceMappingURL=formatter.test.js.map