import test from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../src/diagnostics.js";
import { parse } from "./helpers.js";

function parseError(source: string, pattern: RegExp): void {
  assert.throws(
    () => parse(source),
    (error: unknown) => error instanceof ParseError && pattern.test(error.diagnostic.message),
  );
}

test("parses kinds with fields and methods", () => {
  const program = parse(
    [
      "define a kind of thing called Dog:",
      "    it has name, age",
      "    it can bark:",
      '        say "woof"',
      "    end",
      "    it can add with amount and extra:",
      "        give back amount plus extra",
      "    end",
      "end",
    ].join("\n"),
  );
  const kind = program.body[0] as any;
  assert.equal(kind.kind, "kind");
  assert.equal(kind.name, "Dog");
  assert.deepEqual(
    kind.fields.map((field: any) => field.name),
    ["name", "age"],
  );
  assert.deepEqual(
    kind.methods.map((method: any) => method.name),
    ["bark", "add"],
  );
  assert.deepEqual(
    kind.methods[1].params.map((param: any) => param.name),
    ["amount", "extra"],
  );
});

test("parses method call statements", () => {
  const program = parse(
    [
      "define a kind of thing called Dog:",
      "    it has name",
      "    it can celebrate:",
      '        say "yay"',
      "    end",
      "end",
      'set rex to a new Dog with name "Rex"',
      "rex celebrate",
    ].join("\n"),
  );
  const statement = program.body[2] as any;
  assert.equal(statement.kind, "method-stmt");
  assert.equal(statement.object, "rex");
  assert.equal(statement.method, "celebrate");
  assert.deepEqual(statement.args, []);
});

test("parses file, device, web, and wait statements", () => {
  const program = parse(
    [
      'read file "a.txt" and save it as contents',
      'write "x" to file "a.txt"',
      'append "y" to file "a.txt"',
      'delete file "a.txt"',
      'list files in "." and save it as names',
      "wait 2 seconds",
      'save "v" to the device as "k"',
      'load "k" from the device and save it as value',
      'delete "k" from the device',
      'get data from "https://example.com" and save it as reply',
      'send data "body" to "https://example.com" and save it as reply',
    ].join("\n"),
  );
  assert.deepEqual(
    program.body.map((statement) => statement.kind),
    [
      "read-file",
      "write-file",
      "write-file",
      "delete-file",
      "list-files",
      "wait",
      "save-device",
      "load-device",
      "delete-device",
      "get-data",
      "send-data",
    ],
  );
  assert.equal((program.body[2] as any).append, true);
  assert.equal((program.body[1] as any).append, false);
});

test("parses use statements for paths, libraries, and themes", () => {
  const program = parse(['use "helpers.eng"', "use math", 'use theme "dark"'].join("\n"));
  const [helper, math, theme] = program.body as any[];
  assert.equal(helper.isPath, true);
  assert.equal(math.isPath, false);
  assert.equal(theme.isTheme, true);
});

test("parses file exists as an expression", () => {
  const program = parse('if file "notes.txt" exists:\n    say "found"\nend');
  const condition = (program.body[0] as any).branches[0].condition;
  assert.equal(condition.kind, "builtin");
  assert.equal(condition.name, "file exists");
});

test("a kind only contains field and method lines", () => {
  parseError(
    ['define a kind of thing called Dog:', '    say "hi"', "end"].join("\n"),
    /A kind can only contain/,
  );
});

test("a method needs a colon", () => {
  parseError(
    [
      "define a kind of thing called Dog:",
      "    it has name",
      "    it can bark",
      '        say "woof"',
      "    end",
      "end",
    ].join("\n"),
    /":" at the end of the method line/,
  );
});

test("a kind needs an end", () => {
  parseError(
    ["define a kind of thing called Dog:", "    it has name"].join("\n"),
    /"end" to close this kind/,
  );
});

test("read file needs the save clause", () => {
  parseError('read file "a.txt"', /and save it as name/);
});

test("write needs to file", () => {
  parseError('write "x"', /"to file path"/);
});

test("delete needs a file or a device key", () => {
  parseError('delete "k"', /delete file path/);
});

test("list needs files in", () => {
  parseError("list everything", /list files in folder/);
});

test("wait needs seconds", () => {
  parseError("wait 2", /wait 2 seconds/);
});

test("save needs the device clause", () => {
  parseError('save "v" as "k"', /save value to the device/);
});

test("load needs the device clause", () => {
  parseError('load "k"', /load key from the device/);
});

test("get needs data", () => {
  parseError('get "x"', /get data from address/);
});

test("send needs data", () => {
  parseError('send "x"', /send data value to address/);
});

test("sound belongs to apps", () => {
  parseError('play sound "ding"', /belongs to an app/);
});
