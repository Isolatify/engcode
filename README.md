# EngCode

**Build with Simple English**

EngCode is a beginner-first programming language for scripts, websites, and desktop apps. One `.eng` file can describe what is on the screen, how it looks, and what it does — all in plain English.

```eng
set name to "Sam"
say "Hello, " plus name
```

No semicolons. No braces. No type declarations. Blocks start with `:` and finish with `end`.

## Status

**Milestone 4 desktop projects are in place.** Terminal scripts, browser apps, and Electron desktop apps all run:

- variables, `say`, `ask`, conditions, and loops
- functions, closures, lists, tables, and `try`
- objects with `define a kind of thing called ...`
- modules with `use "helpers.eng"`
- files, device storage, `wait`, and HTTPS requests
- a persistent REPL
- five runnable terminal examples
- apps with pages, UI blocks, themes, styles, animations, media, events, timers, routing, storage, web data, and canvas
- five runnable app examples with DOM smoke tests
- static websites with `engcode build web`
- a live-reload development server with `engcode serve`
- desktop projects with `engcode app`, `engcode build windows`, and `engcode build mac`
- 261 automated tests, all passing
- 93.2% line coverage across the language, web compiler, desktop shell, and browser runtime
- a one-million-iteration loop in well under two seconds

Desktop builds need Electron, which is installed on demand. The generated project includes the app, a locked-down Electron window, a launcher, and a `npm run package` script for a release folder. Code signing and installers are separate publishing steps.

## Run a file

From this folder, build once and then run any example:

```text
npm install
npm run build
node dist/src/cli.js run examples/hello/main.eng
```

Or install the `engcode` command for your machine:

```text
npm install -g .
engcode run examples/hello/main.eng
```

On Windows PowerShell, use `npm.cmd` if script execution is restricted:

```text
npm.cmd run build
node dist/src/cli.js run examples/guess/main.eng
```

You can pass input through the terminal, or pipe it in:

```text
"Sam" | node dist/src/cli.js run examples/hello/main.eng
```

Check a file without running it:

```text
node dist/src/cli.js check examples/quiz/main.eng
```

Open the interactive prompt:

```text
node dist/src/cli.js repl
```

## Build a web app

An app puts pages, UI blocks, styles, and events in one `.eng` file:

```eng
app "Counter":
    page "Home":
        heading "Counter"
        text "0" called "count"
        button "Add one" called "add"
    end
end

keep track of total as 0

style everything:
    font is "Helvetica"
    background is light gray
end

when "add" is clicked:
    change total to total plus 1
    change text of "count" to total
end
```

Themes name your colours and fonts once, then styles reuse them. Dark values follow the visitor's system preference:

```eng
theme "Day":
    accent is #2563eb
    background is #f8fafc
    text is #1f2937
    font is modern
    corner radius is 12
end

theme "Night" in dark mode:
    background is #0f172a
    text is #e2e8f0
end

style everything:
    background is background
    text color is text
    font is font
end

style cards:
    animation is slide up over 0.5 seconds
    when mouse is over:
        animation is float over 2 seconds forever
    end
end
```

Images, video, and audio take `with description`, `width`, `height`, `poster`, and `loops`:

```eng
image "sam.png" with description "A photo of Sam" and width 220 and height 220
video "tour.mp4" with description "A studio tour" and poster "cover.jpg" and loops
```

Run it with live reload while you edit:

```text
node dist/src/cli.js serve examples/todo
```

Build a static website instead:

```text
node dist/src/cli.js build web examples/todo --out site
```

The output is plain HTML, CSS, JavaScript, and an `assets/` folder. Open `site/index.html` in a browser or upload the folder to any static host. The build uses semantic HTML, a skip link, accessible form labels, a content security policy, and no `eval`.

`engcode serve` watches every `.eng` file in the project, rebuilds on save, reloads the browser, and shows compiler errors as an overlay. It picks the next free port when `--port` is busy.

Apps may read device storage with `save ... to the device` and `load ... from the device`. Web requests must use HTTPS. When `engcode.json` contains an allow list, the compiler embeds it and the browser runtime refuses other hosts:

