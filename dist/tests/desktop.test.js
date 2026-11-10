import test from "node:test";
import assert from "node:assert/strict";
import { desktopLauncher, desktopPackageJson, desktopReadme, electronMainSource, platformFolder, platformName, } from "../src/desktop/shell.js";
test("describes desktop platforms and folders", () => {
    assert.equal(platformName("windows"), "Windows");
    assert.equal(platformName("mac"), "macOS");
    assert.equal(platformName("linux"), "Linux");
    assert.equal(platformFolder("windows"), "windows");
    assert.equal(platformFolder("mac"), "mac");
});
test("generates a locked-down Electron main process", () => {
    const main = electronMainSource("Sam's Game");
    assert.match(main, /title: "Sam's Game"/);
    assert.match(main, /contextIsolation: true/);
    assert.match(main, /nodeIntegration: false/);
    assert.match(main, /sandbox: true/);
    assert.match(main, /webSecurity: true/);
    assert.match(main, /server\.listen\(0, "127\.0\.0\.1"/);
    assert.match(main, /setWindowOpenHandler/);
    assert.match(main, /shell\.openExternal/);
    assert.match(main, /content-range/);
    assert.equal(main.includes("file://"), false);
});
test("writes runnable package metadata for each platform", () => {
    const windows = JSON.parse(desktopPackageJson("Sam's Game", "windows"));
    assert.equal(windows.name, "sam-s-game");
    assert.equal(windows.productName, "Sam's Game");
    assert.equal(windows.main, "main.cjs");
    assert.match(windows.scripts.package, /--platform=win32/);
    assert.ok(windows.devDependencies.electron);
    assert.ok(windows.devDependencies["electron-packager"]);
    const mac = JSON.parse(desktopPackageJson("Sam's Game", "mac"));
    assert.match(mac.scripts.package, /--platform=darwin/);
});
test("explains how to run and package a desktop app", () => {
    const readme = desktopReadme("Notes", "mac");
    assert.match(readme, /npm install/);
    assert.match(readme, /npm start/);
    assert.match(readme, /npm run package/);
    assert.match(readme, /context isolation/);
    assert.match(readme, /notarization/);
    assert.match(desktopLauncher("windows"), /npx electron/);
    assert.match(desktopLauncher("windows"), /\r\n/);
    assert.match(desktopLauncher("mac"), /^#!\/bin\/sh/);
});
//# sourceMappingURL=desktop.test.js.map