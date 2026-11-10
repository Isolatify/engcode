import { analyze } from "../src/program.js";
import { renderDiagnostic } from "../src/diagnostics.js";
import { Interpreter, type InputSource } from "../src/interpreter.js";
import type { Program } from "../src/ast.js";
import { Lexer } from "../src/lexer.js";
import { prescanNames } from "../src/names.js";
import { Parser } from "../src/parser.js";
import type { Token } from "../src/tokens.js";

export class ScriptedInput implements InputSource {
  public readonly prompts: string[] = [];
  private index = 0;

  constructor(private readonly lines: string[]) {}

  readLine(prompt: string): string {
    this.prompts.push(prompt);
    if (this.index >= this.lines.length) {
      throw new Error("No more scripted input.");
    }
    return this.lines[this.index++] ?? "";
  }
}

export function lex(text: string): Token[] {
  return Lexer.lex("test.eng", text);
}

export function parse(text: string): Program {
  const tokens = lex(text);
  const names = prescanNames(tokens);
  return Parser.parse(tokens, names);
}

export function checkText(text: string): string[] {
  return analyze("test.eng", text).diagnostics.map((diagnostic) => {
    return `${diagnostic.message} ${diagnostic.hint ?? ""} ${diagnostic.suggestion ?? ""}`.trim();
  });
}

export interface RunResult {
  output: string;
  input: ScriptedInput;
}

export interface RunOptions {
  fileRoot?: string;
  allowNetwork?: boolean;
  storagePath?: string;
}

export function runSource(
  text: string,
  inputLines: string[] = [],
  random: () => number = () => 0,
  options: RunOptions = {},
): RunResult {
  const analysis = analyze("test.eng", text, options.fileRoot ? { root: options.fileRoot } : {});
  if (analysis.diagnostics.length > 0) {
    throw new Error(analysis.diagnostics.map(renderDiagnostic).join("\n\n"));
  }
  if (!analysis.program) throw new Error("No program");

  const input = new ScriptedInput(inputLines);
  let output = "";
  const interpreter = new Interpreter({
    write: (chunk) => {
      output += chunk;
    },
    input,
    random,
    fileRoot: options.fileRoot,
    allowNetwork: options.allowNetwork,
    storagePath: options.storagePath,
  });
  interpreter.run(analysis.program);
  return { output, input };
}

export function runProgram(
  program: Program,
  inputLines: string[] = [],
  random: () => number = () => 0,
  options: RunOptions = {},
): RunResult {
  const input = new ScriptedInput(inputLines);
  let output = "";
  const interpreter = new Interpreter({
    write: (chunk) => {
      output += chunk;
    },
    input,
    random,
    fileRoot: options.fileRoot,
    allowNetwork: options.allowNetwork,
    storagePath: options.storagePath,
  });
  interpreter.run(program);
  return { output, input };
}
