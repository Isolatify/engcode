import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
const root = path.resolve("editor", "vscode");
function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}
test("the VS Code extension declares EngCode, a grammar, and snippets", () => {
    const manifest = readJson("package.json");
    assert.equal(manifest.main, "./extension.js");
    assert.ok(fs.existsSync(path.join(root, "extension.js")));
    assert.ok(manifest.activationEvents.includes("onLanguage:engcode"));
    assert.ok(manifest.contributes.languages.some((language) => language.extensions.includes(".eng")));
    assert.ok(manifest.contributes.grammars.some((grammar) => grammar.scopeName === "source.engcode"));
    assert.ok(manifest.contributes.snippets.some((snippet) => snippet.language === "engcode"));
    assert.ok(manifest.contributes.commands.some((command) => command.command === "engcode.runFile"));
    assert.ok(manifest.contributes.configuration.properties["engcode.executable"]);
});
test("the grammar and language configuration are valid JSON", () => {
    const grammar = readJson("syntaxes/engcode.tmLanguage.json");
    assert.equal(grammar.scopeName, "source.engcode");
    assert.ok(Array.isArray(grammar.patterns) && grammar.patterns.length > 0);
    assert.ok(grammar.repository.comment);
    assert.ok(grammar.repository.string);
    assert.ok(grammar.repository.keyword);
    const language = readJson("language-configuration.json");
    assert.equal(language.comments.lineComment, "note:");
    assert.match(language.indentationRules.increaseIndentPattern, /:/);
    assert.match(language.indentationRules.decreaseIndentPattern, /end/);
});
test("snippets cover the main language forms", () => {
    const snippets = readJson("snippets/engcode.json");
    const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
    for (const prefix of ["say", "ask", "if", "repeat", "foreach", "define", "try", "app", "page", "style", "when", "keep"]) {
        assert.ok(prefixes.includes(prefix), `missing snippet ${prefix}`);
    }
});
test("the extension shells out to the documented CLI commands", () => {
    const source = fs.readFileSync(path.join(root, "extension.js"), "utf8");
    assert.match(source, /"check", "--json", "--lint"/);
    assert.match(source, /"format", "--stdout"/);
    assert.match(source, /engcode\.runFile/);
    assert.match(source, /registerDocumentFormattingEditProvider/);
    assert.match(source, /registerHoverProvider/);
    assert.match(source, /registerCompletionItemProvider/);
});
//# sourceMappingURL=editor.test.js.map