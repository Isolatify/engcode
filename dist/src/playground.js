import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Interpreter } from "./interpreter.js";
import { analyze } from "./program.js";
import { compileWeb } from "./web/compiler.js";
const MAX_BODY = 256 * 1024;
const MAX_STEPS = 200_000;
/** `engcode playground` serves a local editor that runs scripts and previews apps. */
export async function playgroundCommand(args) {
    const portIndex = args.indexOf("--port");
    let port = 4000;
    if (portIndex >= 0 && args[portIndex + 1]) {
        const parsed = Number(args[portIndex + 1]);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            process.stderr.write("The port must be a whole number from 1 to 65535.\n");
            return 1;
        }
        port = parsed;
    }
    const root = path.resolve(import.meta.dirname, "../../playground");
    const apps = new Map();
    const server = http.createServer((request, response) => {
        void handle(request, response, root, apps);
    });
    const actualPort = await listen(server, port);
    if (actualPort === null) {
        process.stderr.write(`I could not start the playground on port ${port} or the next 10 ports.\n`);
        return 1;
    }
    const address = `http://localhost:${actualPort}/`;
    process.stdout.write([
        `EngCode playground at ${address}`,
        "Scripts run on this machine with a step limit. Press Ctrl+C to stop.",
        "",
    ].join("\n"));
    if (args.includes("--open"))
        openBrowser(address);
    return await new Promise((resolve) => {
        const stop = () => {
            server.close(() => resolve(0));
            setTimeout(() => resolve(0), 500);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    });
}
async function handle(request, response, root, apps) {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);
    if (request.method === "POST" && pathname === "/api/run") {
        await runRequest(request, response, apps);
        return;
    }
    if (pathname.startsWith("/preview/")) {
        servePreview(pathname, response, apps);
        return;
    }
    const file = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    if (file.includes("..") || path.isAbsolute(file)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }
    const target = path.join(root, file);
    if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }
    response.writeHead(200, {
        "Content-Type": contentType(file),
        "Cache-Control": "no-store",
    });
    response.end(fs.readFileSync(target));
}
async function runRequest(request, response, apps) {
    let body = "";
    for await (const chunk of request) {
        body += chunk;
        if (body.length > MAX_BODY) {
            response.writeHead(413, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ ok: false, message: "The program is too large." }));
            return;
        }
    }
    let source = "";
    let inputs = [];
    try {
        const parsed = JSON.parse(body || "{}");
        source = typeof parsed.source === "string" ? parsed.source : "";
        inputs = Array.isArray(parsed.inputs) ? parsed.inputs.filter((item) => typeof item === "string") : [];
    }
    catch {
        sendJson(response, 400, { ok: false, message: "That request was not valid JSON." });
        return;
    }
    const analysis = analyze(path.join(process.cwd(), "playground.eng"), source, {
        root: process.cwd(),
        modules: false,
        allowApps: true,
    });
    const diagnostics = analysis.diagnostics.filter((item) => item.severity !== "warning");
    const warnings = analysis.diagnostics.filter((item) => item.severity === "warning");
    if (diagnostics.length > 0 || !analysis.program) {
        sendJson(response, 200, {
            ok: false,
            kind: "diagnostics",
            diagnostics: diagnostics.map(describe),
            warnings: warnings.map(describe),
        });
        return;
    }
    const looksLikeApp = analysis.program.body.some((statement) => statement.kind === "app");
    if (looksLikeApp) {
        const build = compileWeb(analysis.program, {
            root: process.cwd(),
            allowedHosts: [],
        });
        if (build.diagnostics.length > 0) {
            sendJson(response, 200, {
                ok: false,
                kind: "diagnostics",
                diagnostics: build.diagnostics.map(describe),
                warnings: warnings.map(describe),
            });
            return;
        }
        const id = randomUUID();
        apps.set(id, { build, createdAt: Date.now() });
        while (apps.size > 12) {
            const oldest = [...apps.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
            if (!oldest)
                break;
            apps.delete(oldest[0]);
        }
        sendJson(response, 200, {
            ok: true,
            kind: "app",
            preview: `/preview/${id}/`,
            warnings: [...warnings.map(describe), ...build.warnings.map(describe)],
        });
        return;
    }
    let output = "";
    const answers = [...inputs];
    try {
        const interpreter = new Interpreter({
            write: (chunk) => {
                output += chunk;
            },
            input: {
                readLine: (prompt) => {
                    output += prompt + " ";
                    return answers.shift() ?? "";
                },
            },
            fileRoot: process.cwd(),
            maxSteps: MAX_STEPS,
        });
        interpreter.run(analysis.program);
        sendJson(response, 200, {
            ok: true,
            kind: "script",
            output,
            warnings: warnings.map(describe),
        });
    }
    catch (error) {
        sendJson(response, 200, {
            ok: false,
            kind: "runtime",
            output,
            message: error instanceof Error ? error.message : String(error),
            warnings: warnings.map(describe),
        });
    }
}
function describe(diagnostic) {
    return {
        message: diagnostic.message,
        line: diagnostic.span?.line ?? 1,
        column: diagnostic.span?.column ?? 1,
        length: diagnostic.span?.length ?? 1,
        severity: diagnostic.severity,
        hint: diagnostic.hint ?? null,
        suggestion: diagnostic.suggestion ?? null,
    };
}
function servePreview(pathname, response, apps) {
    const match = pathname.match(/^\/preview\/([^/]+)\/?(.*)$/);
    if (!match) {
        response.writeHead(404);
        response.end("Not found");
        return;
    }
    const stored = apps.get(match[1]);
    if (!stored) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("This preview has expired. Run the app again.");
        return;
    }
    const name = match[2] ?? "";
    const build = stored.build;
    if (name === "" || name === "index.html") {
        const base = `<base href="/preview/${match[1]}/">`;
        const html = build.html.includes("<head>")
            ? build.html.replace("<head>", `<head>\n    ${base}`)
            : build.html;
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
    }
    let content = null;
    if (name === "styles.css")
        content = build.css;
    else if (name === "app.js")
        content = build.js;
    else if (name === "runtime.js")
        content = build.runtime;
    else {
        const asset = build.assets.find((item) => item.to === name);
        if (asset) {
            try {
                content = fs.readFileSync(asset.from);
            }
            catch {
                content = null;
            }
        }
    }
    if (content === null) {
        response.writeHead(404);
        response.end("Not found");
        return;
    }
    response.writeHead(200, {
        "Content-Type": contentType(name),
        "Cache-Control": "no-store",
    });
    response.end(content);
}
function sendJson(response, status, value) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
}
function listen(server, start) {
    return new Promise((resolve) => {
        let port = start;
        let tried = 0;
        const attempt = () => {
            const onError = (error) => {
                server.removeListener("listening", onListening);
                if (error.code === "EADDRINUSE" && tried < 10) {
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
    switch (path.extname(file).toLowerCase()) {
        case ".html":
            return "text/html; charset=utf-8";
        case ".css":
            return "text/css; charset=utf-8";
        case ".js":
            return "text/javascript; charset=utf-8";
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".svg":
            return "image/svg+xml";
        case ".webp":
            return "image/webp";
        case ".mp4":
            return "video/mp4";
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
//# sourceMappingURL=playground.js.map