```json
{
  "name": "weather",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

## Build a desktop app

Open an app in a native window:

```text
engcode app examples/todo
```

Or generate a desktop project for a platform:

```text
engcode build windows examples/todo --out dist/windows
engcode build mac examples/notes --out dist/mac
```

The folder contains `main.cjs`, `package.json`, `README.md`, the website in `app/`, and a launcher (`run.cmd` or `run.sh`). Install Electron once and start it:

```text
cd dist/windows
npm install
npm start
```

`npm run package` creates a release folder with Electron Packager. Build macOS releases on a Mac; code signing and notarization are additional publishing steps. The generated window uses context isolation, keeps Node.js out of the page, runs in a sandbox, serves files from a private `127.0.0.1` address, and sends external HTTPS links to the normal browser.

## Learn EngCode

- [Getting started](docs/getting-started.md) — a step-by-step guide from your first line to objects, modules, files, the REPL, and web apps.
- [Design document](docs/design.md) — vision, keywords, semantics, architecture, CLI, sample programs, milestones.
- [Formal grammar](docs/grammar.md) — EBNF for the whole language, including app and style blocks.

A first program:

```eng
set score to 0
repeat 3 times:
    change score to score plus 1
end
say "Score: " plus score
```

Objects:

```eng
define a kind of thing called Dog:
    it has name and age
    it can bark:
        say name plus " says woof"
    end
    it can years with amount:
        give back age plus amount
    end
end

set rex to a new Dog with name "Rex", age 3
rex bark
say call rex's years with 10
```

## Examples

Every example is a complete, runnable program.

Terminal scripts:

| Example | What it shows |
| --- | --- |
| [`hello`](examples/hello/main.eng) | `say`, `ask`, variables |
| [`guess`](examples/guess/main.eng) | random numbers, `while`, conditions |
| [`calculator`](examples/calculator/main.eng) | functions, numbers, `otherwise if` |
| [`quiz`](examples/quiz/main.eng) | lists, tables, scores, `for each` |
| [`rock-paper-scissors`](examples/rock-paper-scissors/main.eng) | random items, parentheses, `or` |

Web apps:

| Example | What it shows |
| --- | --- |
| [`todo`](examples/todo/main.eng) | forms, lists, device storage, hover styles |
| [`portfolio`](examples/portfolio/main.eng) | themes, light and dark mode, fonts, animations, images, video |
| [`weather`](examples/weather/main.eng) | HTTPS data, tables, `try`, network allow list |
| [`notes`](examples/notes/main.eng) | text areas, saved lists, page-open events |
| [`pong`](examples/pong/main.eng) | canvas drawing, keyboard input, `every frame` |

Run terminal examples:

```text
node dist/src/cli.js run examples/calculator/main.eng
node dist/src/cli.js run examples/quiz/main.eng
node dist/src/cli.js run examples/rock-paper-scissors/main.eng
```

Open app examples:

```text
node dist/src/cli.js serve examples/todo
node dist/src/cli.js serve examples/weather
```

Or build them all:

```text
for example in todo portfolio weather notes pong; do
  node dist/src/cli.js build web "examples/$example" --out "site/$example"
done
```

## Commands

Available now:

```text
engcode run file.eng          run a terminal script
engcode run folder            run the entry in engcode.json or main.eng
engcode serve folder          run an app in the browser with live reload
engcode serve folder --port 3000 --open
engcode app folder            open an app in a desktop window
engcode build web folder       make a static website in dist/
engcode build web folder --out site --minify
engcode build windows folder   make a Windows desktop project in dist/windows/
engcode build mac folder       make a macOS desktop project in dist/mac/
engcode check file.eng        find mistakes without running
engcode check --json file.eng machine-readable diagnostics
engcode repl                  type English and run it right away
engcode help                  show help
engcode version               show the version
```

`check` prints accessibility notes as warnings and still exits successfully. Errors exit with code 1.

Planned for later milestones:

```text
engcode new my-project
engcode format file.eng
engcode learn
```

## Project layout

```text
src/        lexer, parser, checker, interpreter, web compiler, desktop shell, CLI
runtime/    dependency-free browser runtime and DOM interpreter
cli/        installer and launcher assets
examples/   runnable terminal programs and web apps
docs/       design, grammar, and guides
tests/      automated tests for every language feature and example
editor/     VS Code extension (later milestone)
```

## Licence

MIT
