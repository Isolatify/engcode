import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { analyze } from "../src/program.js";
import { Interpreter } from "../src/interpreter.js";
import { checkText, runSource, ScriptedInput } from "./helpers.js";
const dogSource = [
    "define a kind of thing called Dog:",
    "    it has name and age",
    "    it can bark:",
    '        say name plus " says woof"',
    "    end",
    "    it can celebrate:",
    "        change age to age plus 1",
    "    end",
    "    it can years with amount:",
    "        give back age plus amount",
    "    end",
    "end",
    "",
    'set rex to a new Dog with name "Rex", age 3',
    "rex bark",
    "rex celebrate",
    "say rex's age",
    "say call rex's years with 10",
].join("\n");
function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "engcode-m2-"));
}
function runFile(file, input = []) {
    const analysis = analyze(file, fs.readFileSync(file, "utf8"));
    assert.deepEqual(analysis.diagnostics, []);
    assert.ok(analysis.program);
    let output = "";
    const interpreter = new Interpreter({
        write: (chunk) => {
            output += chunk;
        },
        input: new ScriptedInput(input),
        fileRoot: path.dirname(file),
    });
    interpreter.run(analysis.program);
    return output;
}
// ------------------------------------------------------------------- objects
test("objects hold fields and run methods", () => {
    const result = runSource(dogSource);
    assert.equal(result.output, "Rex says woof\n4\n14\n");
});
test("a method can change a field and read it through the object", () => {
    const source = [
        "define a kind of thing called Counter:",
        "    it has value",
        "    it can add with amount:",
        "        change value to value plus amount",
        "    end",
        "end",
        "set counter to a new Counter with value 0",
        "counter add 5",
        "say counter's value",
    ].join("\n");
    assert.equal(runSource(source).output, "5\n");
});
test("it refers to the current object inside a method", () => {
    const source = [
        "define a kind of thing called Cat:",
        "    it has name",
        "    it can introduce:",
        "        say it's name",
        "    end",
        "end",
        'set tom to a new Cat with name "Tom"',
        "tom introduce",
    ].join("\n");
    assert.equal(runSource(source).output, "Tom\n");
});
test("a new object needs every declared field", () => {
    const messages = checkText([
        "define a kind of thing called Dog:",
        "    it has name and age",
        "end",
        'set rex to a new Dog with name "Rex"',
    ].join("\n"));
    assert.ok(messages.some((message) => /needs a value for "age"/.test(message)));
});
test("a new object rejects an unknown field", () => {
    const messages = checkText([
        "define a kind of thing called Dog:",
        "    it has name",
        "end",
        'set rex to a new Dog with name "Rex", color "brown"',
    ].join("\n"));
    assert.ok(messages.some((message) => /does not have a field called "color"/.test(message)));
});
test("an unknown method is reported with the kind name", () => {
    const messages = checkText(`${dogSource}\nrex fly`);
    assert.ok(messages.some((message) => /A Dog does not have a method called "fly"/.test(message)));
});
test("a known method never runs before the kind is declared", () => {
    const source = [
        "set rex to a new Dog with name \"Rex\"",
        "define a kind of thing called Dog:",
        "    it has name",
        "    it can bark:",
        '        say "woof"',
        "    end",
        "end",
        "rex bark",
    ].join("\n");
    assert.equal(runSource(source).output, "woof\n");
});
// ------------------------------------------------------------------- modules
test("modules import functions and run top-level statements once", () => {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "helpers.eng"), ['define greet with who:', '    give back "Hello, " plus who', "end", 'say "helpers loaded"'].join("\n"));
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, ['use "helpers.eng"', "use math", 'say greet "Sam"', 'say greet "Rex"'].join("\n"));
    const output = runFile(main);
    assert.equal(output, "helpers loaded\nHello, Sam\nHello, Rex\n");
});
test("modules can import other modules", () => {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "a.eng"), ['use "b.eng"', "define one:", "    give back 1", "end"].join("\n"));
    fs.writeFileSync(path.join(directory, "b.eng"), ["define two:", "    give back 2", "end"].join("\n"));
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, ['use "a.eng"', "say one plus two"].join("\n"));
    assert.equal(runFile(main), "3\n");
});
test("a module imported twice only runs once", () => {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "shared.eng"), ['say "shared once"', "define value:", "    give back 7", "end"].join("\n"));
    fs.writeFileSync(path.join(directory, "one.eng"), 'use "shared.eng"');
    fs.writeFileSync(path.join(directory, "two.eng"), 'use "shared.eng"');
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, ['use "one.eng"', 'use "two.eng"', "say value"].join("\n"));
    assert.equal(runFile(main), "shared once\n7\n");
});
test("modules with the same name report a collision", () => {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "a.eng"), ["define same:", "    give back 1", "end"].join("\n"));
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, ['use "a.eng"', "define same:", "    give back 2", "end"].join("\n"));
    const analysis = analyze(main, fs.readFileSync(main, "utf8"));
    assert.ok(analysis.diagnostics.some((item) => /"same" is defined in both/.test(item.message)));
});
test("import loops are reported with the chain", () => {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "x.eng"), 'use "y.eng"');
    fs.writeFileSync(path.join(directory, "y.eng"), 'use "x.eng"');
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, 'use "x.eng"');
    const analysis = analyze(main, fs.readFileSync(main, "utf8"));
    assert.ok(analysis.diagnostics.some((item) => /x\.eng → y\.eng → x\.eng/.test(item.message)));
});
test("a missing import has a friendly message", () => {
    const directory = tempDir();
    const main = path.join(directory, "main.eng");
    fs.writeFileSync(main, 'use "gone.eng"');
    const analysis = analyze(main, fs.readFileSync(main, "utf8"));
    assert.ok(analysis.diagnostics.some((item) => /could not find the imported file/.test(item.message)));
});
test("imports outside the project folder are refused", () => {
    const directory = tempDir();
    const project = path.join(directory, "project");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(directory, "outside.eng"), ["define outside:", "    give back 1", "end"].join("\n"));
    const main = path.join(project, "main.eng");
    fs.writeFileSync(main, 'use "../outside.eng"');
    const analysis = analyze(main, fs.readFileSync(main, "utf8"), { root: project });
    assert.ok(analysis.diagnostics.some((item) => /outside the project folder/.test(item.message)));
});
// --------------------------------------------------------------- files/device
test("files can be written, appended, read, listed, and deleted", () => {
    const directory = tempDir();
    const source = [
        'write "hello" to file "notes.txt"',
        'append "more" to file "notes.txt"',
        'read file "notes.txt" and save it as notes',
        "say notes",
        'if file "notes.txt" exists:',
        '    say "found"',
        "end",
        'list files in "." and save it as names',
        'if names contains "notes.txt":',
        '    say "listed"',
        "end",
        'delete file "notes.txt"',
        'if file "notes.txt" exists:',
        '    say "still here"',
        "otherwise:",
        '    say "removed"',
        "end",
    ].join("\n");
    const result = runSource(source, [], () => 0, { fileRoot: directory });
    assert.match(result.output, /hello\nmore\n/);
    assert.match(result.output, /found/);
    assert.match(result.output, /listed/);
    assert.match(result.output, /removed/);
});
test("files cannot escape the project folder", () => {
    const directory = tempDir();
    assert.throws(() => runSource('write "nope" to file "../escape.txt"', [], () => 0, { fileRoot: directory }), /Files must stay inside the project folder/);
});
test("the device remembers values between loads", () => {
    const directory = tempDir();
    const source = [
        'save "blue" to the device as "color"',
        'load "color" from the device and save it as color',
        "say color",
        'delete "color" from the device',
        'load "color" from the device and save it as color',
        "say color",
    ].join("\n");
    const result = runSource(source, [], () => 0, { fileRoot: directory });
    assert.equal(result.output, "blue\nnothing\n");
    assert.ok(fs.existsSync(path.join(directory, ".engcode", "storage.json")));
});
test("wait zero seconds is allowed", () => {
    assert.equal(runSource("wait 0 seconds").output, "");
});
test("e is available as a number", () => {
    assert.match(runSource("say e").output, /^2\.718/);
});
test("network access is off unless asked for", () => {
    assert.throws(() => runSource('get data from "https://example.com" and save it as reply'), /Network access is turned off/);
});
test("network only accepts https addresses", () => {
    assert.throws(() => runSource('get data from "http://example.com" and save it as reply', [], () => 0, {
        allowNetwork: true,
    }), /must start with https:\/\//);
});
// ---------------------------------------------------------------------- REPL
test("repl keeps names and runs multi-line blocks", () => {
    const cli = path.resolve("dist/src/cli.js");
    const input = [
        'set my name to "Sam"',
        'say "Hello, " plus my name',
        "define double with n:",
        "    give back n times 2",
        "end",
        "say double 21",
        ":clear",
        ":quit",
    ].join("\n");
    const result = spawnSync(process.execPath, [cli, "repl"], { input, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Hello, Sam/);
    assert.match(result.stdout, /\b42\b/);
    assert.match(result.stdout, /Cleared\./);
});
//# sourceMappingURL=m2.test.js.map