# EngCode for Visual Studio Code

Full language support for EngCode â€” Simple English programming
for scripts, websites, and desktop apps. The extension bundles the official
EngCode compiler, language server, and debugger, so it works out of the box with
no separate install.

## Features

**Language**
- Syntax highlighting for `.eng` files (TextMate grammar)
- Snippets for `say`, `ask`, `if`, loops, functions, apps, styles, and events
- Hover docs for every statement, operator, builtin, UI element, and event phrase
- Completion for keywords, built-in phrases, and every name in your program
- Real-time diagnostics (errors and lint warnings) as you type
- Quick fixes for "Did you mean ...?" suggestions

**Navigation**
- Go to Definition and Find References across every file in the program
- Rename Symbol (multi-word names included)
- Document links on `use "..."` imports

**Tooling**
- Format Document via the official EngCode formatter
- Commands to run, serve, explain, and check the current file
- Full debugger: breakpoints, step over/in/out, call stack, locals and globals,
  variable inspection, and input prompts in the debug console

Nothing is re-implemented â€” diagnostics, formatting, symbols, and execution all
come from the same compiler and CLI that ship with EngCode.

## Commands

| Command | What it does |
|---|---|
| **EngCode: Run File** | Runs the current script in the integrated terminal |
| **EngCode: Serve App** | Starts `engcode serve` for the current app |
| **EngCode: Explain File** | Runs with `--explain`, narrating each statement |
| **EngCode: Check File** | Checks now and shows a problem summary |

## Debugging

Open a `.eng` file and press **F5** (or Run â†’ Start Debugging). You get:

- breakpoints with verification
- step over / step into / step out
- call stack through `define`, kind methods, `when`, and `every` frames
- Locals and Globals scopes with expandable lists, lists, tables, and objects
- evaluate in the debug console; program `ask` prompts accept input there too

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `engcode.executable` | *(bundled CLI)* | Override the CLI command used by Run/Serve/Explain |
| `engcode.checkOnType` | `true` | Check the file shortly after typing stops |

By default the extension runs its own bundled copy of the EngCode CLI, so no
separate installation is required. Set `engcode.executable` if you want to use
an external CLI instead.

## Building from source

```text
npm install
npm run build      # bundles extension, server, debugger, and CLI into dist/
npm test           # end-to-end tests against the built bundles
npx vsce package   # produces engcode-1.0.0.vsix
```

## License

MIT
