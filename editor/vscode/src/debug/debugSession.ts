/**
 * EngCode debug session — the child half of the debugger.
 *
 * This process runs the interpreter synchronously. The adapter talks to it
 * over fd 3 with one JSON object per line: the interpreter blocks inside
 * `onStep` waiting for the next command while the adapter keeps serving DAP
 * on its own stdin/stdout. Program output flows straight to stdout.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Program, Statement } from "../../../../src/ast.js";
import { RuntimeError } from "../../../../src/diagnostics.js";
import { Interpreter, type InputSource, type TraceStep } from "../../../../src/interpreter.js";
import { analyze } from "../../../../src/program.js";
import {
  ObjectValue,
  display,
  isList,
  isTable,
  typeName,
  type Env,
  type Value,
} from "../../../../src/values.js";

// ------------------------------------------------------------- protocol

function send(message: unknown): void {
  const data = Buffer.from(JSON.stringify(message) + "\n", "utf8");
  let offset = 0;
  while (offset < data.length) {
    offset += fs.writeSync(3, data, offset, data.length - offset);
  }
}

function readCommand(): Record<string, unknown> {
  const bytes: number[] = [];
  const byte = Buffer.alloc(1);
  for (;;) {
    const read = fs.readSync(3, byte, 0, 1, null);
    if (read === 0) throw new Error("debug protocol closed");
    if (byte[0] === 0x0a) break;
    bytes.push(byte[0]);
  }
  const line = Buffer.from(bytes).toString("utf8");
  if (line.length === 0) return readCommand();
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return readCommand();
  }
}

function respond(id: unknown, payload: Record<string, unknown>): void {
  send({ event: "response", id, ...payload });
}

// ------------------------------------------------------- statement indexing

interface StmtInfo {
  /** Frame ids from the program root to the frame owning this statement. */
  chain: number[];
  /** Position inside the innermost frame, as keys unique per nesting level. */
  block: string[];
}

interface FrameInfo {
  name: string;
  line: number;
}

interface StmtIndex {
  stmts: Map<Statement, StmtInfo>;
  frames: Map<number, FrameInfo>;
}

function describeEvent(event: { type: string; id?: string }): string {
  return event.id ? `when ${event.id} is ${event.type}` : `when ${event.type}`;
}

/** Maps every statement to its frame chain and block path so stepping can tell
 *  "inside a call I made" from "back where I was". */
function buildStmtIndex(program: Program): StmtIndex {
  const stmts = new Map<Statement, StmtInfo>();
  const frames = new Map<number, FrameInfo>();
  let nextId = 0;

  const walk = (list: Statement[], chain: number[], block: string[]): void => {
    list.forEach((statement, index) => {
      const here = [...block, `s${index}`];
      stmts.set(statement, { chain, block: here });
      switch (statement.kind) {
        case "if":
          statement.branches.forEach((branch, branchIndex) => {
            walk(branch.body, chain, [...here, `b${branchIndex}`]);
          });
          if (statement.otherwise) {
            walk(statement.otherwise, chain, [...here, `b${statement.branches.length}`]);
          }
          break;
        case "repeat":
        case "for-each":
        case "count":
        case "while":
          walk(statement.body, chain, [...here, "b0"]);
          break;
        case "try":
          walk(statement.body, chain, [...here, "b0"]);
          walk(statement.handler, chain, [...here, "b1"]);
          break;
        case "define": {
          const id = nextId++;
          frames.set(id, { name: statement.name, line: statement.token.line });
          walk(statement.body, [...chain, id], []);
          break;
        }
        case "kind":
          for (const method of statement.methods) {
            const id = nextId++;
            frames.set(id, { name: `${statement.name}.${method.name}`, line: method.token.line });
            walk(method.body, [...chain, id], []);
          }
          break;
        case "when": {
          const id = nextId++;
          frames.set(id, { name: describeEvent(statement.event), line: statement.token.line });
          walk(statement.body, [...chain, id], []);
          break;
        }
        case "every": {
          const id = nextId++;
          const label = statement.frame
            ? "every frame"
            : `every ${statement.seconds ?? 1} second${statement.seconds === 1 ? "" : "s"}`;
          frames.set(id, { name: label, line: statement.token.line });
          walk(statement.body, [...chain, id], []);
          break;
        }
        default:
          break;
      }
    });
  };

  walk(program.body, [], []);
  return { stmts, frames };
}

