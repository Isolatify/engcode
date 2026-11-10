// EngCode for Visual Studio Code.
// The extension deliberately shells out to the EngCode CLI: one stable
// `--json` protocol powers diagnostics today, and an LSP can reuse it later.
const vscode = require("vscode");
const { execFile } = require("node:child_process");

let collection;
const timers = new Map();

const HOVERS = {
  say: "`say` prints one line in the terminal. Example: `say \"Hello\"`.",
  ask: "`ask \"Question\" and save it as name` reads one line from the person using the program.",
  set: "`set name to value` creates a name or replaces its value.",
  change: "`change name to value` updates a name that already exists.",
  if: "`if condition:` opens a block. Use `otherwise:` for the other branch and `end` to close it.",
  repeat: "`repeat 3 times:` runs a block three times.",
  "for each": "`for each item in list:` visits every value in a list.",
  count: "`count from 1 to 10 as number:` gives you each number in turn.",
  while: "`while condition:` repeats until the condition is no longer true.",
  define: "`define name with value:` creates a reusable function. Use `give back` to return a value.",
  try: "`try:` catches runtime errors. The failure block starts with `if it fails:`.",
  app: "`app \"Name\":` starts a web or desktop app.",
  page: "`page \"Home\":` adds a page to an app.",
  style: "`style everything:` changes the look of the whole app.",
  when: "`when \"id\" is clicked:` runs steps after the visitor acts.",
  "keep track": "`keep track of name as value` refreshes the screen when the value changes.",
  uppercase: "`uppercase of text` returns the text in capitals.",
  length: "`length of value` counts characters, list items, or table entries.",
  split: "`split text by separator` turns text into a list.",
  join: "`join list with separator` turns a list into text.",
  now: "`now` is a table with year, month, day, hour, minute, and second.",
  random: "`random number from 1 to 10` picks a whole number in the range.",
};

const KEYWORDS = [
  "say", "ask", "set", "change", "add", "remove", "if", "otherwise", "repeat",
  "for each", "count", "while", "stop", "skip", "define", "give back", "try",
  "use", "keep track", "state", "sort", "reverse", "shuffle", "wait", "save",
  "load", "delete", "read file", "write", "append", "list files", "get data",
  "send data", "show", "hide", "clear", "go to page", "popup", "play", "draw",
  "it has", "it can", "end", "app", "page", "style", "theme", "when", "every",
];

const BUILTINS = [
  "uppercase of", "lowercase of", "trim of", "length of", "round of", "floor of",
  "ceiling of", "square root of", "absolute value of", "sine of", "cosine of",
  "tangent of", "number from", "random number from", "random decimal",
  "random item of", "item", "last item of", "minimum of", "maximum of", "power",
  "split", "join", "replace", "position of", "now", "today", "format of",
  "year of", "month of", "day of", "hour of", "minute of", "second of",
];

function activate(context) {
  collection = vscode.languages.createDiagnosticCollection("engcode");
  context.subscriptions.push(collection);

  const check = (document) => checkDocument(document);
  const schedule = (document) => {
    if (!isEngCode(document) || !vscode.workspace.getConfiguration("engcode").get("checkOnType", true)) {
      return;
    }
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => check(document), 500),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidSaveTextDocument(check),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
      clearTimeout(timers.get(document.uri.toString()));
      timers.delete(document.uri.toString());
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("engcode.check", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) checkDocument(editor.document, true);
    }),
    vscode.commands.registerCommand("engcode.runFile", () => runInTerminal("run")),
    vscode.commands.registerCommand("engcode.explain", () => runInTerminal("run", "--explain")),
    vscode.commands.registerCommand("engcode.serve", () => runInTerminal("serve")),
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("engcode", {
      provideDocumentFormattingEdits(document) {
        return formatDocument(document);
      },
    }),
    vscode.languages.registerHoverProvider("engcode", {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (!range) return undefined;
        const word = document.getText(range).toLowerCase();
        const detail = HOVERS[word];
        if (!detail) return undefined;
        return new vscode.Hover(new vscode.MarkdownString(detail), range);
      },
    }),
    vscode.languages.registerCompletionItemProvider(
      "engcode",
      {
        provideCompletionItems() {
          const items = [];
          for (const word of KEYWORDS) {
            items.push(completion(word, vscode.CompletionItemKind.Keyword));
          }
          for (const word of BUILTINS) {
            items.push(completion(word, vscode.CompletionItemKind.Function));
          }
          return items;
        },
      },
      " ",
    ),
  );

  if (vscode.window.activeTextEditor) check(vscode.window.activeTextEditor.document);
}

function deactivate() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function isEngCode(document) {
  return document.languageId === "engcode" || document.fileName.toLowerCase().endsWith(".eng");
}

function executable() {
  const configured = vscode.workspace.getConfiguration("engcode").get("executable", "engcode");
  if (process.platform === "win32" && configured === "engcode") return "engcode.cmd";
  return configured;
}

function checkDocument(document, announce = false) {
  if (!isEngCode(document)) return;
  execFile(
    executable(),
    ["check", "--json", "--lint", document.fileName],
    { cwd: workspaceFolder(document) },
    (error, stdout) => {
      // Exit code 1 means "found problems"; the JSON on stdout is still valid.
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        if (announce) {
          vscode.window.showWarningMessage(
            `EngCode could not check this file. ${error ? error.message : "No JSON was returned."}`,
          );
        }
        return;
      }

      const diagnostics = parsed.map((item) => {
        const line = Math.max(0, (item.line || 1) - 1);
        const column = Math.max(0, (item.column || 1) - 1);
        const length = Math.max(1, item.length || 1);
        const range = new vscode.Range(line, column, line, column + length);
        const diagnostic = new vscode.Diagnostic(
          range,
          item.message,
          item.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = "EngCode";
        if (item.hint) diagnostic.message += ` ${item.hint}`;
        if (item.suggestion) diagnostic.message += ` Try: ${item.suggestion}`;
        return diagnostic;
      });
      collection.set(document.uri, diagnostics);
      if (announce) {
        vscode.window.showInformationMessage(
          diagnostics.length === 0
            ? "EngCode found no problems."
            : `EngCode found ${diagnostics.length} note${diagnostics.length === 1 ? "" : "s"}.`,
        );
      }
    },
  );
}

function formatDocument(document) {
  return new Promise((resolve) => {
    execFile(
      executable(),
      ["format", "--stdout", document.fileName],
      { cwd: workspaceFolder(document) },
      (error, stdout) => {
        if (error) {
          vscode.window.showErrorMessage(`EngCode could not format this file. ${error.message}`);
          resolve([]);
          return;
        }
        const full = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        );
        resolve([vscode.TextEdit.replace(full, stdout)]);
      },
    );
  });
}

function runInTerminal(command, ...extra) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isEngCode(editor.document)) {
    vscode.window.showInformationMessage("Open an .eng file first.");
    return;
  }
  const terminal = vscode.window.createTerminal("EngCode");
  terminal.show();
  const quoted = `"${editor.document.fileName.replace(/"/g, '\\"')}"`;
  terminal.sendText([executable(), command, quoted, ...extra].join(" "));
}

function completion(label, kind) {
  const item = new vscode.CompletionItem(label, kind);
  item.insertText = label;
  return item;
}

function workspaceFolder(document) {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  return folder ? folder.uri.fsPath : undefined;
}

module.exports = { activate, deactivate };
