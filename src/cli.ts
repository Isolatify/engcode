#!/usr/bin/env node
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { RuntimeError, renderDiagnostic, type Diagnostic } from "./diagnostics.js";
import { Interpreter, type InputSource, type TraceStep } from "./interpreter.js";
import { analyze, looksLikeApp } from "./program.js";
import type { Token } from "./tokens.js";
import { compileWeb, type WebBuild } from "./web/compiler.js";
import { display } from "./values.js";
import { collectEngFiles, formatFile, type FormatResult } from "./formatter.js";
import { lintSource } from "./lint.js";
import { explainStatement } from "./explain.js";
import { isProjectType, projectFiles, PROJECT_TYPES, type ProjectType } from "./templates.js";
import {
  allLessons,
  findLesson,
  lessonIsCorrect,
  loadProgress,
  saveProgress,
  runLessonExample,
} from "./learn.js";
import { playgroundCommand } from "./playground.js";
import {
  desktopLauncher,
  desktopPackageJson,
  desktopReadme,
  electronMainSource,
  platformFolder,
  platformName,
  type DesktopPlatform,
} from "./desktop/shell.js";

const VERSION = "1.0.0";

interface RunOptions {
  allowNetwork: boolean;
  explain: boolean;
  step: boolean;
}

class BufferedInput implements InputSource {
  private index = 0;

  constructor(private readonly lines: string[]) {}

  readLine(prompt: string): string {
    process.stdout.write(prompt + (prompt.endsWith(" ") ? "" : " "));
    if (this.index >= this.lines.length) {
      throw new Error("The program asked for input, but there was no more input.");
    }
    const line = this.lines[this.index++] ?? "";
    process.stdout.write("\n");
    return line;
  }
}

class TerminalInput implements InputSource {
  readLine(prompt: string): string {
    process.stdout.write(prompt + (prompt.endsWith(" ") ? "" : " "));
    let result = "";
    const buffer = Buffer.alloc(1);
    while (true) {
      let bytes = 0;
      try {
        bytes = fs.readSync(0, buffer, 0, 1, null);
      } catch (error) {
        throw new Error("I could not read the answer. Try running the program in a terminal.");
      }
      if (bytes === 0) {
        if (result.length === 0) {
          throw new Error("The program asked for input, but there was no more input.");
        }
        break;
      }
      const character = buffer.toString("utf8", 0, bytes);
      if (character === "\n") break;
      if (character !== "\r") result += character;
    }
    process.stdout.write("\n");
    return result;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`EngCode ${VERSION}\n`);
    return;
  }

  if (command === "update") {
    process.exitCode = await updateCommand();
    return;
  }

  if (command === "uninstall") {
    process.exitCode = uninstallCommand();
    return;
  }

  switch (command) {
    case "run":
      process.exitCode = runCommand(argv.slice(1));
      return;
    case "check":
      process.exitCode = checkCommand(argv.slice(1));
      return;
    case "repl":
      process.exitCode = replCommand(argv.slice(1));
      return;
    case "serve":
      process.exitCode = await serveCommand(argv.slice(1));
      return;
    case "app":
      process.exitCode = await appCommand(argv.slice(1));
      return;
    case "build":
      process.exitCode = await buildCommand(argv.slice(1));
      return;
    case "new":
      process.exitCode = newCommand(argv.slice(1));
      return;
    case "format":
    case "fmt":
      process.exitCode = formatCommand(argv.slice(1));
      return;
    case "lint":
      process.exitCode = lintCommand(argv.slice(1));
      return;
    case "learn":
      process.exitCode = learnCommand(argv.slice(1));
      return;
    case "playground":
      process.exitCode = await playgroundCommand(argv.slice(1));
      return;
    default:
      process.stderr.write(`I don't know the command "${command}".\n\n`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      "EngCode — Build with Simple English",
      "",
      "Usage:",
      "  engcode run file.eng      run a terminal script",
      "  engcode serve [folder]    run an app in the browser with live reload",
      "  engcode app [folder]      open an app in a desktop window",
      "  engcode build web [folder]      make a static website in dist/",
      "  engcode build windows [folder]  make a Windows desktop project in dist/windows/",
      "  engcode build mac [folder]      make a macOS desktop project in dist/mac/",
      "  engcode check file.eng    find mistakes without running",
      "  engcode lint file.eng     look for risky names and style problems",
      "  engcode format file.eng   tidy indentation and spacing",
      "  engcode new my-project    start a script, website, or app",
      "  engcode learn             the 20-lesson tutorial",
      "  engcode playground        open a local code playground",
      "  engcode repl              type English and run it right away",
      "  engcode update            check for and install a newer version",
      "  engcode uninstall         remove EngCode from this machine",
      "  engcode help              show this help",
      "  engcode version           show the version",
      "",
      "  eng is a short form of engcode — eng run main.eng works too.",
      "",
      "Options for run:",
      "  --allow-network           allow https requests in this run",
      "  --explain                 explain every statement in English",
      "  --step                    pause between statements",
      "",
      "Options for serve:",
      "  --port 3000               choose the first port to try (also -p)",
      "  --host                    share on your network; --host 127.0.0.1 keeps it local",
      "  --open                    open the browser after the server starts",
      "",
      "Options for check and lint:",
      "  --json                    machine-readable diagnostics",
      "  --strict                  treat warnings as errors",
      "  --lint                    include linter advice in check",
      "",
      "Options for format:",
      "  --check                   exit 1 if a file would change",
      "  --stdout                  print the formatted file instead of writing it",
      "",
      "Options for new:",
      "  --type script|website|app|desktop",
      "",
      "Options for learn:",
      "  --run                     run the lesson example",
      "  --file main.eng           run your own attempt",
      "  --done                    mark the lesson complete",
      "  --reset                   clear saved progress",
      "",
      "Options for serve:",
      "  --port 3000               choose the first port to try",
      "  --open                    open the browser after the server starts",
      "",
      "Options for build:",
      "  --out dist                choose the output folder",
      "  --minify                  shrink the generated files",
      "",
      "This build includes terminal scripts, web apps, and desktop apps:",
      "pages, themes, styles, animations, events, reactive state, routing,",
      "storage, web data, media, and canvas.",
      "",
      "Opening or packaging a desktop app needs Electron. Install it once with:",
      "  npm install --save-dev electron",
      "",
    ].join("\n"),
  );
}

function parseRunOptions(args: string[]): RunOptions {
  return {
    allowNetwork: args.includes("--allow-network"),
    explain: args.includes("--explain"),
    step: args.includes("--step"),
  };
}

