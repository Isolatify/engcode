/**
 * EngCode debug adapter.
 *
 * Speaks the Debug Adapter Protocol to VS Code on stdin/stdout and runs the
 * interpreter in a child process (`debugSession.js`) that blocks inside
 * `onStep`, talking JSON lines over fd 3. Keeping the two loops in separate
 * processes is what lets breakpoints and variable requests stay responsive
 * while the program is paused mid-statement.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Readable, Writable } from "node:stream";

interface DapRequest {
  seq: number;
  type: "request";
  command: string;
  arguments?: Record<string, unknown>;
}

interface PendingRequest {
  command: string;
  seq: number;
}

interface StoppedPayload {
  reason: string;
  line: number;
  column: number;
  file: string;
  frames: { name: string; line: number; column: number }[];
}

interface SessionDiagnostic {
  message: string;
  line: number;
  column: number;
  length: number;
  file: string;
  severity: string;
}

let seq = 0;
let child: ChildProcessWithoutNullStreams | undefined;
let sessionLaunched = false;
let launchArgs: Record<string, unknown> | undefined;
let configurationDone = false;
let terminatedSent = false;
let pendingInput = false;
let lastStopped: StoppedPayload | undefined;
let sessionBuffer = "";
const pending = new Map<number, PendingRequest>();
const breakpointsByFile = new Map<string, number[]>();

// ------------------------------------------------------------ DAP framing

function sendDap(message: Record<string, unknown>): void {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function respond(request: DapRequest, body: Record<string, unknown>, success = true, message?: string): void {
  seq += 1;
  sendDap({
    seq,
    type: "response",
    request_seq: request.seq,
    success,
    command: request.command,
    ...(message ? { message } : {}),
    ...(success ? { body } : {}),
  });
}

function event(name: string, body: Record<string, unknown>): void {
  seq += 1;
  sendDap({ seq, type: "event", event: name, body });
}

function output(category: string, text: string): void {
  event("output", { category, output: text });
}

function terminateSession(): void {
  if (terminatedSent) return;
  terminatedSent = true;
  event("terminated", {});
}

function formatDiagnostic(diagnostic: SessionDiagnostic): string {
  const location = diagnostic.file
    ? `${path.basename(diagnostic.file)}:${diagnostic.line}:${diagnostic.column}: `
    : "";
  return `${location}${diagnostic.message}\n`;
}

// ---------------------------------------------------------- session side

function toSession(message: Record<string, unknown>): void {
  if (!child) return;
  const stream = child.stdio[3] as Writable | null;
  if (stream) stream.write(JSON.stringify(message) + "\n");
}

let requestCounter = 0;

/** Forwards a request that needs an answer from the session, remembering how
 *  to turn its response back into a DAP response. */
function askSession(request: DapRequest, message: Record<string, unknown>): void {
  requestCounter += 1;
  pending.set(requestCounter, { command: request.command, seq: request.seq });
  toSession({ ...message, id: requestCounter });
}

function flushBreakpoints(): void {
  if (!child) return;
  const list: { file: string; line: number }[] = [];
  for (const [file, lines] of breakpointsByFile) {
    for (const line of lines) list.push({ file, line });
  }
  toSession({ cmd: "breakpoints", list });
}

