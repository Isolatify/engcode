import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve("editor", "vscode");

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Record<string, unknown>;
}

test("the VS Code extension declares EngCode, a grammar, and snippets", () => {
  const manifest = readJson("package.json") as {
    main: string;
    activationEvents: string[];
    contributes: {
      languages: Array<{ id: string; extensions: string[] }>;
      grammars: Array<{ scopeName: string; path: string }>;
      snippets: Array<{ language: string; path: string }>;
      iconThemes: Array<{ id: string; path: string }>;
      debuggers: Array<{ type: string; program: string }>;
      breakpoints: Array<{ language: string }>;
      commands: Array<{ command: string }>;
      configuration: { properties: Record<string, unknown> };
    };
  };

  assert.equal(manifest.main, "./dist/extension.js");
  assert.ok(manifest.activationEvents.includes("onLanguage:engcode"));
  assert.ok(manifest.contributes.languages.some((language) => language.extensions.includes(".eng")));
  assert.ok(manifest.contributes.grammars.some((grammar) => grammar.scopeName === "source.engcode"));
  assert.ok(manifest.contributes.snippets.some((snippet) => snippet.language === "engcode"));
  assert.ok(manifest.contributes.commands.some((command) => command.command === "engcode.runFile"));
  assert.ok(manifest.contributes.configuration.properties["engcode.executable"]);
  // Debugging, icon theme, and the bundled server/adapter entry points.
  assert.ok(manifest.contributes.debuggers.some((debug) => debug.type === "engcode"));
  assert.ok(manifest.contributes.breakpoints.some((entry) => entry.language === "engcode"));
  assert.ok(manifest.contributes.iconThemes.some((theme) => theme.id === "engcode"));
  assert.ok(fs.existsSync(path.join(root, "dist", "server.js")));
  assert.ok(fs.existsSync(path.join(root, "dist", "debugAdapter.js")));
  assert.ok(fs.existsSync(path.join(root, "dist", "engcode-cli.mjs")));
});

test("the grammar and language configuration are valid JSON", () => {
  const grammar = readJson("syntaxes/engcode.tmLanguage.json") as {
    scopeName: string;
    patterns: unknown[];
    repository: Record<string, unknown>;
  };
  assert.equal(grammar.scopeName, "source.engcode");
  assert.ok(Array.isArray(grammar.patterns) && grammar.patterns.length > 0);
  assert.ok(grammar.repository.comment);
  assert.ok(grammar.repository.string);
  // Statement heads and keyword phrases live in the statements/phrases
  // sections of the rewritten grammar.
  assert.ok(grammar.repository.statements);
  assert.ok(grammar.repository.phrases);

  const language = readJson("language-configuration.json") as {
    comments: { lineComment: string };
    indentationRules: { increaseIndentPattern: string; decreaseIndentPattern: string };
  };
  assert.equal(language.comments.lineComment, "note:");
  assert.match(language.indentationRules.increaseIndentPattern, /:/);
  assert.match(language.indentationRules.decreaseIndentPattern, /end/);
});

test("snippets cover the main language forms", () => {
  const snippets = readJson("snippets/engcode.json") as Record<string, { prefix: string; body: string[] }>;
  const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
  for (const prefix of ["say", "ask", "if", "repeat", "foreach", "define", "try", "app", "page", "style", "when", "keep"]) {
    assert.ok(prefixes.includes(prefix), `missing snippet ${prefix}`);
  }
});

test("the extension runs the documented CLI commands through the language server", () => {
  const client = fs.readFileSync(path.join(root, "src", "extension.ts"), "utf8");
  assert.match(client, /engcode\.runFile/);
  assert.match(client, /engcode\.check/);
  assert.match(client, /engcode\.serve/);
  assert.match(client, /engcode\.explain/);

  // Language features come from the bundled server, not from the client.
  const server = fs.readFileSync(path.join(root, "src", "server", "index.ts"), "utf8");
  assert.match(server, /onHover/);
  assert.match(server, /onCompletion/);
  assert.match(server, /onDocumentFormatting/);
  assert.match(server, /onRenameRequest/);
  assert.match(server, /onDefinition/);
});
