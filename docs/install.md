# Install EngCode

EngCode needs **Node.js 20 or newer**. The compiler, runtime, tutorial, examples, docs, playground, and editor support are included in the package. After installation, everything works offline.

## The shortest install

When EngCode is published to npm:

```text
npm install -g engcode
engcode --version
```

From a checkout of this repository:

```text
npm install
npm run build
npm install -g .
engcode --version
```

If you only want to try it without installing a command:

```text
npm run build
node dist/src/cli.js run examples/hello/main.eng
```

On Windows PowerShell, use `npm.cmd` if script execution is restricted:

```text
npm.cmd install
npm.cmd run build
npm.cmd install -g .
```

## Install scripts

The repository includes installers for Windows and macOS/Linux. They check Node.js, install the package globally, and verify the `engcode` command.

### Windows

```powershell
# From a checkout or release folder
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From .

# From an npm package
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# A specific version
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Version 0.1.0

# A custom prefix
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From . -Prefix C:\Tools\engcode
```

When a published install URL exists, the one-line form is:

```powershell
irm https://<your-release-host>/install.ps1 | iex
```

### macOS and Linux

```sh
# From a checkout or release folder
sh scripts/install.sh --from .

# From an npm package
sh scripts/install.sh

# A specific version
sh scripts/install.sh --version 0.1.0

# A custom prefix
sh scripts/install.sh --from . --prefix "$HOME/.local"
```

When a published install URL exists, the one-line form is:

```sh
curl -fsSL https://<your-release-host>/install.sh | sh
```

Both scripts refuse to continue when Node.js is missing or older than 20, and they report a failed `npm install` instead of pretending it worked.

## Make a release

```text
node scripts/package-release.mjs
```

or:

```text
npm run package:release
```

The script builds the TypeScript, packs the npm tarball, and writes:

```text
release/
  engcode-0.1.0.tgz          npm package
  engcode-0.1.0/             portable folder
    dist/                    compiler, CLI, runtime, tests
    docs/                    guides and reference
    examples/                runnable projects
    playground/              local playground assets
    editor/                  VS Code extension
    engcode.cmd              Windows launcher
    engcode                  macOS/Linux launcher
    README.md
  install.ps1                local installer
  install.sh                 local installer
  SHA256SUMS.txt             checksums
```

Install from the release folder:

```powershell
.\release\install.ps1 -From .\release
```

```sh
sh release/install.sh --from ./release
```

Or run the portable folder directly without installing:

```powershell
.\release\engcode-0.1.0\engcode.cmd --version
```

```sh
./release/engcode-0.1.0/engcode --version
```

The portable launchers call `node dist/src/cli.js`; they still need Node.js on the machine.

## What gets installed

The npm package includes:

- `dist/` — the compiled CLI, compiler, interpreter, web runtime, desktop shell, and tests
- `docs/` — getting started, grammar, guides, FAQ, and cheat sheet
- `examples/` — terminal scripts, web apps, and the Windows 11-style notebook
- `playground/` — the local playground page and assets
- `editor/` — the VS Code extension source
- `scripts/` — install and release helpers
- `README.md` and `package.json`

The `engcode` command is `dist/src/cli.js`.

## Verify the install

```text
engcode --version
engcode check examples/hello/main.eng
engcode run examples/hello/main.eng
engcode learn
```

`engcode run` reads input from the terminal. To pipe an answer:

```text
"Sam" | engcode run examples/hello/main.eng
```

## Update

```text
npm install -g engcode@latest
```

Or reinstall from a newer checkout or release folder:

```text
npm install -g .
```

## Uninstall

```text
npm uninstall -g engcode
```

If you installed with a custom prefix, remove that prefix's `engcode` launcher and `node_modules/engcode` folder.

## Offline use

After installation, no network is needed for the language, the CLI, the tutorial, the examples, the docs, or the playground. Only programs that use `get data` or `send data` make requests, and terminal scripts require `--allow-network`.

## Editor support

The VS Code extension lives in `editor/vscode`. Build and link the CLI first, then package the extension:

```text
npm install
npm run build
npm link

cd editor/vscode
npm install -g @vscode/vsce
vsce package
code --install-extension engcode-0.1.0.vsix
```

On Windows, the extension runs `engcode.cmd` by default. If the CLI is only in this repository, set `engcode.executable` to the full command or install the package globally.

## Platform notes

| Platform | Status |
|---|---|
| Windows 10/11 | CLI, web apps, desktop projects; generated Windows 11 styling uses Segoe UI Variable |
| macOS | CLI, web apps, desktop projects; build macOS desktop releases on a Mac |
| Linux | CLI, web apps, desktop projects; Electron Packager output follows the host platform |

## Current limitations

Be clear about what is not finished:

- **No Node-free standalone binary yet.** The package and portable folder require Node.js 20 or newer. A single-file binary needs a separate toolchain (for example Node SEA or a bundler with a runtime) and is future work.
- **No signed installers yet.** Code signing, notarization, `.exe`/`.pkg` installers, and a GUI installer require platform certificates and credentials. They are publishing steps layered on top of the release artifacts, not features of the language.
- **Electron is not bundled.** `engcode app` and the generated desktop projects need Electron installed once (`npm install --save-dev electron`). `build windows` and `build mac` still produce a complete project without it.
- **The install URLs are placeholders.** Replace `<your-release-host>` with the real release host when you publish. The scripts themselves are ready for a published npm package and for local `--from` installs.

See [security.md](security.md) for the capability model and [cli.md](cli.md) for every command.
