#!/usr/bin/env node
// Validates the npm tarball that `npm pack` would produce.
// Run with: npm run check:package
// Fails (exit 1) if required files are missing or forbidden files leak in.
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Files the installed package must contain to work.
const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/src/cli.js", // bin target
  "dist/src/interpreter.js",
  "dist/src/checker.js",
  "dist/src/web/compiler.js",
  "dist/runtime/web-runtime.js", // engcode build web
  "playground/index.html", // engcode playground
  "playground/app.js",
  "docs/getting-started.md",
  "examples/hello/main.eng",
];

// Anything matching these must NOT be in the tarball.
const FORBIDDEN = [
  /(^|\/)node_modules\//,
  /(^|\/)tests\//,
  /\.test\.js$/,
  /\.map$/,
  /\.vsix$/,
  /(^|\/)editor\//,
  /(^|\/)scripts\//,
  /(^|\/)release\//,
  /(^|\/)tsconfig.*\.json$/,
];

// Read the file list straight from npm pack --json (no tarball written).
const raw = execSync("npm pack --dry-run --json", {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  shell: process.platform === "win32",
});

let jsonStart = raw.indexOf("[");
if (jsonStart < 0) {
  console.error("check:package could not parse npm pack output.");
  process.exit(1);
}
const [info] = JSON.parse(raw.slice(jsonStart));
const files = info.files.map((entry) => entry.path.replace(/\\/g, "/"));

const missing = REQUIRED.filter((file) => !files.includes(file));
const leaked = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));

console.log(`check:package: ${files.length} files, ${Math.round(info.unpackedSize / 1024)} KB unpacked, ${Math.round(info.size / 1024)} KB packed`);

let failed = false;
if (missing.length > 0) {
  failed = true;
  console.error("Missing required files:");
  for (const file of missing) console.error(`  - ${file}`);
}
if (leaked.length > 0) {
  failed = true;
  console.error("Forbidden files included:");
  for (const file of leaked.slice(0, 30)) console.error(`  - ${file}`);
  if (leaked.length > 30) console.error(`  ... and ${leaked.length - 30} more`);
}

// The bin target must exist on disk with a node shebang and be executable text.
const binPath = path.join(root, "dist", "src", "cli.js");
if (!fs.existsSync(binPath)) {
  failed = true;
  console.error("bin target dist/src/cli.js does not exist on disk.");
} else {
  const head = fs.readFileSync(binPath, "utf8").slice(0, 64);
  if (!head.startsWith("#!/usr/bin/env node")) {
    failed = true;
    console.error("dist/src/cli.js is missing the '#!/usr/bin/env node' shebang.");
  }
}

if (failed) {
  console.error("check:package FAILED");
  process.exit(1);
}
console.log("check:package OK");
