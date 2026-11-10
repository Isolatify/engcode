import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { Window } from "happy-dom";
import { analyze } from "../src/program.js";
import { compileWeb } from "../src/web/compiler.js";
import { startApp } from "../runtime/web-runtime.js";

interface FakeContext {
  calls: string[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
  fillRect: (...args: number[]) => void;
  beginPath: () => void;
  arc: (...args: number[]) => void;
  fill: () => void;
  moveTo: (...args: number[]) => void;
  lineTo: (...args: number[]) => void;
  stroke: () => void;
  fillText: (...args: unknown[]) => void;
  drawImage: (...args: unknown[]) => void;
}

function fakeContext(): FakeContext {
  const context: FakeContext = {
    calls: [],
    fillStyle: "",
    strokeStyle: "",
    font: "",
    fillRect: (...args) => context.calls.push(`fillRect:${args.join(",")}`),
    beginPath: () => context.calls.push("beginPath"),
    arc: (...args) => context.calls.push(`arc:${args.join(",")}`),
    fill: () => context.calls.push("fill"),
    moveTo: (...args) => context.calls.push(`moveTo:${args.join(",")}`),
    lineTo: (...args) => context.calls.push(`lineTo:${args.join(",")}`),
    stroke: () => context.calls.push("stroke"),
    fillText: (...args) => context.calls.push(`fillText:${args.join(",")}`),
    drawImage: () => context.calls.push("drawImage"),
  };
  return context;
}

function installGlobals(window: Window): void {
  const target = globalThis as Record<string, unknown>;
  for (const name of [
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLButtonElement",
    "HTMLAnchorElement",
    "HTMLCanvasElement",
    "HTMLDialogElement",
    "HTMLImageElement",
    "HTMLUListElement",
    "KeyboardEvent",
    "Event",
    "Node",
    "Audio",
    "Image",
  ]) {
    const value = (window as unknown as Record<string, unknown>)[name];
    if (value !== undefined) target[name] = value;
  }
  target.window = window;
}

async function flush(times = 30): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function pick<T>(root: { querySelector: (selector: string) => unknown }, selector: string): T {
  const element = root.querySelector(selector);
  assert.ok(element, `expected ${selector}`);
  return element as T;
}

function loadExample(name: string, initialise = true) {
  const root = path.resolve("examples", name);
  const file = path.join(root, "main.eng");
  const text = fs.readFileSync(file, "utf8");
  const analysis = analyze(file, text, { root, allowApps: true });
  assert.deepEqual(
    analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"),
    [],
  );
  assert.ok(analysis.program);
  const config = JSON.parse(fs.readFileSync(path.join(root, "engcode.json"), "utf8")) as {
    allow?: { network?: string[] };
  };
  const build = compileWeb(analysis.program!, {
    root,
    allowedHosts: config.allow?.network ?? [],
  });
  assert.deepEqual(build.diagnostics, []);

  const window = new Window({ url: "http://localhost/" });
  const bodyStart = build.html.indexOf("<body>");
  const bodyEnd = build.html.indexOf("</body>");
  window.document.body.innerHTML = build.html.slice(bodyStart + "<body>".length, bodyEnd);
  installGlobals(window);
  if (initialise) startApp(build.definition, { startTimers: false });
  return { window, build, document: window.document };
}

test("todo app adds, saves, and clears tasks", async () => {
  const { document, window } = loadExample("todo");
  const input = pick<HTMLInputElement>(document, '[data-eng-id="new task"]');
  const add = pick<HTMLButtonElement>(document, '[data-eng-id="add button"]');
  const clear = pick<HTMLButtonElement>(document, '[data-eng-id="clear button"]');
  const list = pick<HTMLElement>(document, '[data-eng-id="task list"]');

  input.value = "Buy milk";
  add.click();
  await flush();
  assert.match(list.textContent ?? "", /Buy milk/);
  assert.equal(input.value, "");
  assert.ok(window.localStorage.getItem("engcode:Todo List:tasks"));

  clear.click();
  await flush();
  assert.equal(list.textContent ?? "", "");
  window.close();
});

test("notes app saves a note and reloads it on the next open", async () => {
  const first = loadExample("notes");
  const note = pick<HTMLTextAreaElement>(first.document, '[data-eng-id="note"]');
  const save = pick<HTMLButtonElement>(first.document, '[data-eng-id="save button"]');
  const list = pick<HTMLElement>(first.document, '[data-eng-id="notes"]');

  note.value = "Remember the milk";
  save.click();
  await flush();
  assert.match(list.textContent ?? "", /Remember the milk/);
  assert.equal(note.value, "");

  const stored = first.window.localStorage.getItem("engcode:Notes:notes");
  assert.ok(stored);
  first.window.close();

  const second = loadExample("notes", false);
  second.window.localStorage.setItem("engcode:Notes:notes", stored!);
  const secondList = pick<HTMLElement>(second.document, '[data-eng-id="notes"]');
  startApp(second.build.definition, { startTimers: false });
  await flush();
  assert.match(secondList.textContent ?? "", /Remember the milk/);
  second.window.close();
});

test("notes-desktop app creates, opens, pins, and saves notes", async () => {
  const { document, window } = loadExample("notes-desktop");
  await flush();

  const title = pick<HTMLInputElement>(document, '[data-eng-id="title"]');
  const body = pick<HTMLTextAreaElement>(document, '[data-eng-id="body"]');
  const save = pick<HTMLButtonElement>(document, '[data-eng-id="save button"]');
  const newNote = pick<HTMLButtonElement>(document, '[data-eng-id="new button"]');
  const pin = pick<HTMLButtonElement>(document, '[data-eng-id="pin button"]');
  const list = pick<HTMLElement>(document, '[data-eng-id="notes"]');

  title.value = "Grocery list";
  body.value = "Milk and apples";
  save.click();
  await flush();
  assert.match(list.textContent ?? "", /Grocery list/);
  assert.equal(
    pick<HTMLElement>(document, '[data-eng-id="editor heading"]').textContent,
    "Grocery list",
  );
  assert.match(
    list.querySelector('li[aria-current="true"]')?.textContent ?? "",
    /Grocery list/,
  );
  assert.ok(window.localStorage.getItem("engcode:Fluent Notes:notes"));

  newNote.click();
  await flush();
  assert.equal(title.value, "");
  assert.equal(body.value, "");

  const firstItem = list.querySelector("li");
  assert.ok(firstItem);
  firstItem!.click();
  await flush();
  assert.equal(title.value, "Grocery list");
  assert.equal(body.value, "Milk and apples");

  pin.click();
  await flush();
  assert.match(list.textContent ?? "", /Grocery list/);
  assert.equal(
    list.querySelector('li[aria-current="true"]')?.textContent,
    "📌 Grocery list",
  );
  const stored = JSON.parse(
    window.localStorage.getItem("engcode:Fluent Notes:notes") ?? "[]",
  ) as Array<{ title: string; pinned: boolean }>;
  assert.equal(stored[0]?.title, "Grocery list");
  assert.equal(stored[0]?.pinned, true);

  const saved = window.localStorage.getItem("engcode:Fluent Notes:notes")!;
  window.close();

  // Reopening restores the saved notes and highlights the one that is open.
  const second = loadExample("notes-desktop", false);
  second.window.localStorage.setItem("engcode:Fluent Notes:notes", saved);
  startApp(second.build.definition, { startTimers: false });
  await flush();
  const secondList = pick<HTMLElement>(second.document, '[data-eng-id="notes"]');
  assert.equal(
    secondList.querySelector('li[aria-current="true"]')?.textContent,
    "📌 Grocery list",
  );
  assert.equal(
    pick<HTMLInputElement>(second.document, '[data-eng-id="title"]').value,
    "Grocery list",
  );
  second.window.close();
});

test("portfolio app shows a toast when the button is clicked", async () => {
  const { document, window } = loadExample("portfolio");
  const button = pick<HTMLButtonElement>(document, '[data-eng-id="hello button"]');
  button.click();
  await flush();
  const toasts = document.getElementById("eng-toasts");
  assert.ok(toasts);
  assert.match(toasts!.textContent ?? "", /Thanks for stopping by/);
  window.close();
});

test("weather app fills the result from mocked web data", async () => {
  const { document, window } = loadExample("weather");
  const target = globalThis as Record<string, unknown>;
  target.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ current: { temperature_2m: 12.5, wind_speed_10m: 3.4 } }),
  });

  const latitude = pick<HTMLInputElement>(document, '[data-eng-id="latitude"]');
  const longitude = pick<HTMLInputElement>(document, '[data-eng-id="longitude"]');
  const check = pick<HTMLButtonElement>(document, '[data-eng-id="check button"]');
  const result = pick<HTMLElement>(document, '[data-eng-id="result"]');

  latitude.value = "52.52";
  longitude.value = "13.41";
  check.click();
  await flush();
  assert.match(result.textContent ?? "", /12\.5 degrees Celsius/);
  assert.match(result.textContent ?? "", /3\.4 km\/h/);
  window.close();
});

