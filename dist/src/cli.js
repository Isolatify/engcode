#!/usr/bin/env node
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { RuntimeError, renderDiagnostic } from "./diagnostics.js";
import { Interpreter } from "./interpreter.js";
import { analyze, looksLikeApp } from "./program.js";
import { compileWeb } from "./web/compiler.js";
import { desktopLauncher, desktopPackageJson, desktopReadme, electronMainSource, platformFolder, platformName, } from "./desktop/shell.js";
const VERSION = "0.1.0";
class BufferedInput {
    lines;
    index = 0;
    constructor(lines) {
        this.lines = lines;
    }
    readLine(prompt) {
        process.stdout.write(prompt + (prompt.endsWith(" ") ? "" : " "));
        if (this.index >= this.lines.length) {
            throw new Error("The program asked for input, but there was no more input.");
        }
        const line = this.lines[this.index++] ?? "";
        process.stdout.write("\n");
        return line;
    }
}
class TerminalInput {
    readLine(prompt) {
        process.stdout.write(prompt + (prompt.endsWith(" ") ? "" : " "));
        let result = "";
        const buffer = Buffer.alloc(1);
        while (true) {
            let bytes = 0;
            try {
                bytes = fs.readSync(0, buffer, 0, 1, null);
            }
            catch (error) {
                throw new Error("I could not read the answer. Try running the program in a terminal.");
            }
            if (bytes === 0) {
                if (result.length === 0) {
                    throw new Error("The program asked for input, but there was no more input.");
                }
                break;
            }
            const character = buffer.toString("utf8", 0, bytes);
            if (character === "\n")
                break;
            if (character !== "\r")
                result += character;
        }
        process.stdout.write("\n");
        return result;
    }
}
async function main() {
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
        default:
            process.stderr.write(`I don't know the command "${command}".\n\n`);
            printHelp();
            process.exitCode = 1;
    }
}
function printHelp() {
    process.stdout.write([
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
        "  engcode repl              type English and run it right away",
        "  engcode help              show this help",
        "  engcode version           show the version",
        "",
        "Options for run:",
        "  --allow-network           allow https requests in this run",
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
    ].join("\n"));
}
function parseRunOptions(args) {
    return {
        allowNetwork: args.includes("--allow-network"),
        allowFiles: args.includes("--allow-files"),
    };
}
function runCommand(args) {
    const options = parseRunOptions(args);
    const entry = findEntryFile(args);
    if (!entry)
        return 1;
    const file = entry.file;
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    }
    catch {
        process.stderr.write(`I could not open "${file}".\n`);
        return 1;
    }
    if (looksLikeApp(text)) {
        process.stderr.write([
            "This is an app, not a terminal script.",
            "",
            "Open it in the browser with: engcode serve " + quotePath(entry.root),
            "Or build a static website with: engcode build web " + quotePath(entry.root),
            "Or open a desktop window with: engcode app " + quotePath(entry.root),
            "",
        ].join("\n"));
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
    });
    try {
        interpreter.run(analysis.program);
        return 0;
    }
    catch (error) {
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
function replCommand(args) {
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
    let history = [];
    let buffer = [];
    let depth = 0;
    process.stdout.write([
        "EngCode REPL — Build with Simple English",
        'Type English and press Enter. Type ":help" for commands and ":quit" to leave.',
        "Blocks continue on the next line until their \"end\".",
        "",
    ].join("\n"));
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
                    process.stdout.write([
                        "REPL commands:",
                        "  :help          show this help",
                        "  :clear         forget every name",
                        "  :load file.eng run a file in this session",
                        "  :quit          leave the REPL",
                        "",
                    ].join("\n"));
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
                    let text;
                    try {
                        text = fs.readFileSync(file, "utf8");
                    }
                    catch {
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
                    }
                    catch (error) {
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
        if (depth > 0)
            continue;
        const source = buffer.join("\n");
        buffer = [];
        depth = 0;
        if (source.trim().length === 0)
            continue;
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
        }
        catch (error) {
            reportRuntimeError(error);
        }
    }
}
/** Reads one line from the terminal. Returns null when the input has ended. */
function readReplLine(prompt) {
    process.stdout.write(prompt);
    let result = "";
    let sawAnything = false;
    const buffer = Buffer.alloc(1);
    while (true) {
        let bytes = 0;
        try {
            bytes = fs.readSync(0, buffer, 0, 1, null);
        }
        catch {
            return sawAnything ? result : null;
        }
        if (bytes === 0)
            return sawAnything ? result : null;
        sawAnything = true;
        const character = buffer.toString("utf8", 0, bytes);
        if (character === "\n")
            break;
        if (character !== "\r")
            result += character;
    }
    return result;
}
/** Tracks whether a REPL line leaves a block open. */
function lineOpensBlock(line) {
    let text = line;
    let inText = false;
    for (let i = 0; i < text.length; i += 1) {
        const character = text[i];
        if (character === "\\") {
            i += 1;
            continue;
        }
        if (character === '"')
            inText = !inText;
        if (!inText && character === "n" && text.slice(i, i + 5).toLowerCase() === "note:") {
            const before = i === 0 ? " " : text[i - 1];
            if (/\s/.test(before)) {
                text = text.slice(0, i);
                break;
            }
        }
    }
    const trimmed = text.trim();
    let delta = 0;
    if (/^\s*end\b/i.test(trimmed))
        delta -= 1;
    if (opensWithColon(trimmed))
        delta += 1;
    return delta;
}
function opensWithColon(line) {
    let inText = false;
    for (let i = 0; i < line.length; i += 1) {
        const character = line[i];
        if (character === "\\") {
            i += 1;
            continue;
        }
        if (character === '"')
            inText = !inText;
    }
    return !inText && line.endsWith(":");
}
function reportRuntimeError(error) {
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
function checkCommand(args) {
    const json = args.includes("--json");
    const entry = findEntryFile(args.filter((arg) => !arg.startsWith("--")));
    if (!entry)
        return 1;
    const file = entry.file;
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    }
    catch {
        process.stderr.write(`I could not open "${file}".\n`);
        return 1;
    }
    const analysis = analyze(file, text, { root: entry.root, allowApps: true });
    const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning");
    if (json) {
        process.stdout.write(JSON.stringify(toJson(analysis.diagnostics), null, 2) + "\n");
        return errors.length > 0 ? 1 : 0;
    }
    printDiagnostics(analysis.diagnostics);
    if (errors.length > 0)
        return 1;
    if (analysis.diagnostics.length > 0) {
        process.stdout.write(`No errors in ${path.basename(file)}. ${analysis.diagnostics.length} warning${analysis.diagnostics.length === 1 ? "" : "s"}.\n`);
        return 0;
    }
    process.stdout.write(`No problems found in ${path.basename(file)}.\n`);
    return 0;
}
function readAppConfig(root) {
    const file = path.join(root, "engcode.json");
    if (!fs.existsSync(file))
        return {};
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return {};
    }
}
function buildApp(entry, options) {
    let text;
    try {
        text = fs.readFileSync(entry.file, "utf8");
    }
    catch {
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
function printDiagnostics(diagnostics) {
    for (const diagnostic of diagnostics) {
        const prefix = diagnostic.severity === "warning" ? "Warning: " : "";
        process.stderr.write(prefix + renderDiagnostic(diagnostic) + "\n\n");
    }
}
function writeBuild(build, output) {
    fs.mkdirSync(output, { recursive: true });
    fs.mkdirSync(path.join(output, "assets"), { recursive: true });
    const written = [];
    const write = (name, content) => {
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
function desktopPlatforms(command) {
    if (command === "windows" || command === "win")
        return "windows";
    if (command === "mac" || command === "macos" || command === "darwin")
        return "mac";
    if (command === "linux")
        return "linux";
    return null;
}
function findElectron(root) {
    const require = createRequire(import.meta.url);
    for (const base of [root, process.cwd()]) {
        try {
            const resolved = require.resolve("electron", { paths: [base] });
            const candidate = require(resolved);
            if (typeof candidate === "string" && fs.existsSync(candidate))
                return candidate;
        }
        catch {
            // Try the next place Electron could be installed.
        }
    }
    return null;
}
function writeDesktopProject(build, output, platform) {
    fs.mkdirSync(output, { recursive: true });
    const written = [];
    const write = (name, content) => {
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
async function appCommand(args) {
    const entry = findEntryFile(args.filter((arg) => !arg.startsWith("--")));
    if (!entry)
        return 1;
    const result = buildApp(entry, { minify: false });
    if (!result)
        return 1;
    printDiagnostics(result.warnings);
    if (result.errors.length > 0) {
        printDiagnostics(result.errors);
        return 1;
    }
    const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
    const output = path.join(entry.root, ".engcode", "desktop");
    const written = writeDesktopProject(result.build, output, platform);
    const electron = findElectron(entry.root);
    if (!electron) {
        process.stdout.write([
            `I prepared "${result.build.appName}" for a desktop window.`,
            `Desktop project: ${output}`,
            `${written.length} files written.`,
            "",
            "I need Electron to open the window. Install it once in this project:",
            "  npm install --save-dev electron",
            "",
            `Then run: engcode app ${quotePath(entry.root)}`,
            "",
        ].join("\n"));
        return 1;
    }
    process.stdout.write(`Opening "${result.build.appName}" in an Electron window...\n`);
    return await new Promise((resolve) => {
        const child = spawn(electron, ["."], { cwd: output, stdio: "inherit" });
        child.on("error", (error) => {
            process.stderr.write(`I could not start Electron: ${error.message}\n`);
            resolve(1);
        });
        child.on("exit", (code) => resolve(code ?? 0));
    });
}
async function buildDesktopCommand(platform, rest) {
    const outputIndex = rest.indexOf("--out");
    const output = outputIndex >= 0 && rest[outputIndex + 1]
        ? path.resolve(rest[outputIndex + 1])
        : path.resolve("dist", platformFolder(platform));
    const filtered = rest.filter((arg, index) => {
        if (arg === "--out")
            return false;
        if (index > 0 && rest[index - 1] === "--out")
            return false;
        return !arg.startsWith("--");
    });
    const entry = findEntryFile(filtered);
    if (!entry)
        return 1;
    const result = buildApp(entry, { minify: rest.includes("--minify") });
    if (!result)
        return 1;
    printDiagnostics(result.warnings);
    if (result.errors.length > 0) {
        printDiagnostics(result.errors);
        return 1;
    }
    const written = writeDesktopProject(result.build, output, platform);
    const label = platformName(platform);
    const launcher = platform === "windows" ? "run.cmd" : "run.sh";
    process.stdout.write([
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
        .join("\n") + "\n");
    return 0;
}
async function buildCommand(args) {
    const kind = args[0];
    const rest = args.slice(1);
    const desktop = kind ? desktopPlatforms(kind) : null;
    if (desktop)
        return buildDesktopCommand(desktop, rest);
    if (kind !== "web") {
        process.stderr.write([
            'I can build a website with "engcode build web".',
            'Or a desktop project with "engcode build windows" or "engcode build mac".',
            "",
        ].join("\n"));
        return 1;
    }
    const outputIndex = rest.indexOf("--out");
    const output = outputIndex >= 0 && rest[outputIndex + 1]
        ? path.resolve(rest[outputIndex + 1])
        : path.resolve("dist");
    const filtered = rest.filter((arg, index) => {
        if (arg === "--out")
            return false;
        if (index > 0 && rest[index - 1] === "--out")
            return false;
        return !arg.startsWith("--");
    });
    const entry = findEntryFile(filtered);
    if (!entry)
        return 1;
    const result = buildApp(entry, { minify: rest.includes("--minify") });
    if (!result)
        return 1;
    printDiagnostics(result.warnings);
    if (result.errors.length > 0) {
        printDiagnostics(result.errors);
        return 1;
    }
    const written = writeBuild(result.build, output);
    process.stdout.write([
        `Built "${result.build.appName}" for the web.`,
        `Output: ${output}`,
        `${written.length} file${written.length === 1 ? "" : "s"} written.`,
        "Open index.html in a browser, or run: engcode serve",
        "",
    ].join("\n"));
    return 0;
}
async function serveCommand(args) {
    const portIndex = args.indexOf("--port");
    let port = 3000;
    if (portIndex >= 0 && args[portIndex + 1]) {
        const parsed = Number(args[portIndex + 1]);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            process.stderr.write("The port must be a whole number from 1 to 65535.\n");
            return 1;
        }
        port = parsed;
    }
    const filtered = args.filter((arg, index) => {
        if (arg === "--port")
            return false;
        if (index > 0 && args[index - 1] === "--port")
            return false;
        return !arg.startsWith("--");
    });
    const entry = findEntryFile(filtered);
    if (!entry)
        return 1;
    let current = buildApp(entry, { liveReload: true, minify: false });
    if (!current)
        return 1;
    if (current.errors.length > 0) {
        printDiagnostics(current.warnings);
        printDiagnostics(current.errors);
        return 1;
    }
    printDiagnostics(current.warnings);
    const clients = new Set();
    const broadcast = (event, data) => {
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
            const content = name === "index.html"
                ? build.html
                : name === "styles.css"
                    ? build.css
                    : name === "app.js"
                        ? build.js
                        : build.runtime;
            const type = name === "index.html"
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
            }
            catch {
                response.writeHead(404);
                response.end("Not found");
                return;
            }
        }
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`I could not find ${pathname}.`);
    });
    let debounce;
    const rebuild = () => {
        const result = buildApp(entry, { liveReload: true, minify: false });
        if (!result)
            return;
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
    let watcher;
    try {
        watcher = fs.watch(entry.root, { recursive: true }, (_event, filename) => {
            if (!filename || !String(filename).endsWith(".eng"))
                return;
            if (String(filename).includes(".engcode"))
                return;
            if (debounce)
                clearTimeout(debounce);
            debounce = setTimeout(rebuild, 150);
        });
    }
    catch {
        watcher = fs.watch(entry.root, (_event, filename) => {
            if (!filename || !String(filename).endsWith(".eng"))
                return;
            if (debounce)
                clearTimeout(debounce);
            debounce = setTimeout(rebuild, 150);
        });
    }
    const actualPort = await listenWithFallback(server, port);
    if (actualPort === null) {
        process.stderr.write(`I could not start a server on port ${port} or the next ${10} ports.\n`);
        watcher.close();
        return 1;
    }
    const address = `http://localhost:${actualPort}/`;
    process.stdout.write([
        `Serving "${current.build.appName}" at ${address}`,
        `Watching ${entry.root} for changes. Press Ctrl+C to stop.`,
        "",
    ].join("\n"));
    if (args.includes("--open"))
        openBrowser(address);
    const heartbeat = setInterval(() => {
        for (const client of clients)
            client.write(": keep-alive\n\n");
    }, 20_000);
    return await new Promise((resolve) => {
        const stop = () => {
            clearInterval(heartbeat);
            watcher?.close();
            for (const client of clients)
                client.end();
            server.close(() => resolve(0));
            setTimeout(() => resolve(0), 500);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    });
}
function listenWithFallback(server, start) {
    return new Promise((resolve) => {
        let port = start;
        const attempts = 10;
        let tried = 0;
        const attempt = () => {
            const onError = (error) => {
                server.removeListener("listening", onListening);
                if (error.code === "EADDRINUSE" && tried < attempts) {
                    tried += 1;
                    port += 1;
                    attempt();
                    return;
                }
                resolve(null);
            };
            const onListening = () => {
                server.removeListener("error", onError);
                resolve(port);
            };
            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(port, "127.0.0.1");
        };
        attempt();
    });
}
function contentType(file) {
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
function openBrowser(url) {
    const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
        const child = spawn(command, args, { detached: true, stdio: "ignore" });
        child.unref();
    }
    catch {
        process.stdout.write(`Open ${url} in your browser.\n`);
    }
}
const LIVE_RELOAD_CLIENT = `const events = new EventSource("/__engcode/events");
let overlay = null;
const show = (message) => {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.setAttribute("role", "alert");
    overlay.style.cssText = "position:fixed;inset:16px;z-index:9999;overflow:auto;background:#7f1d1d;color:#fff;padding:24px;border-radius:12px;font:15px/1.5 ui-monospace,monospace;white-space:pre-wrap";
    document.body.append(overlay);
  }
  overlay.textContent = message;
};
events.addEventListener("reload", () => location.reload());
events.addEventListener("build-error", (event) => {
  try {
    const messages = JSON.parse(event.data);
    show(messages.join("\\n\\n"));
  } catch {
    show("The build failed. Check the terminal for details.");
  }
});
`;
function quotePath(value) {
    return /\s/.test(value) ? `"${value}"` : value;
}
function toJson(diagnostics) {
    return diagnostics.map((diagnostic) => ({
        message: diagnostic.message,
        line: diagnostic.span?.line ?? 1,
        column: diagnostic.span?.column ?? 1,
        length: diagnostic.span?.length ?? 1,
        severity: diagnostic.severity,
        suggestion: diagnostic.suggestion ?? null,
        hint: diagnostic.hint ?? null,
    }));
}
function findEntryFile(args) {
    const target = args.find((arg) => !arg.startsWith("--"));
    if (!target) {
        const fallback = path.resolve("main.eng");
        if (fs.existsSync(fallback))
            return { file: fallback, root: path.dirname(fallback) };
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
                const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
                if (config.entry) {
                    const entry = path.join(resolved, config.entry);
                    if (fs.existsSync(entry))
                        return { file: entry, root: resolved };
                }
            }
            catch {
                process.stderr.write(`I could not read ${configPath}.\n`);
                return null;
            }
        }
        const main = path.join(resolved, "main.eng");
        if (fs.existsSync(main))
            return { file: main, root: resolved };
        process.stderr.write(`I could not find an EngCode file in "${target}".\n`);
        return null;
    }
    return { file: resolved, root: path.dirname(resolved) };
}
function createInput() {
    if (process.stdin.isTTY)
        return new TerminalInput();
    const text = fs.readFileSync(0, "utf8");
    const lines = text.length === 0 ? [] : text.split(/\r\n|\n|\r/);
    if (lines.length > 0 && lines[lines.length - 1] === "")
        lines.pop();
    return new BufferedInput(lines);
}
main();
//# sourceMappingURL=cli.js.map