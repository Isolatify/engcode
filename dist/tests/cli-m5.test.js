import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const cli = path.resolve("dist/src/cli.js");
function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "engcode-m5-"));
}
function runCli(args, options = {}) {
    return spawnSync(process.execPath, [cli, ...args], {
        input: options.input,
        cwd: options.cwd ?? process.cwd(),
        encoding: "utf8",
    });
}
async function waitFor(predicate, timeout = 10_000, label = "condition") {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeout)
            throw new Error(`Timed out waiting for ${label}.`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}
test("new creates a runnable project for every kind", () => {
    for (const type of ["script", "website", "app", "desktop"]) {
        const folder = tempDir();
        const result = runCli(["new", `demo-${type}`, "--type", type], { cwd: folder });
        assert.equal(result.status, 0, result.stderr);
        const project = path.join(folder, `demo-${type}`);
        for (const name of ["main.eng", "engcode.json", ".gitignore", "README.md"]) {
            assert.ok(fs.existsSync(path.join(project, name)), `${type}: ${name}`);
        }
        const metadata = JSON.parse(fs.readFileSync(path.join(project, "engcode.json"), "utf8"));
        assert.equal(metadata.type, type);
        assert.equal(metadata.entry, "main.eng");
        const check = runCli(["check", "main.eng"], { cwd: project });
        assert.equal(check.status, 0, `${type}: ${check.stderr}`);
    }
});
test("new never overwrites an existing folder", () => {
    const folder = tempDir();
    fs.mkdirSync(path.join(folder, "taken"));
    const result = runCli(["new", "taken"], { cwd: folder });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists/);
});
test("format checks, prints, and rewrites a file", () => {
    const folder = tempDir();
    const file = path.join(folder, "main.eng");
    fs.writeFileSync(file, '   Say "hi"   \n\n\n');
    const check = runCli(["format", "--check", "main.eng"], { cwd: folder });
    assert.equal(check.status, 1);
    assert.match(check.stdout, /Would format main\.eng/);
    const printed = runCli(["format", "--stdout", "main.eng"], { cwd: folder });
    assert.equal(printed.status, 0);
    assert.equal(printed.stdout, 'say "hi"\n');
    const written = runCli(["format", "main.eng"], { cwd: folder });
    assert.equal(written.status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), 'say "hi"\n');
    const again = runCli(["format", "--check", "main.eng"], { cwd: folder });
    assert.equal(again.status, 0);
});
test("lint reports warnings, JSON, and strict failures", () => {
    const folder = tempDir();
    const file = path.join(folder, "main.eng");
    fs.writeFileSync(file, "set score plus to 1\nsay score plus\n");
    const normal = runCli(["lint", "main.eng"], { cwd: folder });
    assert.equal(normal.status, 0);
    assert.match(normal.stderr, /ends with the operator word "plus"/);
    const strict = runCli(["lint", "--strict", "main.eng"], { cwd: folder });
    assert.equal(strict.status, 1);
    const json = runCli(["lint", "--json", "main.eng"], { cwd: folder });
    assert.equal(json.status, 0);
    const parsed = JSON.parse(json.stdout);
    assert.ok(parsed.length > 0);
    assert.ok(parsed[0].file.endsWith("main.eng"));
    assert.match(parsed[0].message, /score plus/);
});
test("learn lists lessons, runs examples, and records progress", () => {
    const folder = tempDir();
    const list = runCli(["learn"], { cwd: folder });
    assert.equal(list.status, 0);
    assert.match(list.stdout, /20 short lessons/);
    assert.match(list.stdout, /\[ \] 20\. State and storage/);
    const run = runCli(["learn", "1", "--run"], { cwd: folder });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Hello, world!/);
    assert.match(run.stdout, /That is the example/);
    const wrong = path.join(folder, "wrong.eng");
    fs.writeFileSync(wrong, 'say "Goodbye"\n');
    const first = runCli(["learn", "1", "--file", "wrong.eng"], { cwd: folder });
    assert.equal(first.status, 1);
    assert.match(first.stdout, /Not quite yet/);
    const second = runCli(["learn", "1", "--file", "wrong.eng"], { cwd: folder });
    assert.match(second.stdout, /Hint: Try: say "Hello, Ada!"/);
    const right = path.join(folder, "right.eng");
    fs.writeFileSync(right, 'say "Hello, world!"\n');
    const passed = runCli(["learn", "1", "--file", "right.eng"], { cwd: folder });
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /Lesson 1 complete/);
    const progress = JSON.parse(fs.readFileSync(path.join(folder, ".engcode", "learn.json"), "utf8"));
    assert.deepEqual(progress.completed, [1]);
    const done = runCli(["learn", "2", "--done"], { cwd: folder });
    assert.equal(done.status, 0);
    const reset = runCli(["learn", "--reset"], { cwd: folder });
    assert.equal(reset.status, 0);
    assert.match(reset.stdout, /cleared/i);
});
test("run --explain describes each statement", () => {
    const folder = tempDir();
    fs.writeFileSync(path.join(folder, "main.eng"), 'set name to "Sam"\nsay "Hi " plus name\n');
    const result = runCli(["run", "main.eng", "--explain"], { cwd: folder });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Hi Sam\n");
    assert.match(result.stderr, /Step 1 · line 1/);
    assert.match(result.stderr, /→ store a value in "name"/);
    assert.match(result.stderr, /Step 2 · line 2/);
    assert.match(result.stderr, /→ show a value in the terminal/);
});
test("run --step continues without a terminal and keeps program output clean", () => {
    const folder = tempDir();
    fs.writeFileSync(path.join(folder, "main.eng"), 'say "one"\nsay "two"\n');
    const result = runCli(["run", "main.eng", "--step"], { cwd: folder });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "one\ntwo\n");
    assert.match(result.stderr, /needs a terminal to pause/);
});
test("check --lint adds warnings and --strict turns them into failures", () => {
    const folder = tempDir();
    fs.writeFileSync(path.join(folder, "main.eng"), 'set name to "Sam"\nsay "Hi"\n');
    const normal = runCli(["check", "main.eng"], { cwd: folder });
    assert.equal(normal.status, 0);
    assert.match(normal.stdout, /No problems found/);
    const lint = runCli(["check", "--lint", "main.eng"], { cwd: folder });
    assert.equal(lint.status, 0);
    assert.match(lint.stderr, /never used/);
    const strict = runCli(["check", "--lint", "--strict", "main.eng"], { cwd: folder });
    assert.equal(strict.status, 1);
});
test("playground serves the editor, runs scripts, and previews apps", async () => {
    const port = 45_000 + Math.floor(Math.random() * 1_000);
    const child = spawn(process.execPath, [cli, "playground", "--port", String(port)], {
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
        await waitFor(() => /playground at/.test(stdout), 10_000, "the playground to start");
        const match = stdout.match(/http:\/\/localhost:(\d+)\//);
        assert.ok(match, stdout);
        const base = `http://localhost:${match[1]}/`;
        const page = await fetch(base);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /EngCode <strong>Playground<\/strong>/);
        assert.equal((await fetch(`${base}app.js`)).status, 200);
        assert.equal((await fetch(`${base}styles.css`)).status, 200);
        const script = await fetch(`${base}api/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: 'say "Hi from the playground"' }),
        });
        const scriptResult = (await script.json());
        assert.equal(scriptResult.ok, true);
        assert.equal(scriptResult.kind, "script");
        assert.match(scriptResult.output, /Hi from the playground/);
        const broken = await fetch(`${base}api/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: 'say "unclosed' }),
        });
        const brokenResult = (await broken.json());
        assert.equal(brokenResult.ok, false);
        assert.equal(brokenResult.kind, "diagnostics");
        const app = await fetch(`${base}api/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source: ['app "Tiny":', '    page "Home":', '        heading "Tiny page"', "    end", "end"].join("\n"),
            }),
        });
        const appResult = (await app.json());
        assert.equal(appResult.ok, true, JSON.stringify(appResult));
        assert.equal(appResult.kind, "app");
        const preview = await fetch(`${base}${appResult.preview.replace(/^\//, "")}`);
        assert.equal(preview.status, 200);
        assert.match(await preview.text(), /Tiny page/);
        const css = await fetch(`${base}${appResult.preview.replace(/^\//, "")}styles.css`);
        assert.equal(css.status, 200);
    }
    finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (child.exitCode === null)
            child.kill("SIGKILL");
    }
});
//# sourceMappingURL=cli-m5.test.js.map