export type DesktopPlatform = "windows" | "mac" | "linux";

export function platformName(platform: DesktopPlatform): string {
  switch (platform) {
    case "windows":
      return "Windows";
    case "mac":
      return "macOS";
    default:
      return "Linux";
  }
}

export function platformFolder(platform: DesktopPlatform): string {
  return platform === "mac" ? "mac" : platform;
}

export function electronPackagerPlatform(platform: DesktopPlatform): string {
  return platform === "windows" ? "win32" : platform === "mac" ? "darwin" : "linux";
}

/**
 * The Electron main process. It serves the generated site over a loopback HTTP
 * server because browsers block ES modules loaded directly from file://.
 */
export function electronMainSource(name: string): string {
  return `const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");

const root = path.join(__dirname, "app");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const address = new URL(request.url || "/", "http://127.0.0.1");
      const requested = decodeURIComponent(address.pathname);
      const relative = requested === "/" ? "index.html" : requested.replace(/^\\/+/, "");
      const target = path.normalize(path.join(root, relative));
      if (target !== root && !target.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      fs.readFile(target, (error, data) => {
        if (error) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        const headers = {
          "content-type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
          "accept-ranges": "bytes",
        };
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
          if (match) {
            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Number(match[2]) : data.length - 1;
            if (start <= end && start < data.length) {
              response.writeHead(206, {
                ...headers,
                "content-range": "bytes " + start + "-" + end + "/" + data.length,
                "content-length": end - start + 1,
              });
              response.end(data.subarray(start, end + 1));
              return;
            }
          }
        }
        response.writeHead(200, { ...headers, "content-length": data.length });
        response.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function openWindow(port) {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: "#ffffff",
    title: ${JSON.stringify(name)},
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const origin = "http://127.0.0.1:" + port;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\\/\\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https:\\/\\//i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.loadURL(origin + "/");
}

let running = null;

app.whenReady().then(async () => {
  running = await serve();
  openWindow(running.port);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(running.port);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (running && running.server) running.server.close();
});
`;
}

export function desktopPackageJson(name: string, platform: DesktopPlatform): string {
  return (
    JSON.stringify(
      {
        name: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "engcode-app",
        productName: name,
        version: "1.0.0",
        private: true,
        description: `${name} — made with EngCode`,
        main: "main.cjs",
        scripts: {
          start: "electron .",
          package: `electron-packager . --platform=${electronPackagerPlatform(
            platform,
          )} --arch=x64 --out=release`,
        },
        devDependencies: {
          electron: "^33.0.0",
          "electron-packager": "^17.1.2",
        },
        engines: { node: ">=20" },
      },
      null,
      2,
    ) + "\n"
  );
}

export function desktopReadme(name: string, platform: DesktopPlatform): string {
  const label = platformName(platform);
  const releaseNote =
    platform === "mac"
      ? "Run this on a Mac to make a macOS release. Code signing and notarization are separate steps."
      : platform === "windows"
        ? "Run this on Windows to make a Windows release. Code signing is a separate step."
        : "Run this on Linux to make a Linux release.";
  return [
    `# ${name}`,
    "",
    "This desktop project was generated by EngCode.",
    "",
    "## Run it",
    "",
    "```text",
    "npm install",
    "npm start",
    "```",
    "",
    `You need Node.js 20 or newer and Internet access the first time so npm can download Electron.`,
    "",
    "## Make a release folder",
    "",
    "```text",
    "npm run package",
    "```",
    "",
    `The runnable ${label} app appears in \`release/\`.`,
    releaseNote,
    "",
    "## How it works",
    "",
    "`main.cjs` starts a private web server on 127.0.0.1 and opens it in an",
    "Electron window. The window uses context isolation, no Node.js integration,",
    "and a sandbox. External HTTPS links open in the normal browser.",
    "",
    "The website itself is in `app/`. Edit the original `.eng` file and run",
    "`engcode build " + platformFolder(platform) + "` again to refresh it.",
    "",
  ].join("\n");
}

export function desktopLauncher(platform: DesktopPlatform): string {
  if (platform === "windows") {
    return [
      "@echo off",
      "if not exist node_modules\\electron (",
      "  echo Installing Electron once...",
      "  call npm install",
      ")",
      "call npx electron .",
      "",
    ].join("\r\n");
  }
  return [
    "#!/bin/sh",
    "set -e",
    'cd "$(dirname "$0")"',
    "if [ ! -d node_modules/electron ]; then",
    "  echo 'Installing Electron once...'",
    "  npm install",
    "fi",
    "npx electron .",
    "",
  ].join("\n");
}
