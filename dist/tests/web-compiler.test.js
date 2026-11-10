import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "../src/program.js";
import { compileWeb } from "../src/web/compiler.js";
const EXAMPLES = ["todo", "portfolio", "weather", "notes", "pong"];
function buildExample(name, options = {}) {
    const root = path.resolve("examples", name);
    const file = path.join(root, "main.eng");
    const text = fs.readFileSync(file, "utf8");
    const analysis = analyze(file, text, { root, allowApps: true });
    assert.deepEqual(analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"), [], `${name} should check cleanly`);
    assert.ok(analysis.program);
    const config = JSON.parse(fs.readFileSync(path.join(root, "engcode.json"), "utf8"));
    return {
        analysis,
        build: compileWeb(analysis.program, {
            root,
            allowedHosts: config.allow?.network ?? [],
            minify: options.minify ?? false,
        }),
    };
}
for (const name of EXAMPLES) {
    test(`builds the ${name} example as a static website`, () => {
        const { build } = buildExample(name);
        assert.deepEqual(build.diagnostics, []);
        assert.ok(build.html.startsWith("<!doctype html>"));
        assert.match(build.html, /Content-Security-Policy/);
        assert.match(build.html, /class="eng-skip"/);
        assert.match(build.html, /<main id="eng-main">/);
        assert.match(build.html, /<section class="eng-page" data-page="[a-z-]+"/);
        assert.match(build.html, /<script type="module" src="app\.js"><\/script>/);
        assert.equal(build.runtime.length > 1000, true);
        assert.equal(build.js.includes("startApp"), true);
        assert.equal(build.js.includes("eval("), false);
        assert.equal(build.runtime.includes("innerHTML"), false);
    });
}
test("renders semantic todo markup with accessible controls", () => {
    const { build } = buildExample("todo");
    assert.match(build.html, /<h1 [^>]*>My Tasks<\/h1>/);
    assert.match(build.html, /data-eng-id="new task"/);
    assert.match(build.html, /<label for="eng-\d+">New task<\/label>/);
    assert.match(build.html, /<button type="button" [^>]*data-eng-id="add button"[^>]*>Add<\/button>/);
    assert.match(build.html, /<ul [^>]*data-eng-id="task list"[^>]*><\/ul>/);
    assert.match(build.html, /placeholder="Add a task"/);
});
test("renders portfolio navigation, headings, and a described image", () => {
    const { build } = buildExample("portfolio");
    assert.match(build.html, /<nav /);
    assert.match(build.html, /<h2 [^>]*>Projects<\/h2>/);
    assert.match(build.html, /<h3 [^>]*>Weather Now<\/h3>/);
    assert.match(build.html, /<img src="assets\/sam\.png" alt="A photo of Sam Carter"/);
    assert.match(build.html, /<video src="https:\/\/[^"]+" controls preload="metadata" playsinline loop poster="assets\/sam\.png" width="640"/);
    assert.match(build.html, /aria-label="A flower opening in the sun"/);
    assert.equal(build.assets.length, 1);
});
test("renders the weather form and network allow list", () => {
    const { build } = buildExample("weather");
    assert.match(build.html, /data-eng-id="latitude"/);
    assert.match(build.html, /data-eng-id="longitude"/);
    assert.match(build.html, /data-eng-id="result"/);
    assert.match(build.js, /api\.open-meteo\.com/);
});
test("renders the pong canvas with an accessible fallback", () => {
    const { build } = buildExample("pong");
    assert.match(build.html, /<canvas width="800" height="500" aria-label="board"/);
    assert.match(build.html, /Use the keyboard controls/);
    assert.match(build.html, /Use W and S to move/);
});
test("turns styles into scoped CSS with states and media queries", () => {
    const { build } = buildExample("todo");
    assert.match(build.css, /body \{/);
    assert.match(build.css, /\[data-eng-id="add button"\]/);
    assert.match(build.css, /:hover/);
    assert.match(build.css, /@media \(max-width: 639px\)/);
    assert.match(build.css, /border-radius: 8px/);
    assert.match(build.css, /background-color: #0000ff/);
});
test("supports minified output", () => {
    const { build } = buildExample("notes", { minify: true });
    assert.equal(build.html.includes("\n    "), false);
    assert.equal(build.css.length < 8000, true);
});
test("turns themes into light and dark CSS variables", () => {
    const source = [
        'app "Theme Demo":',
        '    page "Home":',
        '        heading "Hello"',
        '        button "Press me" called "press"',
        "    end",
        "end",
        "",
        'theme "Day":',
        "    accent is #2563eb",
        "    background is #f8fafc",
        "    surface is white",
        "    text is #1f2937",
        "    font is modern",
        "    corner radius is 12",
        "end",
        'theme "Night" in dark mode:',
        "    background is #0f172a",
        "    surface is #1e293b",
        "    text is #e2e8f0",
        "end",
        "",
        "style everything:",
        "    background is background",
        "    text color is text",
        "    font is font",
        "end",
        "",
        'style "press":',
        "    background is accent",
        "    text color is white",
        "    rounded corners of 8",
        "    transition is 0.3 seconds",
        "    animation is fade in over 0.8 seconds",
        "end",
        "",
    ].join("\n");
    const analysis = analyze("theme.eng", source, { root: process.cwd(), allowApps: true });
    assert.deepEqual(analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"), []);
    const build = compileWeb(analysis.program, { root: process.cwd() });
    assert.match(build.css, /:root \{\n  --eng-accent: #2563eb;/);
    assert.match(build.css, /--eng-bg: #f8fafc;/);
    assert.match(build.css, /--eng-font: "Inter", "Segoe UI"/);
    assert.match(build.css, /--eng-radius: 12px;/);
    assert.match(build.css, /\[data-theme="dark"\] \{\n  --eng-bg: #0f172a;/);
    assert.match(build.css, /@media \(prefers-color-scheme: dark\)/);
    assert.match(build.css, /background-color: var\(--eng-bg\)/);
    assert.match(build.css, /font-family: var\(--eng-font\)/);
    assert.match(build.css, /border-radius: 8px/);
    assert.match(build.css, /transition: all 0\.3s ease/);
    assert.match(build.css, /animation: eng-fade-in 0\.8s ease both/);
});
test("adds accessible attributes to images, videos, and audio", () => {
    const source = [
        'app "Media":',
        '    page "Home":',
        '        image "https://example.com/photo.png" with description "A photo" and width 320 and height 200',
        '        video "https://example.com/clip.mp4" with description "A clip" and poster "https://example.com/poster.jpg" and loops and width 640',
        '        audio "https://example.com/sound.mp3" with description "A sound" and loops',
        "    end",
        "end",
        "",
    ].join("\n");
    const analysis = analyze("media.eng", source, { root: process.cwd(), allowApps: true });
    assert.deepEqual(analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"), []);
    const build = compileWeb(analysis.program, { root: process.cwd() });
    assert.match(build.html, /<img src="https:\/\/example\.com\/photo\.png" alt="A photo" loading="lazy" decoding="async" width="320" height="200"/);
    assert.match(build.html, /<video src="https:\/\/example\.com\/clip\.mp4" controls preload="metadata" playsinline loop poster="https:\/\/example\.com\/poster\.jpg" width="640"/);
    assert.match(build.html, /aria-label="A clip">A clip<\/video>/);
    assert.match(build.html, /<audio src="https:\/\/example\.com\/sound\.mp3" controls preload="metadata" loop/);
    assert.match(build.html, /aria-label="A sound">A sound<\/audio>/);
});
test("emits table head placeholders and wrapped check labels", () => {
    const source = [
        'app "Parts":',
        '    page "Home":',
        '        heading "Parts"',
        '        checkbox "I agree" called "agree"',
        '        switch "Dark mode" called "mode"',
        '        radio choice "One" called "one"',
        '        table called "Scores" showing scores with columns "name", "score"',
        '        table called "Plain" showing scores',
        "    end",
        "end",
        "",
        'keep track of scores as a list of a table with name "Ada", score 10',
        "",
    ].join("\n");
    const analysis = analyze("parts.eng", source, { root: process.cwd(), allowApps: true });
    assert.deepEqual(analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"), []);
    const build = compileWeb(analysis.program, { root: process.cwd() });
    assert.match(build.html, /<span class="eng-check-label">I agree<\/span>/);
    assert.match(build.html, /<span class="eng-check-label">Dark mode<\/span>/);
    assert.match(build.html, /<span class="eng-check-label">One<\/span>/);
    assert.match(build.html, /<thead><tr><th scope="col">name<\/th><th scope="col">score<\/th><\/tr><\/thead>/);
    assert.match(build.html, /<thead><tr><\/tr><\/thead>/);
});
//# sourceMappingURL=web-compiler.test.js.map