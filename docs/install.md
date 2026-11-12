# Install EngCode

EngCode needs **Node.js 20 or newer**. The compiler, CLI, runtime, tutorial, examples, docs, and playground are included in the package. After installation, everything works offline.

## Install from npm

This is the recommended way to install EngCode on every platform:

```text
npm install -g engcode
engcode --version
```

### Windows (PowerShell)

```powershell
npm install -g engcode
engcode --version
```

If PowerShell restricts npm scripts, call `npm.cmd` directly:

```powershell
npm.cmd install -g engcode
engcode --version
```

### macOS

```sh
npm install -g engcode
engcode --version
```

### Linux

```sh
npm install -g engcode
engcode --version
```

If npm reports `EACCES` (a permission error), either run the command with `sudo`, or configure a prefix your own account owns:

```sh
npm config set prefix "$HOME/.npm-global"
```

Add `$HOME/.npm-global/bin` to your `PATH` and run `npm install -g engcode` again.

## Install from a checkout

From a clone of this repository, pack the tarball and install it:

```text
npm install
npm run build
npm pack
npm install -g ./engcode-1.0.0.tgz
engcode --version
```

`npm pack` produces the same tarball the registry serves. Do not use `npm install -g .` on the checkout: npm copies a folder as it is, which would bring tests, sources, and `node_modules` along. The install scripts below do the packing for you.

If you only want to try it without installing a command:

```text
npm install
npm run build
node dist/src/cli.js run examples/hello/main.eng
```

On Windows PowerShell, use `npm.cmd` if script execution is restricted:

```text
npm.cmd install
npm.cmd run build
npm.cmd pack
npm.cmd install -g .\engcode-1.0.0.tgz
```

## Install scripts

The repository includes installers for Windows and macOS/Linux. They check for Node.js 20 or newer, install the package globally, and verify the `engcode` command. Without options they install the published npm package. Given a folder, they pack it with `npm pack` first (or use the `engcode-*.tgz` inside a release folder), so a checkout is never copied wholesale.

### Windows (PowerShell)

```powershell
# From the published npm package
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# From a checkout or release folder
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From .

# From a packed npm tarball
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From .\release\engcode-1.0.0.tgz

# A specific version
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Version 1.0.0

# A custom prefix
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -From . -Prefix C:\Tools\engcode
```

### macOS and Linux

```sh
# From the published npm package
sh scripts/install.sh

# From a checkout or release folder
sh scripts/install.sh --from .

# From a packed npm tarball
sh scripts/install.sh --from ./release/engcode-1.0.0.tgz

# A specific version
sh scripts/install.sh --version 1.0.0

# A custom prefix
sh scripts/install.sh --from . --prefix "$HOME/.local"
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
  engcode-1.0.0.tgz          npm package
  engcode-1.0.0/             portable folder
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
.\release\install.ps1 -From .\release\engcode-1.0.0.tgz
```

```sh
sh release/install.sh --from ./release/engcode-1.0.0.tgz
```

Or run the portable folder directly without installing:

```powershell
.\release\engcode-1.0.0\engcode.cmd --version
```

```sh
./release/engcode-1.0.0/engcode --version
```

The portable launchers call `node dist/src/cli.js`; they still need Node.js on the machine.

## What gets installed

The npm package includes:

- `dist/src/` — the compiled CLI, compiler, interpreter, linter, formatter, and web compiler
- `dist/runtime/web-runtime.js` — the browser runtime used by `engcode build web`
- `docs/` — getting started, grammar, guides, FAQ, and cheat sheet
- `examples/` — terminal scripts, web apps, and the Windows 11-style notebook
- `playground/` — the local playground page and assets
- `README.md`, `LICENSE`, and `package.json`

Not included: tests, source maps, the VS Code extension (see [Editor support](#editor-support)), and the release helpers in `scripts/`.

The `engcode` command is `dist/src/cli.js`.

## Verify the install

Anywhere on your machine:

```text
engcode --version
engcode new demo --type script
engcode check demo/main.eng
engcode run demo/main.eng
engcode learn
```

From a checkout, the bundled examples work too:

```text
engcode check examples/hello/main.eng
engcode run examples/hello/main.eng
```

`engcode run` reads input from the terminal. To pipe an answer:

```text
"Sam" | engcode run examples/hello/main.eng
```

## Update

```text
npm install -g engcode@latest
```

Or reinstall from a newer checkout with the pack steps from [Install from a checkout](#install-from-a-checkout) above (`npm pack`, then `npm install -g ./engcode-1.0.0.tgz`).

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
code --install-extension engcode-1.0.0.vsix
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

See [security.md](security.md) for the capability model and [cli.md](cli.md) for every command.