class StepQuit extends Error {
  constructor() {
    super("Stopped by the learner.");
  }
}

/** Compare two dotted versions: negative if a < b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function updateCommand(): Promise<number> {
  process.stdout.write("Checking for a newer version of EngCode…\n");
  const view = process.platform === "win32"
    ? spawnSync("npm view engcode version", { encoding: "utf8", timeout: 30_000, shell: true })
    : spawnSync("npm", ["view", "engcode", "version"], { encoding: "utf8", timeout: 30_000 });
  if (view.error || view.status !== 0) {
    process.stderr.write(
      "I could not reach npm to check for updates. Are you online?\n" +
        `You can always check by hand: npm view engcode version\n`,
    );
    return 1;
  }
  const latest = String(view.stdout.trim().split("\n").at(-1) ?? "").replace(/^[\"']|[\"']$/g, "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(latest)) {
    process.stderr.write(`npm gave me an answer I could not read: "${latest}".\n`);
    return 1;
  }
  if (compareVersions(VERSION, latest) >= 0) {
    process.stdout.write(`EngCode ${VERSION} is already the newest version.\n`);
    return 0;
  }
  process.stdout.write(`Updating EngCode ${VERSION} → ${latest}…\n`);
  const install = process.platform === "win32"
    ? spawnSync(`npm install -g engcode@${latest}`, { stdio: "inherit", timeout: 120_000, shell: true })
    : spawnSync("npm", ["install", "-g", `engcode@${latest}`], { stdio: "inherit", timeout: 120_000 });
  if (install.error || (install.status !== 0 && install.status !== null)) {
    process.stderr.write(
      "The update did not finish. Try it by hand:\n" +
        `  npm install -g engcode@latest\n`,
    );
    return 1;
  }
  process.stdout.write(`Updated to EngCode ${latest}.\n`);
  return 0;
}

function uninstallCommand(): number {
  const dataDir = path.join(os.homedir(), ".engcode");
  let removedAnything = false;
  try {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      removedAnything = true;
    }
  } catch (error) {
    process.stderr.write(
      `I could not remove ${dataDir}: ${error instanceof Error ? error.message : String(error)}\n` +
        "Remove it by hand if it still exists.\n",
    );
    return 1;
  }
  process.stdout.write(
    removedAnything
      ? `Removed ${dataDir} — lesson progress, saved app data and caches.\n`
      : "There is no EngCode data folder on this machine.\n",
  );
  process.stdout.write(
    "\nTo finish uninstalling, let npm remove the command itself:\n" +
      "  npm uninstall -g engcode\n",
  );
  return 0;
}

function runCommand(args: string[]): number {
  const options = parseRunOptions(args);
  resetTrace();
  const entry = findEntryFile(args);
  if (!entry) return 1;
  const file = entry.file;

  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`I could not open "${file}".\n`);
    return 1;
  }

  if (looksLikeApp(text)) {
    process.stderr.write(
      [
        "This is an app, not a terminal script.",
        "",
        "Open it in the browser with: engcode serve " + quotePath(entry.root),
        "Or build a static website with: engcode build web " + quotePath(entry.root),
        "Or open a desktop window with: engcode app " + quotePath(entry.root),
        "",
      ].join("\n"),
    );
    return 1;
  }

  const root = entry.root;
  const analysis = analyze(file, text, { root });
  if (analysis.diagnostics.length > 0) {
    for (const diagnostic of analysis.diagnostics) {
      process.stderr.write(renderDiagnostic(diagnostic) + "\n\n");
    }
    return 1;
  }

  if (!analysis.program) {
    process.stderr.write("I could not read this program.\n");
    return 2;
  }

  const interpreter = new Interpreter({
    write: (output) => process.stdout.write(output),
    input: createInput(),
    fileRoot: root,
    allowNetwork: options.allowNetwork,
    ...(options.explain || options.step
      ? {
          onStep: (step: TraceStep) => {
            printStep(step, options.step);
          },
        }
      : {}),
  });

  try {
    interpreter.run(analysis.program);
    return 0;
  } catch (error) {
    if (error instanceof StepQuit) {
      process.stderr.write("\nStopped at your request.\n");
      return 0;
    }
    if (error instanceof RuntimeError) {
      process.stderr.write("\n" + renderDiagnostic(error.diagnostic) + "\n\n");
      return 1;
    }
    if (error instanceof Error) {
      process.stderr.write(`\nSomething went wrong: ${error.message}\n`);
      return 1;
    }
    process.stderr.write("\nSomething unexpected went wrong. Please report the file you were running.\n");
    return 2;
  }
}

function replCommand(args: string[]): number {
  const options = parseRunOptions(args);
  const root = process.cwd();
  const interpreter = new Interpreter({
    write: (output) => process.stdout.write(output),
    input: {
      readLine: (prompt) => {
        const line = readReplLine(prompt);
        if (line === null) {
          throw new Error("The program asked for input, but the input ended.");
        }
        return line;
      },
    },
    fileRoot: root,
    allowNetwork: options.allowNetwork,
  });

  let history: Token[] = [];
  let buffer: string[] = [];
  let depth = 0;

  process.stdout.write(
    [
      "EngCode REPL — Build with Simple English",
      'Type English and press Enter. Type ":help" for commands and ":quit" to leave.',
      "Blocks continue on the next line until their \"end\".",
      "",
    ].join("\n"),
  );

  while (true) {
    const prompt = buffer.length > 0 ? "... " : "> ";
    const line = readReplLine(prompt);
    if (line === null) {
      process.stdout.write("\n");
      return 0;
    }

    const trimmed = line.trim();
    if (buffer.length === 0 && trimmed.startsWith(":")) {
      const [name, ...rest] = trimmed.slice(1).split(/\s+/);
      const argument = rest.join(" ").trim();
      switch (name.toLowerCase()) {
        case "quit":
        case "exit":
        case "q":
          process.stdout.write("Goodbye.\n");
          return 0;
        case "help":
          process.stdout.write(
            [
              "REPL commands:",
              "  :help          show this help",
              "  :clear         forget every name",
              "  :load file.eng run a file in this session",
              "  :quit          leave the REPL",
              "",
            ].join("\n"),
          );
          continue;
        case "clear":
          interpreter.reset();
          history = [];
          buffer = [];
          depth = 0;
          process.stdout.write("Cleared.\n");
          continue;
        case "load": {
          if (argument.length === 0) {
            process.stderr.write('Which file? Try ":load main.eng".\n');
            continue;
          }
          const file = path.resolve(root, argument);
          let text: string;
          try {
            text = fs.readFileSync(file, "utf8");
          } catch {
            process.stderr.write(`I could not open "${argument}".\n`);
            continue;
          }
          const loaded = analyze(file, text, { root: path.dirname(file) });
          if (loaded.diagnostics.length > 0 || !loaded.program) {
            for (const diagnostic of loaded.diagnostics) {
              process.stderr.write(renderDiagnostic(diagnostic) + "\n\n");
            }
            continue;
          }
          try {
            interpreter.run(loaded.program);
            history.push(...loaded.tokens);
          } catch (error) {
            reportRuntimeError(error);
          }
          continue;
        }
        default:
          process.stderr.write(`I don't know the REPL command ":${name}". Try ":help".\n`);
          continue;
      }
    }

    buffer.push(line);
    depth = Math.max(0, depth + lineOpensBlock(line));
    if (depth > 0) continue;

    const source = buffer.join("\n");
    buffer = [];
    depth = 0;
    if (source.trim().length === 0) continue;

    const analysis = analyze(path.join(root, "<repl>"), source, {
      root,
      earlierTokens: history,
    });
    if (!analysis.program) {
      for (const diagnostic of analysis.diagnostics) {
        process.stderr.write(renderDiagnostic(diagnostic) + "\n\n");
      }
      continue;
    }

    history.push(...analysis.tokens);
    if (analysis.diagnostics.length > 0) {
      for (const diagnostic of analysis.diagnostics) {
        process.stderr.write(renderDiagnostic(diagnostic) + "\n\n");
      }
      continue;
    }

    try {
      interpreter.run(analysis.program);
    } catch (error) {
      reportRuntimeError(error);
    }
  }
}

/** Reads one line from the terminal. Returns null when the input has ended. */
function readReplLine(prompt: string): string | null {
  process.stdout.write(prompt);
  let result = "";
  let sawAnything = false;
  const buffer = Buffer.alloc(1);
  while (true) {
    let bytes = 0;
    try {
      bytes = fs.readSync(0, buffer, 0, 1, null);
    } catch {
      return sawAnything ? result : null;
    }
    if (bytes === 0) return sawAnything ? result : null;
    sawAnything = true;
    const character = buffer.toString("utf8", 0, bytes);
    if (character === "\n") break;
    if (character !== "\r") result += character;
  }
  return result;
}

