// End-to-end smoke test for the built extension pieces: the language server
// over stdio (LSP handshake, diagnostics, hover, completion) and the debug
// adapter over stdio (DAP handshake, launch, breakpoint stop, variables,
// continue). Runs against dist/ only, so `npm run build` must come first.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");

let failures = 0;

function pass(name) {
  console.log(`ok - ${name}`);
}

function fail(name, detail) {
  failures += 1;
  console.error(`not ok - ${name}`);
  if (detail) console.error(`  ${String(detail).replace(/\n/g, "\n  ")}`);
}

function assert(name, condition, detail) {
  if (condition) pass(name);
  else fail(name, detail);
}

function timeout(ms, label) {
  return setTimeout(() => fail(label, `timed out after ${ms}ms`), ms).unref();
}

// --------------------------------------------------------------- framing

/** Minimal LSP client: the same `--node-ipc` transport the extension uses. */
function lspClient(module) {
  const child = spawn(process.execPath, [module, "--node-ipc"], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
  let nextId = 1;
  const waiters = new Map();
  const diagnosticsWaiters = [];
  const notifications = [];
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.on("message", (message) => {
    if (message.id !== undefined && message.method === undefined) {
      const waiter = waiters.get(message.id);
      if (waiter) {
        waiters.delete(message.id);
        waiter(message);
      }
    } else if (message.method === "textDocument/publishDiagnostics") {
      for (const resolve of diagnosticsWaiters.splice(0)) {
        resolve(message.params);
      }
    } else if (message.method !== undefined) {
      notifications.push(message);
    }
  });

  function send(message) {
    child.send({ jsonrpc: "2.0", ...message });
  }

  function request(method, params) {
    const id = nextId++;
    const response = new Promise((resolve) => waiters.set(id, resolve));
    send({ id, method, params });
    return response;
  }

  function notify(method, params) {
    send({ method, params });
  }

  function nextDiagnostics() {
    return new Promise((resolve) => diagnosticsWaiters.push(resolve));
  }

  function stop() {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
  }

  return { child, request, notify, nextDiagnostics, stop, notifications: () => notifications, stderr: () => stderr };
}

/** Minimal DAP client: Content-Length framed JSON on stdio. */
function dapClient() {
  const child = spawn(process.execPath, [path.join(dist, "debugAdapter.js")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = Buffer.alloc(0);
  let nextSeq = 1;
  const waiters = new Map();
  const eventWaiters = new Map();
  const events = [];
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      if (message.type === "response") {
        const waiter = waiters.get(message.request_seq);
        if (waiter) {
          waiters.delete(message.request_seq);
          waiter(message);
        }
      } else if (message.type === "event") {
        events.push(message);
        const queue = eventWaiters.get(message.event);
        if (queue && queue.length > 0) queue.shift()(message);
      }
    }
  });

  function request(command, args) {
    const seq = nextSeq++;
    const response = new Promise((resolve) => waiters.set(seq, resolve));
    child.stdin.write(
      `Content-Length: ${Buffer.byteLength(JSON.stringify({ seq, type: "request", command, arguments: args }), "utf8")}\r\n\r\n${JSON.stringify({
        seq,
        type: "request",
        command,
        arguments: args,
      })}`,
    );
    return response;
  }

  function event(name) {
    const existing = events.find((e) => e.event === name);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const queue = eventWaiters.get(name) ?? [];
      queue.push(resolve);
      eventWaiters.set(name, queue);
    });
  }

  function stop() {
    try {
      child.kill();
    } catch {
      // Already gone.
    }
  }

  return { request, event, stop, stderr: () => stderr };
}

// ------------------------------------------------------------------ LSP

async function testLsp() {
  const server = lspClient(path.join(dist, "server.js"));
  const badFile = path.join(os.tmpdir(), `engcode-e2e-${process.pid}.eng`);
  fs.writeFileSync(
    badFile,
    'say  "hello"\nset score to 1\nchange score to 2\nset unused to 5\nsay scoer\n',
    "utf8",
  );
  const uri = "file:///" + badFile.replace(/\\/g, "/");

  try {
    const init = await Promise.race([
      server.request("initialize", {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
        initializationOptions: { checkOnType: true },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("initialize timed out")), 8000)),
    ]);
    assert(
      "lsp: initialize returns capabilities",
      init.result?.capabilities?.hoverProvider === true &&
        init.result?.capabilities?.completionProvider !== undefined,
      JSON.stringify(init.result?.capabilities ?? init.error),
    );
    server.notify("initialized", {});

    const diagnosticsPromise = server.nextDiagnostics();
    server.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "engcode", version: 1, text: fs.readFileSync(badFile, "utf8") },
    });
    const published = await Promise.race([
      diagnosticsPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("diagnostics timed out")), 8000)),
    ]);
    assert(
      "lsp: publishes diagnostics with an error and a lint warning",
      published.diagnostics.some((d) => d.severity === 1) &&
        published.diagnostics.some((d) => d.severity === 2),
      JSON.stringify(published.diagnostics),
    );

    const hover = await server.request("textDocument/hover", {
      textDocument: { uri },
      position: { line: 0, character: 1 },
    });
    assert(
      "lsp: hover documents `say`",
      typeof hover.result?.contents?.value === "string" &&
        hover.result.contents.value.includes("say"),
      JSON.stringify(hover.result),
    );

    const completion = await server.request("textDocument/completion", {
      textDocument: { uri },
      position: { line: 1, character: 14 },
    });
    const labels = (completion.result?.items ?? completion.result ?? []).map((item) => item.label);
    assert(
      "lsp: completion offers the declared name `score`",
      labels.includes("score"),
      `labels sample: ${labels.slice(0, 10).join(", ")}`,
    );

    const references = await server.request("textDocument/references", {
      textDocument: { uri },
      position: { line: 1, character: 5 },
      context: { includeDeclaration: true },
    });
    assert(
      "lsp: find references finds the definition and the use",
      Array.isArray(references.result) && references.result.length >= 2,
      JSON.stringify(references.result),
    );

    const rename = await server.request("textDocument/rename", {
      textDocument: { uri },
      position: { line: 1, character: 5 },
      newName: "points",
    });
    const changes = rename.result?.changes?.[uri] ?? [];
    assert(
      "lsp: rename rewrites both sites",
      changes.length >= 2 && changes.every((edit) => edit.newText === "points"),
      JSON.stringify(rename.result ?? rename.error),
    );

    const format = await server.request("textDocument/formatting", {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    assert(
      "lsp: formatting returns an edit for messy spacing",
      Array.isArray(format.result) && format.result.length === 1,
      JSON.stringify(format.result),
    );

    const links = await server.request("textDocument/documentLink", { textDocument: { uri } });
    assert("lsp: document links respond", Array.isArray(links.result), JSON.stringify(links.result));

    const check = await server.request("engcode/check", { uri });
    assert(
      "lsp: engcode/check counts problems",
      typeof check.result?.count === "number" && check.result.count >= 1,
      JSON.stringify(check.result),
    );

    await server.request("shutdown", null);
    server.notify("exit", null);
  } catch (error) {
    fail("lsp suite", error?.stack ?? error);
    if (server.stderr().trim()) console.error(server.stderr());
  } finally {
    server.stop();
    fs.rmSync(badFile, { force: true });
  }
}

