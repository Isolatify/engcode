import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "README.md",
  ...fs.readdirSync("docs").filter((name) => name.endsWith(".md")).map((name) => path.join("docs", name)),
  ...fs.readdirSync("editor/vscode").filter((name) => name.endsWith(".md")).map((name) => path.join("editor/vscode", name)),
];

let broken = 0;
for (const relative of files) {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, "utf8");
  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split("#")[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      broken += 1;
      console.log(`${relative}: ${link}`);
    }
  }
}
console.log(broken === 0 ? "All local documentation links resolve." : `${broken} broken link(s).`);
process.exitCode = broken === 0 ? 0 : 1;