test("pong app renders a canvas and draws a frame", async () => {
  const root = path.resolve("examples", "pong");
  const file = path.join(root, "main.eng");
  const text = fs.readFileSync(file, "utf8");
  const analysis = analyze(file, text, { root, allowApps: true });
  assert.ok(analysis.program);
  const build = compileWeb(analysis.program!, { root });

  const window = new Window({ url: "http://localhost/" });
  const bodyStart = build.html.indexOf("<body>");
  const bodyEnd = build.html.indexOf("</body>");
  window.document.body.innerHTML = build.html.slice(bodyStart + "<body>".length, bodyEnd);
  installGlobals(window);

  const context = fakeContext();
  const prototype = window.HTMLCanvasElement.prototype as unknown as {
    getContext: (kind: string) => FakeContext;
  };
  prototype.getContext = () => context;

  const frames: FrameRequestCallback[] = [];
  (window as unknown as { requestAnimationFrame: (callback: FrameRequestCallback) => number }).requestAnimationFrame =
    (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };

  startApp(build.definition, { startTimers: true });
  const canvas = pick<{ getAttribute: (name: string) => string | null }>(
    window.document as unknown as { querySelector: (selector: string) => unknown },
    "canvas",
  );
  assert.equal(canvas.getAttribute("aria-label"), "board");

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "w" }));
  assert.ok(frames.length > 0);
  frames[0]!(0);
  await flush();
  assert.ok(context.calls.some((call) => call.startsWith("fillRect")));
  assert.ok(context.calls.some((call) => call.startsWith("arc")));
  assert.ok(context.calls.some((call) => call.startsWith("fillText")));
  window.close();
});