// ------------------------------------------------------------------ DAP

async function testDap() {
  const dap = dapClient();
  const program = path.join(os.tmpdir(), `engcode-dap-${process.pid}.eng`);
  // Line 2 is the breakpoint target; line 1 sets the variable the pause inspects.
  fs.writeFileSync(program, 'set score to 7\nsay "one"\nsay "two"\n', "utf8");

  try {
    const init = await Promise.race([
      dap.request("initialize", { clientID: "e2e", adapterID: "engcode", linesStartAt1: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("initialize timed out")), 8000)),
    ]);
    assert(
      "dap: initialize advertises configurationDone",
      init.success === true && init.body?.supportsConfigurationDoneRequest === true,
      JSON.stringify(init),
    );

    const initialized = await Promise.race([
      dap.event("initialized"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("initialized event timed out")), 8000)),
    ]);
    assert("dap: emits initialized event", initialized.event === "initialized");

    const launch = await Promise.race([
      dap.request("launch", { program, stopOnEntry: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("launch timed out")), 10000)),
    ]);
    assert("dap: launch responds success", launch.success === true, JSON.stringify(launch));

    await dap.request("setBreakpoints", {
      source: { path: program },
      breakpoints: [{ line: 2 }],
    });
    const config = await dap.request("configurationDone", {});
    assert("dap: configurationDone responds", config.success === true, JSON.stringify(config));

    const stopped = await Promise.race([
      dap.event("stopped"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("stopped event timed out")), 10000)),
    ]);
    assert(
      "dap: stops on the breakpoint",
      stopped.body?.reason === "breakpoint",
      JSON.stringify(stopped.body),
    );

    const stack = await dap.request("stackTrace", { threadId: 1 });
    const topFrame = stack.body?.stackFrames?.[0];
    assert(
      "dap: stack frame points at line 2",
      topFrame?.line === 2,
      JSON.stringify(stack.body),
    );

    const scopes = await dap.request("scopes", { frameId: 0 });
    const locals = (scopes.body?.scopes ?? []).find((scope) => scope.name === "Locals");
    assert("dap: Locals scope offered", locals !== undefined, JSON.stringify(scopes.body));

    const variables = await dap.request("variables", {
      variablesReference: locals?.variablesReference ?? 0,
    });
    const scoreVar = (variables.body?.variables ?? []).find((v) => v.name === "score");
    assert(
      "dap: Locals shows score = 7",
      scoreVar?.value === "7",
      JSON.stringify(variables.body),
    );

    await dap.request("continue", { threadId: 1 });
    const terminated = await Promise.race([
      dap.event("terminated"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("terminated event timed out")), 10000)),
    ]);
    assert("dap: continues to program end", terminated.event === "terminated");
  } catch (error) {
    fail("dap suite", error?.stack ?? error);
    if (dap.stderr().trim()) console.error(dap.stderr());
  } finally {
    dap.stop();
    fs.rmSync(program, { force: true });
  }
}

// ------------------------------------------------------------------ CLI

async function testCli() {
  const cli = path.join(dist, "engcode-cli.mjs");
  const file = path.join(os.tmpdir(), `engcode-cli-${process.pid}.eng`);
  fs.writeFileSync(file, 'say "cli works"\n', "utf8");

  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "run", file], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("exit", (code) => resolve({ code, out }));
  });
  assert(
    "cli: bundled CLI runs a file",
    run.code === 0 && run.out.includes("cli works"),
    `code=${run.code} out=${run.out}`,
  );

  const check = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "check", file], { stdio: ["ignore", "pipe", "pipe"] });
    child.on("exit", (code) => resolve(code));
  });
  assert("cli: bundled CLI checks a clean file", check === 0, `code=${check}`);

  fs.rmSync(file, { force: true });
}

// ------------------------------------------------------------------ main

console.log("# EngCode extension e2e");
await testCli();
await testLsp();
await testDap();

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log("\nAll e2e tests passed.");