function sameChain(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => b[index] === value);
}

function isPrefix(prefix: number[], full: number[]): boolean {
  return prefix.length <= full.length && prefix.every((value, index) => full[index] === value);
}

function isProperBlockPrefix(prefix: string[], full: string[]): boolean {
  return prefix.length < full.length && prefix.every((value, index) => full[index] === value);
}

// --------------------------------------------------------------- state

type StepMode = "in" | "over" | "out" | null;

let index: StmtIndex = { stmts: new Map(), frames: new Map() };
const breakpoints = new Set<string>();
let stepMode: StepMode = null;
let resumeChain: number[] = [];
let resumeBlock: string[] = [];
let entryDone = false;
let stopOnEntry = false;
let currentEnv: Env | null = null;
let lastStep: TraceStep | null = null;
let interpreter: Interpreter | undefined;

// Variable handles: 1 = Locals, 2 = Globals, 3+ = container values.
const handles = new Map<number, Value>();
const handleIds = new Map<Value, number>();
let nextHandle = 3;

function isContainer(value: Value): boolean {
  return isList(value) || isTable(value) || value instanceof ObjectValue;
}

function handleFor(value: Value): number {
  if (!isContainer(value)) return 0;
  const existing = handleIds.get(value);
  if (existing !== undefined) return existing;
  const id = nextHandle++;
  handles.set(id, value);
  handleIds.set(value, id);
  return id;
}

function clearHandles(): void {
  handles.clear();
  handleIds.clear();
  nextHandle = 3;
}

function childrenOf(value: Value): { name: string; value: Value }[] {
  if (isList(value)) return value.items.map((item, i) => ({ name: String(i + 1), value: item }));
  if (isTable(value)) return [...value.entries.entries()].map(([name, entry]) => ({ name, value: entry }));
  if (value instanceof ObjectValue) {
    return [...value.fields.entries()].map(([name, field]) => ({ name, value: field }));
  }
  return [];
}

function variableWire(name: string, value: Value): Record<string, unknown> {
  return {
    name,
    value: display(value),
    type: typeName(value),
    variablesReference: handleFor(value),
  };
}

function lookupInScope(name: string): Value | undefined {
  if (!currentEnv) return undefined;
  return currentEnv.get(name);
}

// --------------------------------------------------------------- helpers

function bpKey(file: string, line: number): string {
  return `${path.resolve(file)}:${line}`;
}

function applyBreakpoints(list: unknown): void {
  breakpoints.clear();
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    const item = entry as { file?: unknown; line?: unknown };
    if (typeof item.file === "string" && typeof item.line === "number") {
      breakpoints.add(bpKey(item.file, item.line));
    }
  }
}

function diagnosticWire(diagnostic: {
  message: string;
  span?: { line: number; column: number; length: number; file: { path: string } };
  hint?: string;
  severity: string;
}): Record<string, unknown> {
  return {
    message: diagnostic.hint ? `${diagnostic.message} ${diagnostic.hint}` : diagnostic.message,
    line: diagnostic.span?.line ?? 1,
    column: diagnostic.span?.column ?? 1,
    length: diagnostic.span?.length ?? 1,
    file: diagnostic.span?.file.path ?? "",
    severity: diagnostic.severity,
  };
}

function framesFor(info: StmtInfo | undefined, step: TraceStep): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  const chain = info?.chain ?? [];
  chain.forEach((id, position) => {
    const frame = index.frames.get(id);
    if (!frame) return;
    const isTop = position === chain.length - 1;
    frames.push({
      name: frame.name,
      line: isTop ? step.line : frame.line,
      column: isTop ? step.statement.token.column : 1,
    });
  });
  if (chain.length === 0) {
    frames.push({
      name: path.basename(step.statement.token.file.path),
      line: step.line,
      column: step.statement.token.column,
    });
  }
  return frames;
}

/** Step-over: skip anything nested under the resume point, stop beside it. */
function shouldStopOver(info: StmtInfo): boolean {
  if (isPrefix(resumeChain, info.chain) && info.chain.length > resumeChain.length) {
    return false; // inside a call made while stepping
  }
  if (sameChain(resumeChain, info.chain)) {
    return !isProperBlockPrefix(resumeBlock, info.block);
  }
  return true; // returned past the resume point, or a different frame entirely
}

