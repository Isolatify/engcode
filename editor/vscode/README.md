# EngCode for Visual Studio Code

This extension adds EngCode language support to VS Code:

- syntax highlighting for `.eng` files
- snippets for `say`, `ask`, `if`, `repeat`, loops, functions, apps, styles, and events
- completion for keywords and built-in phrases
- hover explanations for common words
- friendly diagnostics from `engcode check --json --lint`
- format on save using `engcode format`
- commands to run, serve, and explain a file

## Install

Build and link the CLI first:

```text
npm install
npm run build
npm link
```

Then install this folder as an extension:

```text
cd editor/vscode
npm install -g @vscode/vsce
vsce package
code --install-extension engcode-0.1.0.vsix
```

Or copy this folder into your VS Code extensions directory and reload.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `engcode.executable` | `engcode` | The CLI command or full path to run. |
| `engcode.checkOnType` | `true` | Check the file shortly after typing stops. |

If the CLI is only available in this repository, set `engcode.executable` to the
full path of `dist/src/cli.js` wrapped by Node, or install the package globally
with `npm install -g .`.

## Commands

- **EngCode: Run File** runs the current script in a terminal.
- **EngCode: Serve App** starts `engcode serve` for the current app.
- **EngCode: Explain File** runs with `--explain`.
- **EngCode: Check File** refreshes diagnostics immediately.

Format on save works through VS Code's normal `editor.formatOnSave` setting.