/** Tracks whether a REPL line leaves a block open. */
function lineOpensBlock(line: string): number {
  let text = line;
  let inText = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === "\\") {
      i += 1;
      continue;
    }
    if (character === '"') inText = !inText;
    if (!inText && character === "n" && text.slice(i, i + 5).toLowerCase() === "note:") {
      const before = i === 0 ? " " : text[i - 1]!;
      if (/\s/.test(before)) {
        text = text.slice(0, i);
        break;
      }
    }
  }

  const trimmed = text.trim();
  let delta = 0;
  if (/^\s*end\b/i.test(trimmed)) delta -= 1;
  if (opensWithColon(trimmed)) delta += 1;
  return delta;
}

function opensWithColon(line: string): boolean {
  let inText = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === "\\") {
      i += 1;
      continue;
    }
    if (character === '"') inText = !inText;
  }
  return !inText && line.endsWith(":");
}

function reportRuntimeError(error: unknown): void {
  if (error instanceof RuntimeError) {
    process.stderr.write("\n" + renderDiagnostic(error.diagnostic) + "\n\n");
    return;
  }
  if (error instanceof Error) {
    process.stderr.write(`\nSomething went wrong: ${error.message}\n`);
    return;
  }
  process.stderr.write("\nSomething unexpected went wrong.\n");
}

let traceCount = 0;
let traceTruncated = false;

function resetTrace(): void {
  traceCount = 0;
  traceTruncated = false;
}

function printStep(step: TraceStep, pause: boolean): void {
  traceCount += 1;
  if (traceCount > 200) {
    if (!traceTruncated) {
      traceTruncated = true;
      process.stderr.write("\n… more steps follow. The explanation stops after 200 steps.\n");
    }
    return;
  }

  process.stderr.write(
    `\nStep ${step.step} · line ${step.line}\n  ${step.source}\n  → ${explainStatement(step.statement)}\n`,
  );

  if (!pause) return;
  if (!process.stdin.isTTY) {
    process.stderr.write("  (--step needs a terminal to pause; continuing automatically.)\n");
    return;
  }

  while (true) {
    process.stderr.write("  Press Enter for the next step, v for names, or q to quit: ");
    const answer = readReplLine("");
    if (answer === null) return;
    const command = answer.trim().toLowerCase();
    if (command === "q" || command === "quit") throw new StepQuit();
    if (command === "v" || command === "variables") {
      const names = step.env.allNames().sort((a, b) => a.localeCompare(b));
      if (names.length === 0) {
        process.stderr.write("  No names yet.\n");
      } else {
        for (const name of names) {
          process.stderr.write(`  ${name} = ${display(step.env.get(name) ?? null)}\n`);
        }
      }
      continue;
    }
    return;
  }
}

function checkCommand(args: string[]): number {
  const json = args.includes("--json");
  const includeLint = args.includes("--lint");
  const strict = args.includes("--strict");
  const entry = findEntryFile(args.filter((arg) => !arg.startsWith("--")));
  if (!entry) return 1;
  const file = entry.file;

  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`I could not open "${file}".\n`);
    return 1;
  }

  const analysis = analyze(file, text, { root: entry.root, allowApps: true });
  const diagnostics = includeLint
    ? [...analysis.diagnostics, ...lintSource(file, text)]
    : analysis.diagnostics;
  const errors = diagnostics.filter((diagnostic) => strict || diagnostic.severity !== "warning");
  if (json) {
    process.stdout.write(JSON.stringify(toJson(diagnostics), null, 2) + "\n");
    return errors.length > 0 ? 1 : 0;
  }

  printDiagnostics(diagnostics);
  if (errors.length > 0) return 1;

  if (diagnostics.length > 0) {
    process.stdout.write(`No errors in ${path.basename(file)}. ${diagnostics.length} warning${diagnostics.length === 1 ? "" : "s"}.\n`);
    return 0;
  }

  process.stdout.write(`No problems found in ${path.basename(file)}.\n`);
  return 0;
}

