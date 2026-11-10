import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const cli = path.resolve("dist/src/cli.js");
const TINY_APP = [
    'app "Tiny":',
    '    page "Home":',
    '        heading "Tiny page"',
    '        text "Hello" called "greeting"',
    "    end",
    "end",
    "",
].join("\n");
function runCli(args, input) {
    return spawnSync(process.execPath, [cli, ...args], {
        input,
        encoding: "utf8",
    });
}
function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "engcode-test-"));
}
function tempFile(name, content) {
    const directory = tempDir();
    const file = path.join(directory, name);
    fs.writeFileSync(file, content);
    return file;
}
function tempApp() {
    const directory = tempDir();
    fs.writeFileSync(path.join(directory, "main.eng"), TINY_APP);
    fs.writeFileSync(path.join(directory, "engcode.json"), JSON.stringify({ name: "tiny", type: "app", entry: "main.eng" }));
    return directory;
}
async function waitFor(predicate, timeout = 10_000, label = "condition") {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeout)
            throw new Error(`Timed out waiting for ${label}.`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}
test("run prints the program output", () => {
    const result = runCli(["run", path.resolve("examples/hello/main.eng")], "Ada\n");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Hello, world!/);
    assert.match(result.stdout, /Hello, Ada! Welcome to EngCode\./);
});
test("check reports no problems for a good file", () => {
    const result = runCli(["check", path.resolve("examples/guess/main.eng")]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /No problems found/);
});
test("check explains a bad name and exits with 1", () => {
    const file = tempFile("bad.eng", "set name to 1\nsay naem\n");
    const result = runCli(["check", file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /don't know the name "naem"/);
    assert.match(result.stderr, /Did you mean "name"\?/);
    assert.match(result.stderr, /line 2/);
});
test("check --json prints machine-readable diagnostics", () => {
    const file = tempFile("bad.eng", 'say "hi"\nchange missing to 1\n');
    const result = runCli(["check", "--json", file]);
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].line, 2);
    assert.match(parsed[0].message, /don't know the name "missing"/);
});
test("run reports a missing file", () => {
    const result = runCli(["run", "no-such-file.eng"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not find/);
});
test("run explains that an app needs the web compiler", () => {
    const file = tempFile("app.eng", 'app "Demo":\n    page "Home":\n    end\nend\n');
    const result = runCli(["run", file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /This is an app/);
});
test("version prints the version", () => {
    const result = runCli(["--version"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /EngCode 0\.1\.0/);
});
test("unknown commands print help", () => {
    const result = runCli(["frobnicate"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /don't know the command/);
    assert.match(result.stdout, /Usage:/);
});
test("build web writes a runnable static site", () => {
    const app = tempApp();
    const output = path.join(tempDir(), "site");
    const result = runCli(["build", "web", app, "--out", output, "--minify"]);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["index.html", "styles.css", "app.js", "runtime.js"]) {
        assert.ok(fs.existsSync(path.join(output, name)), name);
    }
    const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
    assert.match(html, /Tiny page/);
    assert.match(html, /Content-Security-Policy/);
    assert.equal(html.includes("__engcode/livereload.js"), false);
    assert.match(fs.readFileSync(path.join(output, "app.js"), "utf8"), /startApp/);
});
test("build windows writes a runnable desktop project", () => {
    const app = tempApp();
    const output = path.join(tempDir(), "windows");
    const result = runCli(["build", "windows", app, "--out", output]);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["main.cjs", "package.json", "README.md", "run.cmd"]) {
        assert.ok(fs.existsSync(path.join(output, name)), name);
    }
    assert.equal(fs.existsSync(path.join(output, "run.sh")), false);
    assert.ok(fs.existsSync(path.join(output, "app", "index.html")));
    assert.match(fs.readFileSync(path.join(output, "app", "index.html"), "utf8"), /Tiny page/);
    const main = fs.readFileSync(path.join(output, "main.cjs"), "utf8");
    assert.match(main, /contextIsolation: true/);
    assert.match(main, /nodeIntegration: false/);
    const metadata = JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8"));
    assert.equal(metadata.productName, "Tiny");
    assert.equal(metadata.main, "main.cjs");
    assert.match(metadata.scripts.package, /--platform=win32/);
});
test("build mac writes a macOS desktop project", () => {
    const app = tempApp();
    const output = path.join(tempDir(), "mac");
    const result = runCli(["build", "mac", app, "--out", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(output, "run.sh")));
    assert.equal(fs.existsSync(path.join(output, "run.cmd")), false);
    const metadata = JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8"));
    assert.match(metadata.scripts.package, /--platform=darwin/);
    assert.match(fs.readFileSync(path.join(output, "README.md"), "utf8"), /Mac/);
});
test("build explains the supported desktop targets", () => {
    const result = runCli(["build", "phone"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build windows/);
    assert.match(result.stderr, /build mac/);
});
test("build web reports app mistakes and writes nothing", () => {
    const app = tempDir();
    fs.writeFileSync(path.join(app, "main.eng"), 'app "Broken":\n    page "Home":\n');
    const output = path.join(tempDir(), "site");
    const result = runCli(["build", "web", app, "--out", output]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Oops/);
    assert.equal(fs.existsSync(path.join(output, "index.html")), false);
});
test("check reports accessibility notes without failing", () => {
    const app = tempFile("app.eng", ['app "Demo":', '    page "Home":', '        image "logo.png"', "    end", "end"].join("\n"));
    const result = runCli(["check", app]);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /This image has no description/);
    assert.match(result.stdout, /No errors/);
});
test("serve serves an app, reloads on a change, and shows build errors", async () => {
    const app = tempApp();
    const port = 44_000 + Math.floor(Math.random() * 1_000);
    const child = spawn(process.execPath, [cli, "serve", app, "--port", String(port)], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
    });
    try {
        await waitFor(() => /Serving "Tiny"/.test(stdout), 10_000, "the server to start");
        const match = stdout.match(/http:\/\/localhost:(\d+)\//);
        assert.ok(match, stdout);
        const base = `http://localhost:${match[1]}/`;
        const page = await fetch(base);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /Tiny page/);
        const live = await fetch(`${base}__engcode/livereload.js`);
        assert.match(await live.text(), /EventSource/);
        const events = await fetch(`${base}__engcode/events`);
        assert.equal(events.status, 200);
        const reader = events.body.getReader();
        const first = await reader.read();
        assert.match(new TextDecoder().decode(first.value), /event: ready/);
        fs.appendFileSync(path.join(app, "main.eng"), "\n");
        await waitFor(() => stdout.includes("Rebuilt"), 10_000, "a rebuild");
        await reader.cancel();
        fs.writeFileSync(path.join(app, "main.eng"), 'app "Broken":\n');
        await waitFor(() => stderr.includes("Oops"), 10_000, "a build error");
    }
    finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (child.exitCode === null)
            child.kill("SIGKILL");
    }
});
//# sourceMappingURL=cli.test.js.map