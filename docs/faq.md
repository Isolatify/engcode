# Frequently asked questions

## Getting started

### What is EngCode?

EngCode is a beginner-first programming language. One `.eng` file can be a terminal script, a website, or a desktop app. The syntax is English, with `:` to open a block and `end` to close it. The slogan is **Build with Simple English**.

### What do I need?

Node.js 20 or newer. Everything else — the compiler, the runtime, the tutorials, the examples, and the playground — is included.

```text
engcode --version
engcode learn
```

### How do I run a file?

```text
engcode run main.eng
engcode run examples/hello/main.eng
engcode run my-project
```

A folder is read from `engcode.json` (its `entry` field) or from `main.eng`.

If `engcode` is not recognised, use `node dist/src/cli.js run main.eng` from a checkout, or install the command:

```text
npm install -g engcode
```

On Windows PowerShell, use `npm.cmd` when script execution is restricted:

```text
npm.cmd run build
```

## The language

### Why does a block need `end`?

EngCode uses a colon and `end` instead of braces or indentation. Indentation is cosmetic and the formatter keeps it tidy. The explicit `end` makes the shape of a program obvious to a beginner.

### Are keywords case-sensitive?

No. `Say`, `say`, and `SAY` are the same keyword. Names are case-sensitive: `Name` and `name` are different names. The formatter lower-cases only a statement's leading keyword, never the names you chose.

### Can names contain spaces?

Yes. `set favourite colour to "blue"` creates one name with two words. Longest-name matching keeps the rest of the grammar readable. Avoid names that end in operator words such as `plus`, `and`, or `to`; the linter warns because they are ambiguous to read.

### Why can I not use `1` or `""` as a condition?

EngCode has no truthiness. Conditions must be `yes` or `no`. Compare explicitly:

```eng
if count is greater than 0:
    say "There are some."
end
```

This prevents a whole class of beginner mistakes.

### Why is `item 1` the first item?

Lists count from 1, the way people count. `item 0` and negative positions return `nothing` rather than wrapping around.

### What is the difference between `set` and `change`?

`set` creates a name or replaces its value. `change` requires a name that already exists and gives a friendly error otherwise. Inside a block, `set` updates an outer name when one exists.

### How do I update an outer name from a function?

Mutate the value, or return a new value and assign it at the call site. A function parameter is local. Lists and tables are shared values, so adding to a list inside a function is visible to the caller.

### Can I catch syntax errors?

No. `try` catches runtime errors only. Syntax, checker, and UI errors are reported by `engcode check` before the program starts.

### Why does `use math` do nothing?

The standard library is always available. `use math`, `use time`, `use random`, `use json`, `use files`, `use web`, and `use storage` are accepted so a reader can see the intent, but they are never required. `use "helpers.eng"` really does load a file.

### How do modules work?

Paths are relative to the importing file. A module runs once, the first time it is imported. Names cannot collide across imported files, cycles are reported with the full chain, and imports must stay inside the project folder.

## Apps and websites

### “This is an app” when I run it

A file that starts with `app "..."` is a web or desktop app. Use:

```text
engcode serve .
engcode app .
```

`engcode run` is for terminal scripts.

### What is the difference between `serve`, `build web`, and `app`?

| Command | Result |
|---|---|
| `engcode serve .` | A development server with live reload |
| `engcode build web . --out site` | A static website you can upload |
| `engcode app .` | The same app in an Electron window |
| `engcode build windows . --out dist/windows` | A runnable Electron project |
| `engcode build mac . --out dist/mac` | A runnable macOS Electron project |
| `engcode build linux . --out dist/linux` | A runnable Linux Electron project |

### Why does `engcode app` say Electron is missing?

Desktop windows use Electron, which is not installed by default. Install it once in the project:

```text
npm install --save-dev electron
```

You can still generate a desktop project without Electron:

```text
engcode build windows . --out dist/windows
```

Then `cd dist/windows`, run `npm install`, and run `npm start`.

### Can I sign and notarise a desktop app?

The generated projects include an Electron Packager script (`npm run package`) that makes a release folder. Code signing, notarization, and public installers need platform certificates and credentials. They are documented publishing steps, not something this release can do for you. macOS releases must be built on macOS.

### Where do images and sounds go?

Put them next to the `.eng` file. Relative paths are resolved from there and copied into the build under `assets/`. Missing assets are a compile error that names the exact path.

### Can I write raw HTML or CSS?

No. The language has no raw HTML or raw CSS escape hatch. Styles compile to scoped CSS, and text is escaped. That keeps generated pages safe and predictable. If you need a custom component later, that would be a deliberate capability, not a hidden back door.

### Why do accessibility notes not stop my build?

They are warnings, because a missing description should be fixed but should not block a learner's first page. Run `engcode check --strict` in CI to treat warnings as errors.

## Files, network, and storage

### Which files can a program touch?

