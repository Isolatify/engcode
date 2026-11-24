# Contributing to EngCode

Thanks for helping make programming more readable. A few rules keep the language and the codebase friendly.

## The one rule for language changes

Before proposing new words or syntax, ask: **does it remove a hurdle between a beginner and a running program?** Ideas that only impress experienced developers wait. This is the same rule the roadmap uses, and it applies to every pull request that adds grammar, a command, or a diagnostic.

## Real syntax only

Everything that renders EngCode code — docs, READMEs, examples, error-message tests, the website — must use syntax the compiler actually accepts. Check [docs/grammar.md](docs/grammar.md) and [docs/cheatsheet.md](docs/cheatsheet.md) first, and run `engcode check your-file.eng` on any example you write. A doc snippet that doesn't run is a bug.

## Getting set up

```text
git clone https://github.com/Isolatify/engcode.git
cd engcode
npm install
npm run build
npm test
```

You need Node.js 20 or newer.

## Where things live

| Folder | What it is |
|---|---|
| `src/` | The compiler: lexer, parser, checker, interpreter, diagnostics |
| `runtime/` | The browser runtime that powers apps and the playground |
| `editor/vscode/` | The VS Code extension |
| `docs/` | The language and tool documentation |
| `tests/` | Automated tests (currently 322, all passing) |

## Before you open a pull request

1. `npm run typecheck` — no errors
2. `npm test` — all tests pass; add a test for every new behavior
3. `npm run lint` (if you touched `src/lint.ts`) and `engcode check` any new example files
4. Keep diagnostics friendly: they follow the "Oops — line N", plain-English, "Try this:" format in [docs/cli.md](docs/cli.md)
5. Update [docs/](docs/) and the [cheat sheet](docs/cheatsheet.md) when behavior changes

## Pull request style

- One logical change per pull request.
- Use the pull request template and describe what a learner gains.
- Tests and docs updated in the same change.

## Code of conduct

Be kind and assume beginners are welcome here — they are the point of the project. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