// ------------------------------------------------------------ project helpers

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function newCommand(args: string[]): number {
  const target = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--type");
  if (!target) {
    process.stderr.write(
      [
        "Which folder should I create?",
        "",
        "Try: engcode new my-project --type script",
        `Kinds: ${PROJECT_TYPES.join(", ")}`,
        "",
      ].join("\n"),
    );
    return 1;
  }

  let type = optionValue(args, "--type") ?? optionValue(args, "--template");
  if (!type) {
    if (process.stdin.isTTY) {
      process.stdout.write(`What kind of project? (${PROJECT_TYPES.join(", ")}) [script]: `);
      const answer = readReplLine("");
      type = answer && answer.trim().length > 0 ? answer.trim() : "script";
      process.stdout.write("\n");
    } else {
      type = "script";
    }
  }
  if (!isProjectType(type)) {
    process.stderr.write(
      `I don't know the project kind "${type}". Choose ${PROJECT_TYPES.join(", ")}.\n`,
    );
    return 1;
  }

  const folder = path.resolve(target);
  if (fs.existsSync(folder)) {
    process.stderr.write(
      `"${target}" already exists. Choose a new folder name so I never overwrite your work.\n`,
    );
    return 1;
  }

  const kind: ProjectType = type.toLowerCase() as ProjectType;
  const files = projectFiles(path.basename(folder), kind);
  fs.mkdirSync(folder, { recursive: true });
  for (const file of files) {
    const destination = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, "utf8");
  }

  process.stdout.write(
    [
      `Created "${path.basename(folder)}" (${kind}) with ${files.length} files.`,
      `Folder: ${folder}`,
      "",
      "Next:",
      `  cd ${quotePath(target)}`,
      ...(kind === "desktop" ? ["  npm install"] : []),
      "  engcode check main.eng",
      kind === "script" ? "  engcode run main.eng" : "  engcode serve .",
      kind === "desktop" ? "  engcode app ." : "",
      "",
      "Stuck? Run: engcode learn",
      "",
    ]
      .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1] !== ""))
      .join("\n"),
  );
  return 0;
}

function formatCommand(args: string[]): number {
  const check = args.includes("--check");
  const stdout = args.includes("--stdout");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const target = positional[0] ?? (fs.existsSync(path.resolve("main.eng")) ? "main.eng" : undefined);
  if (!target) {
    process.stderr.write('Which file should I format? Try: engcode format main.eng\n');
    return 1;
  }

  let files: string[];
  try {
    files = collectEngFiles(target);
  } catch {
    process.stderr.write(`I could not find "${target}".\n`);
    return 1;
  }
  if (files.length === 0) {
    process.stderr.write(`I did not find any .eng files in "${target}".\n`);
    return 1;
  }
  if (stdout && files.length !== 1) {
    process.stderr.write("--stdout works with one file at a time.\n");
    return 1;
  }

  const results: FormatResult[] = [];
  for (const file of files) {
    try {
      results.push(formatFile(file));
    } catch {
      process.stderr.write(`I could not read "${file}".\n`);
      return 1;
    }
  }

  const failures = results.filter((result) => result.error);
  for (const failure of failures) {
    process.stderr.write(renderDiagnostic(failure.error!) + "\n\n");
  }
  if (failures.length > 0) return 1;

  if (stdout) {
    process.stdout.write(results[0]!.formatted);
    return 0;
  }

  if (check) {
    const changed = results.filter((result) => result.changed);
    for (const result of changed) {
      process.stdout.write(`Would format ${displayPath(result.file)}\n`);
    }
    process.stdout.write(
      changed.length === 0
        ? `${results.length} file${results.length === 1 ? " is" : "s are"} already formatted.\n`
        : `${changed.length} file${changed.length === 1 ? "" : "s"} would change. Run engcode format to write the changes.\n`,
    );
    return changed.length > 0 ? 1 : 0;
  }

  let written = 0;
  for (const result of results) {
    if (!result.changed) continue;
    fs.writeFileSync(result.file, result.formatted, "utf8");
    written += 1;
  }
  process.stdout.write(
    written === 0
      ? `${results.length} file${results.length === 1 ? " is" : "s are"} already formatted.\n`
      : `Formatted ${written} file${written === 1 ? "" : "s"}.\n`,
  );
  return 0;
}

function lintCommand(args: string[]): number {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const target = positional[0] ?? (fs.existsSync(path.resolve("main.eng")) ? "main.eng" : undefined);
  if (!target) {
    process.stderr.write('Which file should I lint? Try: engcode lint main.eng\n');
    return 1;
  }

  let files: string[];
  try {
    files = collectEngFiles(target);
  } catch {
    process.stderr.write(`I could not find "${target}".\n`);
    return 1;
  }

  const entries: { file: string; diagnostics: Diagnostic[] }[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      process.stderr.write(`I could not read "${file}".\n`);
      return 1;
    }
    entries.push({ file, diagnostics: lintSource(file, text) });
  }

  const total = entries.reduce((sum, entry) => sum + entry.diagnostics.length, 0);
  if (json) {
    process.stdout.write(
      JSON.stringify(
        entries.flatMap((entry) =>
          toJson(entry.diagnostics).map((item) => ({ file: entry.file, ...(item as object) })),
        ),
        null,
        2,
      ) + "\n",
    );
    return strict && total > 0 ? 1 : 0;
  }

  for (const entry of entries) {
    for (const diagnostic of entry.diagnostics) {
      process.stderr.write(`Warning: ${renderDiagnostic(diagnostic)}\n\n`);
    }
  }

  if (total === 0) {
    process.stdout.write(
      `No lint notes in ${files.length === 1 ? path.basename(files[0]!) : `${files.length} files`}.\n`,
    );
    return 0;
  }
  process.stdout.write(
    `${total} lint note${total === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}.\n`,
  );
  return strict ? 1 : 0;
}

