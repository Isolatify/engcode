import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/program.js";
function check(source) {
    const analysis = analyze("app.eng", source, { allowApps: true });
    return {
        all: analysis.diagnostics,
        errors: analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"),
        warnings: analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
    };
}
function app(body, extra = "") {
    return [`app "Demo":`, `    page "Home":`, body, `    end`, `end`, extra].join("\n");
}
test("accepts a clean app", () => {
    const result = check(app([
        '        heading "Hello"',
        '        button "Save" called "save"',
        '        text "Ready" called "status"',
        '        image "logo.png" with description "A logo"',
    ].join("\n")));
    assert.deepEqual(result.all, []);
});
test("reports duplicate pages", () => {
    const result = check([
        'app "Demo":',
        '    page "Home":',
        '        heading "One"',
        "    end",
        '    page "Home":',
        '        heading "Two"',
        "    end",
        "end",
    ].join("\n"));
    assert.match(result.errors[0].message, /two pages called "Home"/);
});
test("reports duplicate ids on one page", () => {
    const result = check(app([
        '        heading "Hello"',
        '        button "One" called "same"',
        '        button "Two" called "same"',
    ].join("\n")));
    assert.match(result.errors[0].message, /used twice/);
});
test("reports event targets that do not exist", () => {
    const result = check(app('        heading "Hello"', ['when "missing" is clicked:', '    say "hi"', "end"].join("\n")));
    assert.match(result.errors[0].message, /no screen element called "missing"/);
});
test("reports screen update targets that do not exist", () => {
    const result = check(app(['        heading "Hello"', '        text "Ready" called "status"'].join("\n"), ['when the page opens:', '    change text of "nope" to "Done"', "end"].join("\n")));
    assert.match(result.errors[0].message, /no screen element called "nope"/);
});
test("reports a missing page in go to page", () => {
    const result = check(app('        heading "Hello"', ['when the page opens:', '    go to page "Nowhere"', "end"].join("\n")));
    assert.match(result.errors[0].message, /no page called "Nowhere"/);
});
test("rejects unsafe links", () => {
    const result = check(app(['        heading "Hello"', '        link "Bad" to "javascript:alert(1)"'].join("\n")));
    assert.match(result.errors[0].message, /not safe/);
});
test("warns about images without descriptions", () => {
    const result = check(app(['        heading "Hello"', '        image "logo.png"'].join("\n")));
    assert.equal(result.errors.length, 0);
    assert.match(result.warnings[0].message, /no description/);
});
test("warns about video and audio without descriptions", () => {
    const result = check(app([
        '        heading "Hello"',
        '        video "clip.mp4"',
        '        audio "sound.mp3"',
    ].join("\n")));
    assert.equal(result.errors.length, 0);
    assert.match(result.warnings[0].message, /video has no description/);
    assert.match(result.warnings[1].message, /audio has no description/);
});
test("warns about skipped heading levels", () => {
    const result = check(app(['        heading "Hello"', '        heading "Deep" level 3'].join("\n")));
    assert.equal(result.errors.length, 0);
    assert.match(result.warnings[0].message, /jumps from level 1 to level 3/);
});
test("reports style targets that are not on the page", () => {
    const result = check(app('        heading "Hello"', ['style "ghost":', "    background is blue", "end"].join("\n")));
    assert.match(result.errors[0].message, /not on any page/);
});
test("accepts style targets that exist", () => {
    const result = check(app(['        heading "Hello"', '        button "Save" called "save"'].join("\n"), ['style "save":', "    background is blue", "end"].join("\n")));
    assert.deepEqual(result.all, []);
});
//# sourceMappingURL=app-checker.test.js.map