/** Step-out: keep running until the frame chain shrinks. */
function shouldStopOut(info: StmtInfo): boolean {
  if (sameChain(resumeChain, info.chain)) return false;
  if (isPrefix(info.chain, resumeChain)) return true; // popped a frame
  if (isPrefix(resumeChain, info.chain)) return false; // went deeper
  return true; // defensive: a diverged chain stops rather than runs away
}

// --------------------------------------------------------------- stop loop

function stopLoop(info: StmtInfo | undefined): void {
  for (;;) {
    const command = readCommand();
    switch (command.cmd) {
      case "continue":
        stepMode = null;
        return;
      case "stepIn":
        stepMode = "in";
        return;
      case "stepOver":
        resumeChain = info?.chain ?? [];
        resumeBlock = info?.block ?? [];
        stepMode = "over";
        return;
      case "stepOut":
        resumeChain = info?.chain ?? [];
        resumeBlock = info?.block ?? [];
        stepMode = "out";
        return;
      case "breakpoints":
        applyBreakpoints(command.list);
        break;
      case "scopes":
        respond(command.id, {
          scopes: [
            { name: "Locals", variablesReference: 1, expensive: false },
            { name: "Globals", variablesReference: 2, expensive: false },
          ],
        });
        break;
      case "variables":
        sendVariables(command.id, Number(command.ref));
        break;
      case "evaluate":
        sendEvaluate(command.id, String(command.expr ?? ""));
        break;
      case "disconnect":
        send({ event: "terminated" });
        process.exit(0);
        break;
      default:
        break;
    }
  }
}

function sendVariables(id: unknown, ref: number): void {
  let entries: { name: string; value: Value }[] = [];
  if (ref === 1 && currentEnv) {
    entries = currentEnv
      .localNames()
      .map((name) => ({ name, value: currentEnv!.get(name) }))
      .filter((entry): entry is { name: string; value: Value } => entry.value !== undefined);
  } else if (ref === 2 && interpreter) {
    entries = interpreter.globals
      .localNames()
      .map((name) => ({ name, value: interpreter!.globals.get(name) }))
      .filter((entry): entry is { name: string; value: Value } => entry.value !== undefined);
  } else {
    const value = handles.get(ref);
    if (value) entries = childrenOf(value);
  }
  respond(id, { variables: entries.map((entry) => variableWire(entry.name, entry.value)) });
}

function sendEvaluate(id: unknown, expression: string): void {
  const trimmed = expression.trim();
  const value = lookupInScope(trimmed);
  if (value !== undefined) {
    respond(id, { result: display(value), variablesReference: handleFor(value) });
    return;
  }
  respond(id, {
    result: "",
    variablesReference: 0,
    message: `"${trimmed}" is not in scope right now.`,
  });
}

/** Blocks while the adapter collects input from the debug console. */
function readDebugInput(prompt: string): string {
  process.stdout.write(prompt + (prompt.endsWith(" ") ? "" : " "));
  send({ event: "input-request", prompt });
  for (;;) {
    const command = readCommand();
    if (command.cmd === "input") {
      process.stdout.write("\n");
      return String(command.value ?? "");
    }
    if (command.cmd === "breakpoints") {
      applyBreakpoints(command.list);
    } else if (command.cmd === "scopes") {
      respond(command.id, { scopes: [] });
    } else if (command.cmd === "variables") {
      respond(command.id, { variables: [] });
    } else if (command.cmd === "evaluate") {
      respond(command.id, { result: "", variablesReference: 0 });
    } else if (command.cmd === "disconnect") {
      send({ event: "terminated" });
      process.exit(0);
    }
  }
}

// --------------------------------------------------------------- main

function waitUntilStarted(): void {
  for (;;) {
    const command = readCommand();
    if (command.cmd === "breakpoints") {
      applyBreakpoints(command.list);
      continue;
    }
    if (command.cmd === "start") return;
    if (command.cmd === "disconnect") process.exit(0);
    if (command.cmd === "scopes") respond(command.id, { scopes: [] });
    if (command.cmd === "variables") respond(command.id, { variables: [] });
    if (command.cmd === "evaluate") respond(command.id, { result: "", variablesReference: 0 });
  }
}

function reportAndExit(command: Record<string, unknown>, message: string): never {
  send({ event: "compile-error", diagnostics: [{ message, line: 1, column: 1, length: 1, file: "", severity: "error" }] });
  void command;
  process.exit(1);
}