function learnCommand(args: string[]): number {
  const folder = process.cwd();
  const progress = loadProgress(folder);

  if (args.includes("--reset")) {
    saveProgress({ completed: [], attempts: {} }, folder);
    process.stdout.write("Tutorial progress cleared.\n");
    if (!args.some((arg) => /^\d+$/.test(arg))) return 0;
  }

  const idArg = args.find((arg) => /^\d+$/.test(arg));
  if (!idArg) {
    process.stdout.write(
      [
        "EngCode in 20 short lessons",
        "",
        ...allLessons().map((lesson) => {
          const done = progress.completed.includes(lesson.id) ? "✓" : " ";
          return `  [${done}] ${String(lesson.id).padStart(2)}. ${lesson.title}`;
        }),
        "",
        `${progress.completed.length} of ${allLessons().length} complete.`,
        "",
        "Start a lesson with: engcode learn 1",
        "Run its example with: engcode learn 1 --run",
        "Try your own file with: engcode learn 1 --file main.eng",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const lesson = findLesson(Number(idArg));
  if (!lesson) {
    process.stderr.write(`There is no lesson ${idArg}. Choose a number from 1 to ${allLessons().length}.\n`);
    return 1;
  }

  if (args.includes("--done")) {
    if (!progress.completed.includes(lesson.id)) progress.completed.push(lesson.id);
    saveProgress(progress, folder);
    process.stdout.write(`Lesson ${lesson.id} marked complete.\n`);
    return 0;
  }

  if (args.includes("--run")) {
    process.stdout.write(`Lesson ${lesson.id}: ${lesson.title}\n\n`);
    const result = runLessonExample(lesson, folder);
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(diagnostic + "\n\n");
    }
    if (result.output.length > 0) process.stdout.write(result.output);
    if (!result.ok) return 1;
    if (lesson.expected && !lesson.app && !lessonIsCorrect(lesson, result.output)) {
      process.stdout.write(`\nExpected output:\n${lesson.expected.split("\n").map((line) => "  " + line).join("\n")}\n`);
      return 1;
    }
    process.stdout.write("\nThat is the example. Now try the task yourself.\n");
    return 0;
  }

  const attemptFile = optionValue(args, "--file");
  if (!attemptFile) {
    process.stdout.write(
      [
        `Lesson ${lesson.id}: ${lesson.title}`,
        "",
        lesson.idea,
        "",
        "Example:",
        ...lesson.example.split("\n").map((line) => "  " + line),
        ...(lesson.files ?? []).flatMap((file) => [
          "",
          `  ${file.name}:`,
          ...file.content.split("\n").map((line) => "    " + line),
        ]),
        "",
        `Task: ${lesson.task}`,
        "",
        "When you are ready:",
        `  engcode learn ${lesson.id} --run`,
        `  engcode learn ${lesson.id} --file main.eng`,
        "",
      ].join("\n"),
    );
    return 0;
  }

  const file = path.resolve(attemptFile);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`I could not open "${attemptFile}".\n`);
    return 1;
  }
  const analysis = analyze(file, text, {
    root: path.dirname(file),
    allowApps: true,
  });
  const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning");
  if (errors.length > 0 || !analysis.program) {
    for (const diagnostic of errors) {
      process.stderr.write(renderDiagnostic(diagnostic) + "\n\n");
    }
    return 1;
  }

  let output = "";
  if (!lesson.app) {
    try {
      const interpreter = new Interpreter({
        write: (chunk) => {
          output += chunk;
        },
        input: {
          readLine: (prompt) => {
            const answers = lesson.input ?? [];
            const next = answers.shift();
            if (next === undefined) {
              throw new Error(`The lesson expected an answer for "${prompt}".`);
            }
            return next;
          },
        },
        fileRoot: path.dirname(file),
        maxSteps: 100_000,
      });
      interpreter.run(analysis.program);
    } catch (error) {
      process.stderr.write(
        `Your program stopped: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      recordAttempt(lesson.id, progress, folder);
      return 1;
    }
  }

  if (output.length > 0) process.stdout.write(output);
  const correct = lesson.app || lessonIsCorrect(lesson, output);
  if (correct) {
    if (!progress.completed.includes(lesson.id)) progress.completed.push(lesson.id);
    delete progress.attempts[String(lesson.id)];
    saveProgress(progress, folder);
    process.stdout.write(`\nLesson ${lesson.id} complete. Well done.\n`);
    return 0;
  }

  const attempts = recordAttempt(lesson.id, progress, folder);
  process.stdout.write("\nNot quite yet.\n");
  if (lesson.expected) {
    process.stdout.write(`Expected output:\n${lesson.expected.split("\n").map((line) => "  " + line).join("\n")}\n`);
  }
  if (attempts >= 2) {
    process.stdout.write(`\nHint: ${lesson.hint}\n`);
  }
  return 1;
}

function recordAttempt(id: number, progress: ReturnType<typeof loadProgress>, folder: string): number {
  const key = String(id);
  const attempts = (progress.attempts[key] ?? 0) + 1;
  progress.attempts[key] = attempts;
  saveProgress(progress, folder);
  return attempts;
}

function displayPath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  return relative.length > 0 && !relative.startsWith("..") ? relative : file;
}

// ------------------------------------------------------------------ web builds

interface AppConfig {
  name?: string;
  entry?: string;
  allow?: { network?: string[] };
}

interface AppBuild {
  build: WebBuild;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

function readAppConfig(root: string): AppConfig {
  const file = path.join(root, "engcode.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as AppConfig;
  } catch {
    return {};
  }
}

function buildApp(
  entry: EntryPoint,
  options: { liveReload?: boolean; minify?: boolean },
): AppBuild | null {
  let text: string;
  try {
    text = fs.readFileSync(entry.file, "utf8");
  } catch {
    process.stderr.write(`I could not open "${entry.file}".\n`);
    return null;
  }

  const analysis = analyze(entry.file, text, { root: entry.root, allowApps: true });
  const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning");
  const warnings = analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  if (errors.length > 0 || !analysis.program) {
    return {
      build: {
        html: "",
        css: "",
        js: "",
        runtime: "",
        assets: [],
        appName: "",
        definition: { name: "", body: [], pages: [] },
        diagnostics: errors,
        warnings,
      },
      errors,
      warnings,
    };
  }

  const config = readAppConfig(entry.root);
  const build = compileWeb(analysis.program, {
    root: entry.root,
    allowedHosts: config.allow?.network ?? [],
    liveReload: options.liveReload ?? false,
    minify: options.minify ?? false,
  });
  return { build, errors: build.diagnostics, warnings: [...warnings, ...build.warnings] };
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const prefix = diagnostic.severity === "warning" ? "Warning: " : "";
    process.stderr.write(prefix + renderDiagnostic(diagnostic) + "\n\n");
  }
}

function writeBuild(build: WebBuild, output: string): string[] {
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(path.join(output, "assets"), { recursive: true });
  const written: string[] = [];
  const write = (name: string, content: string): void => {
    const file = path.join(output, name);
    fs.writeFileSync(file, content, "utf8");
    written.push(file);
  };
  write("index.html", build.html);
  write("styles.css", build.css);
  write("app.js", build.js);
  write("runtime.js", build.runtime);
  for (const asset of build.assets) {
    const target = path.join(output, asset.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(asset.from, target);
    written.push(target);
  }
  return written;
}

function desktopPlatforms(command: string): DesktopPlatform | null {
  if (command === "windows" || command === "win") return "windows";
  if (command === "mac" || command === "macos" || command === "darwin") return "mac";
  if (command === "linux") return "linux";
  return null;
}

function findElectron(root: string): string | null {
  const require = createRequire(import.meta.url);
  for (const base of [root, process.cwd()]) {
    try {
      const resolved = require.resolve("electron", { paths: [base] });
      const candidate: unknown = require(resolved);
      if (typeof candidate === "string" && fs.existsSync(candidate)) return candidate;
    } catch {
      // Try the next place Electron could be installed.
    }
  }
  return null;
}

function writeDesktopProject(
  build: WebBuild,
  output: string,
  platform: DesktopPlatform,
): string[] {
  fs.mkdirSync(output, { recursive: true });
  const written: string[] = [];
  const write = (name: string, content: string): void => {
    const file = path.join(output, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    written.push(file);
  };

  written.push(...writeBuild(build, path.join(output, "app")));
  write("main.cjs", electronMainSource(build.appName));
  write("package.json", desktopPackageJson(build.appName, platform));
  write("README.md", desktopReadme(build.appName, platform));
  write(platform === "windows" ? "run.cmd" : "run.sh", desktopLauncher(platform));
  return written;
}

async function appCommand(args: string[]): Promise<number> {
  const entry = findEntryFile(args.filter((arg) => !arg.startsWith("--")));
  if (!entry) return 1;

  const result = buildApp(entry, { minify: false });
  if (!result) return 1;
  printDiagnostics(result.warnings);
  if (result.errors.length > 0) {
    printDiagnostics(result.errors);
    return 1;
  }

  const platform: DesktopPlatform =
    process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const output = path.join(entry.root, ".engcode", "desktop");
  const written = writeDesktopProject(result.build, output, platform);

  const electron = findElectron(entry.root);
  if (!electron) {
    process.stdout.write(
      [
        `I prepared "${result.build.appName}" for a desktop window.`,
        `Desktop project: ${output}`,
        `${written.length} files written.`,
        "",
        "I need Electron to open the window. Install it once in this project:",
        "  npm install --save-dev electron",
        "",
        `Then run: engcode app ${quotePath(entry.root)}`,
        "",
      ].join("\n"),
    );
    return 1;
  }

  process.stdout.write(`Opening "${result.build.appName}" in an Electron window...\n`);
  return await new Promise<number>((resolve) => {
    const child = spawn(electron, ["."], { cwd: output, stdio: "inherit" });
    child.on("error", (error) => {
      process.stderr.write(`I could not start Electron: ${error.message}\n`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function buildDesktopCommand(platform: DesktopPlatform, rest: string[]): Promise<number> {
  const outputIndex = rest.indexOf("--out");
  const output =
    outputIndex >= 0 && rest[outputIndex + 1]
      ? path.resolve(rest[outputIndex + 1]!)
      : path.resolve("dist", platformFolder(platform));
  const filtered = rest.filter((arg, index) => {
    if (arg === "--out") return false;
    if (index > 0 && rest[index - 1] === "--out") return false;
    return !arg.startsWith("--");
  });

  const entry = findEntryFile(filtered);
  if (!entry) return 1;

  const result = buildApp(entry, { minify: rest.includes("--minify") });
  if (!result) return 1;
  printDiagnostics(result.warnings);
  if (result.errors.length > 0) {
    printDiagnostics(result.errors);
    return 1;
  }

  const written = writeDesktopProject(result.build, output, platform);
  const label = platformName(platform);
  const launcher = platform === "windows" ? "run.cmd" : "run.sh";
  process.stdout.write(
    [
      `Built "${result.build.appName}" for ${label}.`,
      `Output: ${output}`,
      `${written.length} files written.`,
      "",
      "To run it:",
      `  cd ${quotePath(output)}`,
      "  npm install",
      "  npm start",
      "",
      `Or use the generated launcher: ${launcher}`,
      "To make a release folder: npm run package",
      platform === "mac"
        ? "macOS releases must be packaged on a Mac. Signing and notarization are separate steps."
        : platform === "windows"
          ? "Code signing is a separate step."
          : "",
      "",
    ]
      .filter((line) => line.length > 0)
      .join("\n") + "\n",
  );
  return 0;
}

async function buildCommand(args: string[]): Promise<number> {
  const kind = args[0];
  const rest = args.slice(1);
  const desktop = kind ? desktopPlatforms(kind) : null;
  if (desktop) return buildDesktopCommand(desktop, rest);

  if (kind !== "web") {
    process.stderr.write(
      [
        'I can build a website with "engcode build web".',
        'Or a desktop project with "engcode build windows" or "engcode build mac".',
        "",
      ].join("\n"),
    );
    return 1;
  }

  const outputIndex = rest.indexOf("--out");
  const output =
    outputIndex >= 0 && rest[outputIndex + 1]
      ? path.resolve(rest[outputIndex + 1]!)
      : path.resolve("dist");
  const filtered = rest.filter((arg, index) => {
    if (arg === "--out") return false;
    if (index > 0 && rest[index - 1] === "--out") return false;
    return !arg.startsWith("--");
  });

  const entry = findEntryFile(filtered);
  if (!entry) return 1;

  const result = buildApp(entry, { minify: rest.includes("--minify") });
  if (!result) return 1;
  printDiagnostics(result.warnings);
  if (result.errors.length > 0) {
    printDiagnostics(result.errors);
    return 1;
  }

  const written = writeBuild(result.build, output);
  process.stdout.write(
    [
      `Built "${result.build.appName}" for the web.`,
      `Output: ${output}`,
      `${written.length} file${written.length === 1 ? "" : "s"} written.`,
      "Open index.html in a browser, or run: engcode serve",
      "",
    ].join("\n"),
  );
  return 0;
}

async function serveCommand(args: string[]): Promise<number> {
  // Next.js-style flag parsing: --port N (also -p N), --host [addr], --open.
  let port = 3000;
  const portAliasIndex = args.indexOf("-p");
  const portIndex = portAliasIndex >= 0 ? portAliasIndex : args.indexOf("--port");
  if (portIndex >= 0 && args[portIndex + 1]) {
    const parsed = Number(args[portIndex + 1]);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      process.stderr.write("The port must be a whole number from 1 to 65535.\n");
      return 1;
    }
    port = parsed;
  }

  // --host with a value binds that address; bare --host binds all interfaces.
  const hostIndex = args.indexOf("--host");
  let host = "0.0.0.0";
  if (hostIndex >= 0 && args[hostIndex + 1] && !args[hostIndex + 1]!.startsWith("-")) {
    host = String(args[hostIndex + 1]);
  }

  const filtered = args.filter((arg, index) => {
    if (arg === "--port" || arg === "-p" || arg === "--host" || arg === "--open") return false;
    if (index > 0) {
      const previous = args[index - 1];
      if (previous === "--port" || previous === "-p") return false;
      if (previous === "--host" && !arg.startsWith("-")) return false;
    }
    return !arg.startsWith("--");
  });
  const entry = findEntryFile(filtered);
  if (!entry) return 1;

  let current = buildApp(entry, { liveReload: true, minify: false });
  if (!current) return 1;
  if (current.errors.length > 0) {
    printDiagnostics(current.warnings);
    printDiagnostics(current.errors);
    return 1;
  }
  printDiagnostics(current.warnings);

  const clients = new Set<http.ServerResponse>();
  const broadcast = (event: string, data: string): void => {
    for (const client of clients) {
      client.write(`event: ${event}\ndata: ${data}\n\n`);
    }
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/__engcode/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      response.write("event: ready\ndata: {}\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (pathname === "/__engcode/livereload.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(LIVE_RELOAD_CLIENT);
      return;
    }

    const build = current?.build;
    if (!build) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("The app has not built yet.");
      return;
    }

    let name = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (name === "index.html" || name === "styles.css" || name === "app.js" || name === "runtime.js") {
      const content =
        name === "index.html"
          ? build.html
          : name === "styles.css"
            ? build.css
            : name === "app.js"
              ? build.js
              : build.runtime;
      const type =
        name === "index.html"
          ? "text/html; charset=utf-8"
          : name === "styles.css"
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8";
      response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      response.end(content);
      return;
    }

    const asset = build.assets.find((item) => `/${item.to}` === pathname || item.to === name);
    if (asset) {
      try {
        const content = fs.readFileSync(asset.from);
        response.writeHead(200, { "Content-Type": contentType(asset.to), "Cache-Control": "no-store" });
        response.end(content);
        return;
      } catch {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`I could not find ${pathname}.`);
  });

  let debounce: NodeJS.Timeout | undefined;
  const rebuild = (): void => {
    const result = buildApp(entry, { liveReload: true, minify: false });
    if (!result) return;
    const allWarnings = result.warnings;
    if (result.errors.length > 0) {
      const messages = result.errors.map((diagnostic) => renderDiagnostic(diagnostic));
      broadcast("build-error", JSON.stringify(messages));
      process.stderr.write("\n" + messages.join("\n\n") + "\n\n");
      return;
    }
    current = result;
    for (const warning of allWarnings) {
      process.stderr.write("Warning: " + renderDiagnostic(warning) + "\n\n");
    }
    process.stdout.write("Rebuilt. Reloading the browser.\n");
    broadcast("reload", "{}");
  };

  // Watch every .eng file in the project. `recursive` is supported on the
  // platforms EngCode ships for; a single-folder fallback keeps it portable.
  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(entry.root, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith(".eng")) return;
      if (String(filename).includes(".engcode")) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    });
  } catch {
    watcher = fs.watch(entry.root, (_event, filename) => {
      if (!filename || !String(filename).endsWith(".eng")) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    });
  }

  const actualPort = await listenWithFallback(server, port, host);
  if (actualPort === null) {
    process.stderr.write(`I could not start a server on port ${port} or the next 10 ports.\n`);
    watcher.close();
    return 1;
  }
  if (actualPort !== port) {
    process.stdout.write(
      `⚠ Port ${port} is in use, using available port ${actualPort} instead.\n\n`,
    );
  }

  // Next.js-style startup banner.
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";
  const localUrl = `http://localhost:${actualPort}/`;
  const networkIp = host === "0.0.0.0" ? localNetworkAddress() : undefined;
  const networkUrl = networkIp ? `http://${networkIp}:${actualPort}/` : undefined;
  const banner: string[] = [
    `  ${bold}▲ EngCode ${VERSION}${reset} ${dim}— Build with Simple English${reset}`,
    "",
    `   ${bold}- Local${reset}:	${localUrl}`,
  ];
  if (networkUrl) banner.push(`   ${bold}- Network${reset}:	${networkUrl}`);
  process.stdout.write(banner.join("\n") + "\n\n");
  process.stdout.write(
    ` ${bold}\x1b[32m✓\x1b[0m${reset} Serving "${current.build.appName}" — press Ctrl+C to stop\n\n`,
  );
  process.stdout.write(`${dim}  Watching ${entry.root} for changes${reset}\n\n`);
  if (args.includes("--open")) openBrowser(localUrl);

  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": keep-alive\n\n");
  }, 20_000);

  return await new Promise<number>((resolve) => {
    const stop = (): void => {
      clearInterval(heartbeat);
      watcher?.close();
      for (const client of clients) client.end();
      process.stdout.write(`\n ${bold}\x1b[32m✓\x1b[0m${reset} Stopped. Goodbye.\n`);
      server.close(() => resolve(0));
      setTimeout(() => resolve(0), 500);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function localNetworkAddress(): string | undefined {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return undefined;
}

function listenWithFallback(server: http.Server, start: number, host: string): Promise<number | null> {
  return new Promise((resolve) => {
    let port = start;
    const attempts = 10;
    let tried = 0;

    const attempt = (): void => {
      const onError = (error: NodeJS.ErrnoException): void => {
        server.removeListener("listening", onListening);
        if (error.code === "EADDRINUSE" && tried < attempts) {
          tried += 1;
          port += 1;
          attempt();
          return;
        }
        resolve(null);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    };

    attempt();
  });
}

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    process.stdout.write(`Open ${url} in your browser.\n`);
  }
}

const LIVE_RELOAD_CLIENT = `const events = new EventSource("/__engcode/events");
let overlay = null;

/* Build-error overlay — Next.js dev-overlay inspired: a light-mode neutral
   panel with a dark error header, mono code area, and dismiss button. */
const show = (messages) => {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "engcode-error-overlay";
    document.body.append(overlay);
  }
  overlay.innerHTML = "";
  const sheet = document.createElement("style");
  sheet.id = "engcode-error-overlay-style";
  sheet.textContent = [
    "#engcode-error-overlay{position:fixed;left:16px;right:16px;top:16px;z-index:2147483647;max-height:calc(100vh - 32px);overflow:auto;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35);font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:left}",
    "#engcode-error-overlay .hdr{display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:12px 12px 0 0;background:#1f1f1f;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}",
    "#engcode-error-overlay .badge{background:#d32f2f;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;letter-spacing:.02em}",
    "#engcode-error-overlay .hdr-title{font-size:14px;font-weight:600}",
    "#engcode-error-overlay .hdr-note{margin-left:auto;color:#9ca3af;font-size:12px}",
    "#engcode-error-overlay .close{all:unset;cursor:pointer;color:#9ca3af;font-size:16px;line-height:1;padding:4px}",
    "#engcode-error-overlay .close:hover{color:#fff}",
    "#engcode-error-overlay .body{background:#fafafa;color:#171717;padding:16px 18px;border:1px solid #e5e5e5;border-top:0;border-radius:0 0 12px 12px}",
    "#engcode-error-overlay .err{margin:0 0 14px}",
    "#engcode-error-overlay .err-msg{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:600;font-size:14px;color:#171717}",
    "#engcode-error-overlay .err-hint{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:#6b7280;margin-top:2px}",
    "#engcode-error-overlay .frame{border-radius:8px;background:#1f1f1f;color:#e5e5e5;padding:10px 0;overflow-x:auto;font-size:13px;line-height:1.6}",
    "#engcode-error-overlay .frame .ln{color:#8b8b8b;display:inline-block;min-width:3.2ch;text-align:right;padding-right:12px;user-select:none}",
    "#engcode-error-overlay .frame .src{color:#e5e5e5}",
    "#engcode-error-overlay .frame .src .mark{color:#ef4444;text-decoration:underline;text-decoration-style:wavy;text-underline-offset:3px}",
    "#engcode-error-overlay .foot{padding:10px 18px;border-radius:0 0 12px 12px;background:#1f1f1f;color:#9ca3af;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:12px}",
  ].join("\\n");
  overlay.append(sheet);

  const hdr = document.createElement("div");
  hdr.className = "hdr";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "Build error";
  const title = document.createElement("span");
  title.className = "hdr-title";
  title.textContent = "The program did not compile";
  const note = document.createElement("span");
  note.className = "hdr-note";
  note.textContent = "engcode serve · fixes reload automatically";
  const close = document.createElement("button");
  close.className = "close";
  close.textContent = "\u00d7";
  close.setAttribute("aria-label", "Dismiss");
  close.addEventListener("click", () => {
    overlay.remove();
    overlay = null;
  });
  hdr.append(badge, title, note, close);
  overlay.append(hdr);

  const body = document.createElement("div");
  body.className = "body";
  for (const m of messages) {
    const err = document.createElement("div");
    err.className = "err";
    const msg = document.createElement("p");
    msg.className = "err-msg";
    msg.textContent = m.message;
    err.append(msg);
    if (m.hint) {
      const hint = document.createElement("p");
      hint.className = "err-hint";
      hint.textContent = "Try this: " + m.hint;
      err.append(hint);
    } else if (m.suggestion) {
      const hint = document.createElement("p");
      hint.className = "err-hint";
      hint.textContent = "Try this: " + m.suggestion;
      err.append(hint);
    }
    if (m.line != null) {
      const frame = document.createElement("pre");
      frame.className = "frame";
      const ln = document.createElement("span");
      ln.className = "ln";
      ln.textContent = String(m.line);
      const src = document.createElement("span");
      src.className = "src";
      if (m.column != null && m.length) {
        src.textContent = " ";
        const before = document.createElement("span");
        before.textContent = m.before || "";
        const mark = document.createElement("span");
        mark.className = "mark";
        mark.textContent = m.mark || "";
        const after = document.createElement("span");
        after.textContent = m.after || "";
        src.append(before, mark, after);
      } else {
        src.textContent = " " + (m.source || "");
      }
      frame.append(ln, src);
      err.append(frame);
    }
    body.append(err);
  }
  overlay.append(body);

  const foot = document.createElement("div");
  foot.className = "foot";
  foot.textContent = "Save the file to try again — the page reloads when the build passes.";
  overlay.append(foot);
};

events.addEventListener("reload", () => location.reload());
events.addEventListener("build-error", (event) => {
  try {
    const messages = JSON.parse(event.data);
    show(messages);
  } catch {
    show([{ message: "The build failed. Check the terminal for details." }]);
  }
});
`;

function quotePath(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function toJson(diagnostics: Diagnostic[]): unknown[] {
  return diagnostics.map((diagnostic) => {
    const span = diagnostic.span;
    const sourceLine = span ? (span.file.lines[span.line - 1] ?? "") : "";
    const column = span?.column ?? 1;
    const length = Math.max(1, span?.length ?? 1);
    return {
      message: diagnostic.message,
      line: span?.line ?? null,
      column,
      length,
      severity: diagnostic.severity,
      suggestion: diagnostic.suggestion ?? null,
      hint: diagnostic.hint ?? null,
      before: sourceLine.slice(0, Math.max(0, column - 1)),
      mark: sourceLine.slice(Math.max(0, column - 1), Math.max(0, column - 1) + length),
      after: sourceLine.slice(Math.max(0, column - 1) + length),
      source: sourceLine,
    };
  });
}

interface EntryPoint {
  file: string;
  root: string;
}

function findEntryFile(args: string[]): EntryPoint | null {
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    const fallback = path.resolve("main.eng");
    if (fs.existsSync(fallback)) return { file: fallback, root: path.dirname(fallback) };
    process.stderr.write('Which file? Try: engcode run examples/hello/main.eng\n');
    return null;
  }

  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`I could not find "${target}".\n`);
    return null;
  }

  const stats = fs.statSync(resolved);
  if (stats.isDirectory()) {
    const configPath = path.join(resolved, "engcode.json");
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { entry?: string };
        if (config.entry) {
          const entry = path.join(resolved, config.entry);
          if (fs.existsSync(entry)) return { file: entry, root: resolved };
        }
      } catch {
        process.stderr.write(`I could not read ${configPath}.\n`);
        return null;
      }
    }
    const main = path.join(resolved, "main.eng");
    if (fs.existsSync(main)) return { file: main, root: resolved };
    process.stderr.write(`I could not find an EngCode file in "${target}".\n`);
    return null;
  }

  return { file: resolved, root: path.dirname(resolved) };
}

function createInput(): InputSource {
  if (process.stdin.isTTY) return new TerminalInput();
  const text = fs.readFileSync(0, "utf8");
  const lines = text.length === 0 ? [] : text.split(/\r\n|\n|\r/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return new BufferedInput(lines);
}

main();
