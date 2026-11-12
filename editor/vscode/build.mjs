// Bundles everything the VSIX needs into dist/:
//
//   extension.js      VS Code client (CJS, `vscode` external)
//   server.js         language server (CJS)
//   debugAdapter.js   DAP adapter (CJS)
//   debugSession.js   interpreter child process (CJS)
//   engcode-cli.mjs   the whole EngCode CLI (ESM — run/serve/explain/check)
//   runtime/web-runtime.js  browser runtime read by `engcode serve`
//
// esbuild resolves the engine's `.js` specifiers back to their TypeScript
// originals, so the compiler is embedded without a second build step.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = path.resolve(here, "..", "..");

/**
 * The CLI bundle lands in dist/, but two engine sources resolve assets with
 * `import.meta` relative to their original home. Point them at copies that
 * ship inside dist/ instead.
 */
const assetPaths = {
  filter: /web[\\/]compiler\.ts$|playground\.ts$/,
  plugin: {
    name: "engcode-asset-paths",
    setup(build) {
      build.onLoad({ filter: assetPaths.filter }, (args) => {
        let source = fs.readFileSync(args.path, "utf8");
        source = source.replace(
          'new URL("../../runtime/web-runtime.js", import.meta.url)',
          'new URL("./runtime/web-runtime.js", import.meta.url)',
        );
        source = source.replace(
          'path.resolve(import.meta.dirname, "../../playground")',
          'path.resolve(import.meta.dirname, "playground")',
        );
        return { contents: source, loader: "ts" };
      });
    },
  },
};

/** @type {import("esbuild").BuildOptions[]} */
const builds = [
  {
    entryPoints: [path.join(here, "src", "extension.ts")],
    outfile: path.join(here, "dist", "extension.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
    logLevel: "info",
  },
  {
    entryPoints: [path.join(here, "src", "server", "index.ts")],
    outfile: path.join(here, "dist", "server.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "info",
  },
  {
    entryPoints: [path.join(here, "src", "debug", "debugAdapter.ts")],
    outfile: path.join(here, "dist", "debugAdapter.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "info",
  },
  {
    entryPoints: [path.join(here, "src", "debug", "debugSession.ts")],
    outfile: path.join(here, "dist", "debugSession.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "info",
  },
  {
    entryPoints: [path.join(engine, "src", "cli.ts")],
    outfile: path.join(here, "dist", "engcode-cli.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    plugins: [assetPaths.plugin],
    logLevel: "info",
  },
  {
    entryPoints: [path.join(engine, "runtime", "web-runtime.ts")],
    outfile: path.join(here, "dist", "runtime", "web-runtime.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
    logLevel: "info",
  },
];

for (const options of builds) {
  await esbuild.build(options);
}

// `engcode playground` serves files from this folder next to the CLI.
fs.cpSync(path.join(engine, "playground"), path.join(here, "dist", "playground"), {
  recursive: true,
});
