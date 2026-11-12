/**
 * EngCode extension client.
 *
 * Starts the bundled language server, wires the four commands to the bundled
 * CLI (run/serve/explain in the integrated terminal, check over LSP), and
 * keeps server settings in sync. The heavy lifting lives in the server and
 * CLI bundles; this file only connects them to VS Code.
 */
import * as path from "node:path";
import { commands, debug, DebugAdapterExecutable, ExtensionContext, window, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

/** The bundled CLI, or a user-configured executable from settings. */
function executableCommand(context: ExtensionContext): string {
  const configured = workspace.getConfiguration("engcode").get<string>("executable")?.trim();
  if (configured) return configured;
  const cli = context.asAbsolutePath(path.join("dist", "engcode-cli.mjs"));
  return `node "${cli}"`;
}

function activeEngFile(): string | undefined {
  const editor = window.activeTextEditor;
  if (!editor || editor.document.languageId !== "engcode") {
    window.showInformationMessage("Open an .eng file first.");
    return undefined;
  }
  return editor.document.fileName;
}

function runInTerminal(context: ExtensionContext, args: string[]): void {
  const file = activeEngFile();
  if (!file) return;
  const quoted = `"${file.replace(/"/g, '\\"')}"`;
  const terminal = window.createTerminal("EngCode");
  terminal.show();
  terminal.sendText([executableCommand(context), ...args, quoted].join(" "));
}

export async function activate(context: ExtensionContext): Promise<void> {
  // Launch the DAP adapter with VS Code's own binary (Electron acts as Node
  // under ELECTRON_RUN_AS_NODE), so no `node` install is required.
  context.subscriptions.push(
    debug.registerDebugAdapterDescriptorFactory("engcode", {
      createDebugAdapterDescriptor: () =>
        new DebugAdapterExecutable(
          process.execPath,
          [context.asAbsolutePath(path.join("dist", "debugAdapter.js"))],
          { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
        ),
    }),
  );

  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const checkOnType = workspace.getConfiguration("engcode").get<boolean>("checkOnType") ?? true;

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "engcode" }],
    synchronize: {
      configurationSection: "engcode",
      fileEvents: workspace.createFileSystemWatcher("**/*.eng"),
    },
    initializationOptions: { checkOnType },
  };

  client = new LanguageClient(
    "engcode",
    "EngCode Language Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(
    commands.registerCommand("engcode.runFile", () => runInTerminal(context, ["run"])),
    commands.registerCommand("engcode.explain", () =>
      runInTerminal(context, ["run", "--explain"]),
    ),
    commands.registerCommand("engcode.serve", () => runInTerminal(context, ["serve"])),
    commands.registerCommand("engcode.check", async () => {
      const editor = window.activeTextEditor;
      if (!editor || editor.document.languageId !== "engcode") {
        window.showInformationMessage("Open an .eng file first.");
        return;
      }
      if (!client) return;
      try {
        const result = await client.sendRequest<{ count: number; errors: number; warnings: number }>(
          "engcode/check",
          { uri: editor.document.uri.toString() },
        );
        if (result.count === 0) {
          window.showInformationMessage("EngCode found no problems.");
        } else {
          const notes = [];
          if (result.errors > 0) notes.push(`${result.errors} error${result.errors === 1 ? "" : "s"}`);
          if (result.warnings > 0) {
            notes.push(`${result.warnings} warning${result.warnings === 1 ? "" : "s"}`);
          }
          window.showWarningMessage(`EngCode found ${notes.join(" and ")}.`);
        }
      } catch (error) {
        window.showErrorMessage(
          `EngCode could not check this file. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