function main(): void {
  const launch = readCommand();
  if (launch.cmd !== "launch") reportAndExit(launch, "The debug session did not receive launch details.");
  const programPath = path.resolve(String(launch.program ?? ""));
  stopOnEntry = launch.stopOnEntry === true;

  let text: string;
  try {
    text = fs.readFileSync(programPath, "utf8");
  } catch {
    reportAndExit(launch, `I could not read "${programPath}".`);
  }

  const analysis = analyze(programPath, text);
  const hasErrors = analysis.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  if (!analysis.program || hasErrors) {
    send({
      event: "compile-error",
      diagnostics: analysis.diagnostics.map(diagnosticWire),
    });
    process.exit(1);
  }

  for (const diagnostic of analysis.diagnostics) {
    send({ event: "output", category: "stderr", text: `${diagnostic.message}\n` });
  }

  index = buildStmtIndex(analysis.program);
  send({ event: "launched" });
  waitUntilStarted();

  const input: InputSource = { readLine: (prompt) => readDebugInput(prompt) };
  interpreter = new Interpreter({
    write: (output) => process.stdout.write(output),
    input,
    fileRoot: path.dirname(programPath),
    onStep: (step) => {
      lastStep = step;
      const info = index.stmts.get(step.statement);
      const file = path.resolve(step.statement.token.file.path);
      const key = `${file}:${step.line}`;

      let reason: string | null = null;
      if (stopOnEntry && !entryDone) {
        entryDone = true;
        reason = "entry";
      } else if (breakpoints.has(key)) {
        reason = "breakpoint";
      } else if (stepMode === "in") {
        reason = "step";
      } else if (stepMode !== null && !info) {
        reason = "step"; // unknown structure: stop rather than run away
      } else if (stepMode === "over" && info && shouldStopOver(info)) {
        reason = "step";
      } else if (stepMode === "out" && info && shouldStopOut(info)) {
        reason = "step";
      }
      if (!reason) return;

      stepMode = null;
      currentEnv = step.env;
      clearHandles();
      const frames = framesFor(info, step);
      send({
        event: "stopped",
        reason,
        line: step.line,
        column: step.statement.token.column,
        file,
        frames,
      });
      stopLoop(info);
    },
  });

  try {
    interpreter.run(analysis.program);
  } catch (error) {
    currentEnv = lastStep?.env ?? null;
    clearHandles();
    if (error instanceof RuntimeError) {
      const diagnostic = error.diagnostic;
      send({
        event: "runtime-error",
        diagnostic: diagnosticWire(diagnostic),
        frames: lastStep ? framesFor(index.stmts.get(lastStep.statement), lastStep) : [],
        line: lastStep?.line ?? diagnostic.span?.line ?? 1,
        column: lastStep?.statement.token.column ?? diagnostic.span?.column ?? 1,
      });
    } else if (error instanceof Error) {
      send({
        event: "runtime-error",
        diagnostic: { message: error.message, line: 1, column: 1, length: 1, file: "", severity: "error" },
        frames: [],
        line: 1,
        column: 1,
      });
    } else {
      send({
        event: "runtime-error",
        diagnostic: { message: "Something unexpected went wrong.", line: 1, column: 1, length: 1, file: "", severity: "error" },
        frames: [],
        line: 1,
        column: 1,
      });
    }

    // The program cannot resume from a runtime error, but the user may still
    // inspect variables before ending the session.
    for (;;) {
      const command = readCommand();
      if (command.cmd === "disconnect") break;
      if (command.cmd === "scopes") {
        respond(command.id, {
          scopes: [
            { name: "Locals", variablesReference: 1, expensive: false },
            { name: "Globals", variablesReference: 2, expensive: false },
          ],
        });
      } else if (command.cmd === "variables") {
        sendVariables(command.id, Number(command.ref));
      } else if (command.cmd === "evaluate") {
        sendEvaluate(command.id, String(command.expr ?? ""));
      } else if (command.cmd === "breakpoints") {
        applyBreakpoints(command.list);
      } else {
        break; // continue / step: the program is over
      }
    }
    send({ event: "terminated" });
    process.exit(0);
  }

  send({ event: "terminated" });
  process.exit(0);
}

try {
  main();
} catch {
  // The adapter went away (or the protocol closed): exit quietly.
  process.exit(0);
}
