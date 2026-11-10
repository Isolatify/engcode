import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "../src/program.js";
import { runProgram, ScriptedInput } from "./helpers.js";
import { Interpreter } from "../src/interpreter.js";

function example(name: string): string {
  return path.resolve("examples", name, "main.eng");
}

test("hello example greets the reader by name", () => {
  const file = example("hello");
  const analysis = analyze(file, fs.readFileSync(file, "utf8"));
  assert.deepEqual(analysis.diagnostics, []);
  let output = "";
  const interpreter = new Interpreter({
    write: (chunk) => {
      output += chunk;
    },
    input: new ScriptedInput(["Sam"]),
  });
  interpreter.run(analysis.program!);
  assert.match(output, /Hello, world!/);
  assert.match(output, /Hello, Sam! Welcome to EngCode\./);
});

test("guess example finds the secret and stops", () => {
  const file = example("guess");
  const analysis = analyze(file, fs.readFileSync(file, "utf8"));
  assert.deepEqual(analysis.diagnostics, []);
  const result = runProgram(
    analysis.program!,
    ["1"],
    () => 0, // secret is 1
  );
  assert.match(result.output, /You got it in 1 guesses!/);
});

test("every example passes the checker", () => {
  const root = path.resolve("examples");
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "main.eng");
    if (!fs.existsSync(file)) continue;
    const analysis = analyze(file, fs.readFileSync(file, "utf8"));
    assert.deepEqual(analysis.diagnostics, [], `${entry.name} should check cleanly`);
  }
});

function exampleProgram(name: string) {
  const file = example(name);
  const analysis = analyze(file, fs.readFileSync(file, "utf8"));
  assert.deepEqual(analysis.diagnostics, [], `${name} should check cleanly`);
  return analysis.program!;
}

test("calculator example adds two numbers", () => {
  const result = runProgram(exampleProgram("calculator"), ["12", "plus", "30"]);
  assert.match(result.output, /Result: 42/);
  assert.deepEqual(result.input.prompts, [
    "First number",
    "Operation (plus, minus, times, divided by)",
    "Second number",
  ]);
});

test("calculator example refuses division by zero", () => {
  const result = runProgram(exampleProgram("calculator"), ["8", "divided by", "0"]);
  assert.match(result.output, /Result: You cannot divide by zero\./);
});

test("quiz example counts correct answers", () => {
  const result = runProgram(exampleProgram("quiz"), ["4", "Paris", "16"]);
  assert.match(result.output, /Correct!/);
  assert.match(result.output, /Not quite\. The answer is 15/);
  assert.match(result.output, /You scored 2 out of 3/);
});

test("rock paper scissors example plays a round", () => {
  const result = runProgram(exampleProgram("rock-paper-scissors"), ["paper"], () => 0);
  assert.match(result.output, /Computer chose rock/);
  assert.match(result.output, /You win!/);
});

test("rock paper scissors can tie", () => {
  const result = runProgram(exampleProgram("rock-paper-scissors"), ["rock"], () => 0);
  assert.match(result.output, /It is a tie\./);
});
