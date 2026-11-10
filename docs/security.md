# Security and permissions

EngCode is designed for learners, so capabilities are visible and limited by default. A program should never be able to quietly read your home folder, call an unknown server, or escape its own page.

This page describes what the current release enforces, and what it deliberately leaves to publishing steps.

## At a glance

| Capability | Default | Control |
|---|---|---|
| Project files | Allowed inside the project folder | Paths are resolved and must stay inside the root |
| Network | Denied in terminal scripts | `--allow-network` for one run, HTTPS only |
| Network in web/desktop apps | HTTPS allowed; optional host allow list | `allow.network` in `engcode.json` |
| Device storage | Allowed, namespaced per project or app | `.engcode/storage.json` or browser `localStorage` |
| Desktop window | No Node.js in the page | Context isolation, sandbox, no Node integration |
| Generated pages | No inline script, no `eval` | Content security policy + text escaping |

## Project files

File statements are always limited to the folder that holds the program:

```eng
read file "notes.txt" and save it as notes
write "hello" to file "notes.txt"
list files in "." and save it as names
delete file "notes.txt"
```

The interpreter resolves every path against the project root, normalises it, and rejects anything that escapes it, including `../` and absolute paths. The path check does not resolve symlinks, so do not create a link that points outside the project.

There is no ambient access to your home folder, environment variables, or arbitrary executables. File paths do not expand `~`, and there is no shell statement.

A program you run is still a program you chose to run. Review an unfamiliar `.eng` file before running it, just as you would review any script.

## Network

Terminal scripts cannot make a request unless you add the flag:

```text
engcode run main.eng --allow-network
```

The address must begin with `https://`. Plain HTTP is rejected before a request is made. A failed request is a catchable runtime error, so `try` / `if it fails` can show a friendly message.

In a browser or desktop app, declare the hosts you expect in `engcode.json`:

```json
{
  "name": "weather",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

The compiler embeds that list and the browser runtime refuses every other host. Add an allow list before publishing. Without one, a web app can call HTTPS hosts, which is convenient for learning but too broad for a public site.

Other limits:

- Only HTTPS is accepted; the runtime checks the parsed URL, not just the text prefix.
- A redirect to a different host is still subject to the browser's own protections; keep allow lists narrow.
- Web responses larger than 1,000,000 characters are rejected.
- In a terminal run, `--allow-network` is all-or-nothing: it permits any HTTPS host for that run. There is no host allow list for scripts.
- `send data` sends JSON. Do not send secrets from a page; anything in a web app is visible to the visitor.

## Device storage

```eng
save tasks to the device as "tasks"
load "tasks" from the device and save it as saved tasks
```

- Terminal scripts store values in `.engcode/storage.json` inside the project folder. Add `.engcode/` to `.gitignore`; `engcode new` does this for you.
- Web apps use browser `localStorage`, namespaced by app name, so one app cannot read another app's keys by accident.
- Stored data is plain text on the visitor's machine. Never store passwords, tokens, or private keys.
- A visitor can clear storage at any time. Treat a missing key as normal and provide a default.

## Generated websites

The web compiler emits semantic HTML, CSS, and a small JavaScript runtime. It does not use a framework, a CDN, or `eval`.

- User text is escaped. There is no raw HTML or raw CSS syntax in the language.
- Links allow `http:`, `https:`, `mailto:`, `tel:`, and same-page `#...`; `javascript:` is rejected by the checker.
- Every page includes a content security policy that allows scripts and styles only from the site itself:

```text
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: https:; media-src 'self' https:;
connect-src 'self' https:;
```

- Styles compile to scoped selectors. There is no raw CSS escape hatch in this release.
- Ids, event targets, style targets, page names, and `showing` values are checked before a build.

Serving a site over HTTPS is the host's job. A static host such as GitHub Pages or Netlify provides it; a local `engcode serve` is for development only.

## Desktop windows

`engcode app` and the generated desktop projects use Electron with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`

The page is served from a private server on `127.0.0.1` with a random port. Navigation away from that origin is blocked. External `https://` links open in the normal browser instead of inside the app. There is no preload bridge to arbitrary Node.js APIs, so page code cannot require modules or spawn processes.

The same web capability rules apply inside the window: HTTPS requests, optional host allow list, project-relative files copied into the build, and namespaced storage.

## Limits that keep a mistake small

- **Step limit in the playground.** A playground script stops after 200,000 statements. `engcode learn` uses 100,000.
- **Explanation limit.** `--explain` and `--step` stop printing after 200 steps, so a loop cannot flood the terminal.
- **Response limit.** Web responses over 1,000,000 characters are rejected.
- **Request body limit in the playground.** Requests over 256 KB are rejected.
- **Timeouts.** `wait` is a language feature, not a way to keep a process alive forever; the CLI can always be stopped with Ctrl+C.
- **No shell access.** EngCode has no `exec`, `system`, `spawn`, or environment-variable statement.

## What is not covered yet

Be honest about the edges:

- **Code signing and notarization** are publishing steps, not features of this release. Generated desktop projects are runnable, but public distribution needs certificates and platform tooling.
- **A Node-free standalone binary** is not produced yet. The current install uses Node.js 20 or newer. See [install.md](install.md).
- **The local playground executes code on your machine.** It is a local development tool, not a public sandbox. Do not expose it to the internet or run untrusted programs in it.
- **Running an untrusted `.eng` script** still grants the capabilities above: project files, device storage, and network if you pass `--allow-network`. There is no operating-system sandbox around the Node.js process.
- **Dependencies** are kept small. The compiler and CLI use Node.js built-ins only; `happy-dom` is a test dependency, and Electron is installed only when you want a desktop window.

## Reporting a problem

If you find a way to escape the project root, reach a host that the allow list should block, or inject markup through user text, include:

1. the smallest `.eng` file that shows the problem,
2. the exact command you ran,
3. the EngCode version from `engcode --version`,
4. what you expected and what happened.

Do not include secrets or private data in a report.
