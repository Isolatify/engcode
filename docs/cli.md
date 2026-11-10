# EngCode command line

The `engcode` command runs scripts, builds websites, opens desktop projects, checks code, formats it, and teaches the language. All commands work on Windows, macOS, and Linux with Node.js 20 or newer.

```text
EngCode — Build with Simple English
```

## Start here

```text
engcode new my-project --type script
cd my-project
engcode run main.eng
```

Project kinds:

| Kind | What it makes |
|---|---|
| `script` | A terminal program with `main.eng` |
| `website` | A static page with a style block and a button |
| `app` | A small counter app with state and an event |
| `desktop` | A Windows-style Electron app starter |

`new` creates `main.eng`, `engcode.json`, `.gitignore`, and a short `README.md`. It refuses to overwrite an existing folder.

## Running scripts

```text
engcode run main.eng
engcode run examples/hello/main.eng
engcode run my-project
```

A folder is read from its `engcode.json` `entry` field, or `main.eng`.

Options:

| Option | Meaning |
|---|---|
| `--allow-network` | Allow HTTPS requests for this run |
| `--explain` | Explain every executed statement in English |
| `--step` | Pause after each statement in a terminal |

### Explain and step

```text
engcode run main.eng --explain
```

Each step prints the line, the source, and a plain-English description:

```text
Step 1 · line 1
  set name to "Sam"
  → store a value in "name".

Step 2 · line 2
  say "Hi " plus name
  → show a value in the terminal.
```

`--step` prints the same lines and waits. Press **Enter** to continue, `v` to show every name and value, or `q` to quit. When input is piped (for example in a test), `--step` continues automatically so the program's own input still works.

The explanation stops after 200 steps and says so; loops cannot flood the terminal.

## Checking, linting, and formatting

```text
engcode check main.eng
engcode check --json main.eng
engcode check --lint main.eng
engcode check --strict main.eng
```

`check` parses and checks the whole program, including imported files, UI ids, event targets, and conditions. Add `--lint` to include linter advice, including a note when a program can use files, network, or device storage. Warnings such as missing image descriptions do not fail the command unless you add `--strict`.

`--json` prints a stable array for editors:

```json
[
  {
    "message": "I don't know the name \"naem\".",
    "line": 2,
    "column": 5,
    "length": 4,
    "severity": "error",
    "suggestion": "Did you mean \"name\"?",
    "hint": "Check the spelling."
  }
]
```

`--lint` adds advice from the linter:

- names that end in an operator word, such as `score plus`
- names that shadow a built-in phrase
- names that are set but never used
- tabs, very long lines, `TODO`/`FIXME` notes, and empty blocks
- programs that use files, network, or device storage

Run the linter alone:

```text
engcode lint main.eng
engcode lint --strict main.eng
engcode lint --json main.eng
```

Format a file, a folder, or every `.eng` file under a folder:

```text
engcode format main.eng
engcode format examples/
engcode format --check main.eng
engcode format --stdout main.eng
```

The formatter is deterministic and idempotent. It uses four-space indentation, one statement per line, lower-case statement keywords, tidy punctuation, no trailing spaces, and a final newline. It leaves text literals and note text exactly as written. `--check` exits with `1` when a file would change, which is useful in CI.

## Apps and websites

```text
engcode serve .
engcode serve . --port 3000 --open
engcode build web . --out dist
```

`serve` builds in memory, watches every `.eng` file, reloads the browser with server-sent events, and shows build errors in an overlay. If the port is busy, it tries the next ten ports.

`build web` writes `index.html`, `styles.css`, `app.js`, `runtime.js`, and copied assets. The output is a static single-page site with hash routes, a content security policy, and no framework.

Desktop:

```text
engcode app .
engcode build windows . --out dist/windows
engcode build mac . --out dist/mac
engcode build linux . --out dist/linux
```

`app` builds and launches an Electron window. If Electron is not installed, it writes the project and explains how to install it:

```text
npm install --save-dev electron
```

`build windows` and `build mac` write a runnable Electron project with a private loopback server, context isolation, no Node.js integration, a sandbox, a launcher, and an Electron Packager script. macOS releases must be packaged on macOS. Code signing, notarization, and public installers are release steps; see [install.md](install.md).

## REPL

```text
engcode repl
```

The prompt keeps names between lines, continues blocks until `end`, and supports:

```text
:help
:clear
:load main.eng
:quit
```

Option `--allow-network` works for the REPL too.

## Tutorial

```text
engcode learn
engcode learn 3
engcode learn 3 --run
engcode learn 3 --file main.eng
engcode learn 3 --done
engcode learn --reset
```

The tutorial has 20 lessons. Progress is stored in `.engcode/learn.json` in the current folder. `--file` runs your attempt, compares the output with the expected result, and gives a hint after two failures.

## Playground

```text
engcode playground
engcode playground --port 4000 --open
```

The playground is a local browser editor served from `playground/`. It runs terminal scripts with a 200,000-step limit, shows friendly diagnostics, and previews apps in a sandboxed iframe using the same runtime as a web build. It is intentionally local: code is not sent to a third-party service.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | A user error: syntax, check, runtime, missing file, or a failing `--check` |
| `2` | An internal error |

## Diagnostics and docs

Every diagnostic includes a line number, the source line, a caret, a hint, and a suggestion where possible. The same messages appear in the terminal, the playground, and the VS Code extension. See [grammar.md](grammar.md) and [cheatsheet.md](cheatsheet.md) for the language itself.