Only files inside the project folder. Paths are normalised and checked; `../` and absolute paths are rejected. There is no access to your home folder, environment variables, or a shell.

### Why does a web request fail?

- Terminal scripts need `--allow-network`.
- The address must start with `https://`.
- In a web app, add the host to `allow.network` in `engcode.json`.
- The host may be down, or the response may be larger than the 1,000,000-character limit.

Network failures are catchable:

```eng
try:
    get data from address and save it as reply
if it fails:
    say "I could not reach the server: " plus the error
end
```

### Where is device storage kept?

Terminal scripts use `.engcode/storage.json` inside the project. Web apps use browser `localStorage`, namespaced by app name. `.engcode/` is ignored by the `.gitignore` that `engcode new` creates.

### Is storage secure?

It is convenient local storage, not a secret vault. It is plain text on the visitor's machine. Never store passwords, tokens, or private keys. A visitor can clear it at any time, so always handle a missing value.

## Tools

### How do I format my code?

```text
engcode format main.eng
engcode format examples/
engcode format --check main.eng
```

The formatter is deterministic and idempotent. It uses four spaces, one statement per line, lower-case statement keywords, tidy punctuation, no trailing spaces, and a final newline. It leaves text literals and note text alone.

### What does the linter check?

`engcode lint` reports:

- names that end in an operator word
- names that shadow a built-in phrase
- names that are set but never used
- tabs, long lines, `TODO`/`FIXME` notes, and empty blocks
- programs that use files, network, or device storage

It is advice, not an error. `engcode lint --strict` exits with `1` when there is anything to report.

### How does `--explain` work?

```text
engcode run main.eng --explain
```

It prints one step per statement to stderr, with the line, the source, and a short English description. Program output stays on stdout, so piping still works. It stops describing after 200 steps. `--step` pauses between steps in a terminal: press Enter to continue, `v` for names, or `q` to quit.

### How do I reset the tutorial?

```text
engcode learn --reset
```

Progress lives in `.engcode/learn.json`. You can also mark a lesson complete with `engcode learn 4 --done`.

### Is the playground online?

No. `engcode playground` starts a local server on your machine. Scripts run locally with a 200,000-step limit, and app previews use the same runtime as a web build. Do not expose it to the internet or run untrusted code in it.

### Does the VS Code extension need a language server?

No. It shells out to `engcode check --json --lint` for diagnostics, `engcode format --stdout` for formatting, and the normal CLI for run, serve, and explain. The JSON protocol is stable, so a language server can be added later. See [editor/vscode/README.md](../editor/vscode/README.md).

## Installation and releases

### Is there a one-line install?

For a published npm release:

```text
npm install -g engcode
```

From a checkout or a release folder:

```text
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From .
sh scripts/install.sh --from .
```

See [install.md](install.md) for the full set of options.

### Is there a standalone binary that does not need Node?

Not yet. The current package and release folder use Node.js 20 or newer. A Node-free binary needs a separate packaging toolchain and is tracked as future work. The release packager produces an npm tarball, a portable folder with launchers, and SHA-256 checksums.

### Which platforms are supported?

Windows, macOS, and Linux for terminal scripts, websites, and the CLI. Desktop windows use Electron on all three. macOS releases must be packaged and signed on a Mac.

### Where are the docs and examples?

- [Getting started](getting-started.md)
- [Language reference](grammar.md)
- [App guide](apps.md)
- [Styling guide](styling.md)
- [Standard library](stdlib.md)
- [CLI](cli.md)
- [Security and permissions](security.md)
- [Cheat sheet](cheatsheet.md)
- [Tutorial](tutorial.md)
- [Examples](../examples)

## Troubleshooting

### “I don't know the name …”

Check spelling and capitalisation. Run `engcode check main.eng` for the line, a caret, and a suggestion. A name must be set before it is read.

### “I didn't expect … here”

The parser reached a word that does not fit the grammar. Look at the caret. Common causes are a missing `end`, a missing `to`, or two statements on one line. EngCode is one statement per line.

### The terminal shows a PowerShell error for npm

Use `npm.cmd` on Windows:

```text
npm.cmd run build
npm.cmd test
```

### A port is already in use

`engcode serve` and `engcode playground` try the next ten ports. Read the address printed in the terminal. You can also choose one:

```text
engcode serve . --port 3100
engcode playground --port 4100
```

### The browser does not reload

Live reload uses server-sent events. A proxy, an aggressive firewall, or a saved static file can block it. Open the address that `engcode serve` prints, and make sure you are editing a `.eng` file inside the served project.

### I deleted a file and the formatter cannot find it

`engcode format` reports a missing target and exits with `1`. Use `engcode format .` to walk the current folder, skipping `node_modules`, `.git`, and `.engcode`.

### How do I get help?

```text
engcode --help
engcode help
```

For a language question, start with the [cheat sheet](cheatsheet.md), then run `engcode learn`.