function spawnSession(): void {
  const sessionPath = path.join(__dirname, "debugSession.js");
  child = spawn(process.execPath, [sessionPath], {
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  }) as ChildProcessWithoutNullStreams;

  child.stdout.on("data", (chunk: Buffer) => output("stdout", chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => output("stderr", chunk.toString("utf8")));

  const protocol = child.stdio[3] as Readable | null;
  protocol?.on("data", (chunk: Buffer) => {
    sessionBuffer += chunk.toString("utf8");
    for (;;) {
      const newline = sessionBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = sessionBuffer.slice(0, newline);
      sessionBuffer = sessionBuffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      try {
        handleSessionMessage(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Ignore malformed lines rather than taking the adapter down.
      }
    }
  });

  child.on("error", (error) => {
    child = undefined;
    output("stderr", `Could not start the EngCode debug session: ${error.message}\n`);
    if (launchRequest) {
      const request = launchRequest;
      launchRequest = undefined;
      respond(request, {}, false, error.message);
    }
    terminateSession();
  });

  child.on("exit", () => {
    child = undefined;
    if (launchRequest) {
      const request = launchRequest;
      launchRequest = undefined;
      respond(request, {}, false, "The debug session ended before the program started.");
    }
    for (const [, request] of pending) {
      seq += 1;
      sendDap({
        seq,
        type: "response",
        request_seq: request.seq,
        success: false,
        command: request.command,
        message: "The debug session ended.",
      });
    }
    pending.clear();
    terminateSession();
  });
}

function handleSessionMessage(message: Record<string, unknown>): void {
  switch (message.event) {
    case "launched": {
      sessionLaunched = true;
      respondToLaunch();
      if (configurationDone) toSession({ cmd: "start" });
      break;
    }
    case "compile-error": {
      const diagnostics = (message.diagnostics as SessionDiagnostic[] | undefined) ?? [];
      for (const diagnostic of diagnostics) output("stderr", formatDiagnostic(diagnostic));
      if (launchArgs) {
        respondToLaunch();
        output("stderr", "Fix the errors above, then start debugging again.\n");
      }
      terminateSession();
      child?.kill();
      break;
    }
    case "output": {
      output(String(message.category ?? "stdout"), String(message.text ?? ""));
      break;
    }
    case "input-request": {
      pendingInput = true;
      const prompt = String(message.prompt ?? "");
      output("stdout", prompt + (prompt.endsWith(" ") ? "" : " "));
      break;
    }
    case "stopped": {
      pendingInput = false;
      lastStopped = {
        reason: String(message.reason ?? "step"),
        line: Number(message.line ?? 1),
        column: Number(message.column ?? 1),
        file: String(message.file ?? ""),
        frames: (message.frames as StoppedPayload["frames"]) ?? [],
      };
      event("stopped", {
        reason: lastStopped.reason === "entry" ? "entry" : lastStopped.reason,
        threadId: 1,
        allThreadsStopped: true,
      });
      break;
    }
    case "runtime-error": {
      pendingInput = false;
      const diagnostic = message.diagnostic as SessionDiagnostic;
      output("stderr", formatDiagnostic(diagnostic));
      lastStopped = {
        reason: "exception",
        line: Number(message.line ?? 1),
        column: Number(message.column ?? 1),
        file: diagnostic.file ?? "",
        frames: (message.frames as StoppedPayload["frames"]) ?? [],
      };
      event("stopped", {
        reason: "exception",
        description: diagnostic.message,
        text: diagnostic.message,
        threadId: 1,
        allThreadsStopped: true,
      });
      break;
    }
    case "terminated": {
      terminateSession();
      break;
    }
    case "response": {
      const id = Number(message.id);
      const request = pending.get(id);
      if (!request) break;
      pending.delete(id);
      seq += 1;
      if (request.command === "scopes") {
        sendDap({
          seq,
          type: "response",
          request_seq: request.seq,
          success: true,
          command: "scopes",
          body: { scopes: message.scopes ?? [] },
        });
      } else if (request.command === "variables") {
        sendDap({
          seq,
          type: "response",
          request_seq: request.seq,
          success: true,
          command: "variables",
          body: { variables: message.variables ?? [] },
        });
      } else if (request.command === "evaluate") {
        sendDap({
          seq,
          type: "response",
          request_seq: request.seq,
          success: true,
          command: "evaluate",
          body: {
            result: String(message.result ?? ""),
            variablesReference: Number(message.variablesReference ?? 0),
            ...(message.message ? { message: String(message.message) } : {}),
          },
        });
      } else {
        sendDap({
          seq,
          type: "response",
          request_seq: request.seq,
          success: true,
          command: request.command,
          body: {},
        });
      }
      break;
    }
    default:
      break;
  }
}

// -------------------------------------------------------------- launch

function sendLaunch(): void {
  if (!launchArgs) return;
  toSession({
    cmd: "launch",
    program: String(launchArgs.program ?? ""),
    stopOnEntry: launchArgs.stopOnEntry === true,
  });
}

function respondToLaunch(): void {
  if (!launchArgs) return;
  const request = launchRequest;
  if (!request) return;
  launchRequest = undefined;
  respond(request, {});
}

let launchRequest: DapRequest | undefined;

// ------------------------------------------------------------- requests

function verifyBreakpoint(file: string, line: number): boolean {
  try {
    const text = fs.readFileSync(file, "utf8");
    const lineCount = text.split(/\r\n|\n|\r/).length;
    return line >= 1 && line <= lineCount;
  } catch {
    return false;
  }
}

function handleRequest(request: DapRequest): void {
  switch (request.command) {
    case "initialize": {
      respond(request, {
        supportsConfigurationDoneRequest: true,
        supportsTerminateRequest: true,
        supportsEvaluateForHovers: false,
        supportsSetVariable: false,
        supportsRestartRequest: false,
        supportsStepBack: false,
        supportsDelayedStackTraceLoading: false,
        supportsConditionalBreakpoints: false,
        supportsHitConditionalBreakpoints: false,
        supportsFunctionBreakpoints: false,
        supportsLogPoints: false,
        supportsModulesRequest: false,
        supportsValueFormattingOptions: false,
        exceptionBreakpointFilters: [],
      });
      event("initialized", {});
      break;
    }
    case "launch": {
      launchArgs = request.arguments ?? {};
      launchRequest = request;
      spawnSession();
      // The session blocks reading its first command, so hand it the launch
      // details immediately; it answers `launched` once the program compiles.
      sendLaunch();
      break;
    }
    case "setBreakpoints": {
      const args = request.arguments ?? {};
      const source = args.source as { path?: string } | undefined;
      const requested = (args.breakpoints as { line: number }[] | undefined) ?? [];
      const file = source?.path;
      if (file) {
        const lines: number[] = [];
        for (const breakpoint of requested) {
          if (verifyBreakpoint(file, breakpoint.line)) lines.push(breakpoint.line);
        }
        if (lines.length > 0) breakpointsByFile.set(path.resolve(file), lines);
        else breakpointsByFile.delete(path.resolve(file));
        flushBreakpoints();
      }
      respond(request, {
        breakpoints: requested.map((breakpoint) => ({
          verified: file ? verifyBreakpoint(file, breakpoint.line) : false,
          line: breakpoint.line,
        })),
      });
      break;
    }
    case "setExceptionBreakpoints": {
      respond(request, { breakpoints: [] });
      break;
    }
    case "configurationDone": {
      configurationDone = true;
      respond(request, {});
      if (sessionLaunched) toSession({ cmd: "start" });
      break;
    }
    case "continue": {
      respond(request, { allThreadsContinued: true });
      pendingInput = false;
      toSession({ cmd: "continue" });
      break;
    }
    case "next": {
      respond(request, {});
      pendingInput = false;
      toSession({ cmd: "stepOver" });
      break;
    }
    case "stepIn":
    case "stepOver": {
      respond(request, {});
      pendingInput = false;
      toSession({ cmd: "stepIn" });
      break;
    }
    case "stepOut": {
      respond(request, {});
      pendingInput = false;
      toSession({ cmd: "stepOut" });
      break;
    }
    case "pause": {
      respond(request, {}, false, "EngCode programs run without a pause button; use Stop.");
      break;
    }
    case "threads": {
      respond(request, { threads: [{ id: 1, name: "EngCode" }] });
      break;
    }
    case "stackTrace": {
      const frames = lastStopped?.frames ?? [];
      const source = lastStopped?.file
        ? { path: lastStopped.file, name: path.basename(lastStopped.file) }
        : undefined;
      const stackFrames =
        frames.length > 0
          ? frames.map((frame, position) => ({
              id: position,
              name: frame.name,
              line: frame.line,
              column: frame.column,
              ...(source ? { source } : {}),
            }))
          : lastStopped
            ? [
                {
                  id: 0,
                  name: "(top level)",
                  line: lastStopped.line,
                  column: lastStopped.column,
                  ...(source ? { source } : {}),
                },
              ]
            : [];
      respond(request, { stackFrames, totalFrames: stackFrames.length });
      break;
    }
    case "scopes": {
      if (!child) {
        respond(request, { scopes: [] });
        break;
      }
      askSession(request, { cmd: "scopes" });
      break;
    }
    case "variables": {
      if (!child) {
        respond(request, { variables: [] });
        break;
      }
      askSession(request, { cmd: "variables", ref: Number(request.arguments?.variablesReference ?? 0) });
      break;
    }
    case "evaluate": {
      if (pendingInput) {
        pendingInput = false;
        askSession(request, { cmd: "input", value: String(request.arguments?.expression ?? "") });
        break;
      }
      if (!child) {
        respond(request, { result: "", variablesReference: 0 });
        break;
      }
      askSession(request, {
        cmd: "evaluate",
        expr: String(request.arguments?.expression ?? ""),
        context: String(request.arguments?.context ?? ""),
      });
      break;
    }
    case "disconnect":
    case "terminate": {
      respond(request, {});
      toSession({ cmd: "disconnect" });
      const dying = child;
      if (dying) {
        setTimeout(() => {
          try {
            dying.kill();
          } catch {
            // Already gone.
          }
        }, 500);
      } else {
        terminateSession();
      }
      break;
    }
    default: {
      respond(request, {}, false, `Unsupported request "${request.command}".`);
      break;
    }
  }
}

// --------------------------------------------------------------- stdin

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk: Buffer) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  for (;;) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = inputBuffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (inputBuffer.length < bodyStart + length) return;
    const body = inputBuffer.subarray(bodyStart, bodyStart + length).toString("utf8");
    inputBuffer = inputBuffer.subarray(bodyStart + length);
    try {
      const message = JSON.parse(body) as DapRequest;
      if (message.type === "request") handleRequest(message);
    } catch {
      // Ignore malformed input from the client.
    }
  }
});

process.stdin.on("end", () => {
  child?.kill();
  process.exit(0);
});
