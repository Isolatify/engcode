#!/usr/bin/env node
// Builds the release artifacts that install.ps1 and install.sh can use:
//   release/engcode-<version>.tgz       npm package
//   release/engcode-<version>/          portable folder with launchers
//   release/install.ps1, install.sh     local installers
//   release/SHA256SUMS.txt
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = packageJson.version;
const release = path.join(root, "release");
const portable = path.join(release, `engcode-${version}`);

console.log(`Packaging EngCode ${version}`);

run("npm run build");
fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(portable, { recursive: true });

run(`npm pack --pack-destination "${release}"`);

for (const folder of ["dist", "docs", "examples", "playground", "editor"]) {
  copy(path.join(root, folder), path.join(portable, folder));
}
for (const file of ["README.md", "LICENSE", "package.json"]) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(portable, file));
}

fs.writeFileSync(
  path.join(portable, "engcode.cmd"),
  ["@echo off", "node \"%~dp0dist\\src\\cli.js\" %*", ""].join("\r\n"),
  "utf8",
);
const shellLauncher = path.join(portable, "engcode");
fs.writeFileSync(
  shellLauncher,
  ["#!/usr/bin/env sh", 'exec node "$(dirname "$0")/dist/src/cli.js" "$@"', ""].join("\n"),
  "utf8",
);
if (process.platform !== "win32") fs.chmodSync(shellLauncher, 0o755);

for (const file of ["install.ps1", "install.sh"]) {
  fs.copyFileSync(path.join(root, "scripts", file), path.join(release, file));
}

const sums = [];
for (const file of walk(release)) {
  if (path.basename(file) === "SHA256SUMS.txt") continue;
  const relative = path.relative(release, file).replaceAll("\\", "/");
  sums.push(`${sha256(file)}  ${relative}`);
}
fs.writeFileSync(path.join(release, "SHA256SUMS.txt"), sums.join("\n") + "\n", "utf8");

console.log("");
console.log(`Release folder: ${release}`);
console.log(`Portable folder: ${portable}`);
console.log("Install from this folder with:");
console.log(`  ${process.platform === "win32" ? ".\\release\\install.ps1" : "sh release/install.sh"} -From ${path.relative(root, release)}`);
console.log("A Node-free binary is not produced yet; see docs/install.md.");

function run(command) {
  execSync(command, {
    cwd: root,
    stdio: "inherit",
  });
}

function copy(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (item) => !item.includes(`${path.sep}.engcode`) && !item.endsWith(".map"),
  });
}

function walk(folder) {
  const files = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const child = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...walk(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
