import * as fs from "node:fs";
import * as path from "node:path";
import { Checker } from "./checker.js";
import { Diagnostic, ParseError, makeSource, spanFromToken, } from "./diagnostics.js";
import { Lexer } from "./lexer.js";
import { prescanNames } from "./names.js";
import { Parser } from "./parser.js";
/** Lexes, parses, and checks a source file. Never throws for user mistakes. */
export function analyze(filePath, text, options = {}) {
    const source = makeSource(filePath, text);
    let tokens;
    try {
        tokens = Lexer.lex(filePath, text);
    }
    catch (error) {
        if (error instanceof ParseError) {
            return { source, tokens: [], diagnostics: [error.diagnostic] };
        }
        throw error;
    }
    const entryPath = path.resolve(filePath);
    const root = path.resolve(options.root ?? path.dirname(entryPath));
    const modules = options.modules ?? true;
    const files = new Map();
    const diagnostics = [];
    files.set(entryPath, { path: entryPath, source, tokens, imports: scanImports(tokens) });
    if (modules) {
        loadImports(entryPath, root, files, diagnostics, [entryPath]);
        if (diagnostics.length > 0) {
            return { source, tokens, diagnostics, files: [...files.keys()] };
        }
    }
    // Parse every file with one shared name table so imported helpers can be
    // called with the same English syntax as local functions.
    const allTokens = [...(options.earlierTokens ?? [])];
    for (const file of files.values())
        allTokens.push(...file.tokens);
    const names = prescanNames(allTokens);
    const programs = new Map();
    for (const file of files.values()) {
        try {
            programs.set(file.path, Parser.parse(file.tokens, names, { allowApps: options.allowApps ?? true }));
        }
        catch (error) {
            if (error instanceof ParseError) {
                diagnostics.push(error.diagnostic);
            }
            else {
                throw error;
            }
        }
    }
    if (diagnostics.length > 0) {
        return { source, tokens, names, diagnostics, files: [...files.keys()] };
    }
    const merged = expandModules(entryPath, root, programs, diagnostics);
    if (diagnostics.length > 0) {
        return { source, tokens, names, diagnostics, files: [...files.keys()] };
    }
    const program = { kind: "program", body: merged };
    const earlierNames = options.earlierTokens ? prescanNames(options.earlierTokens) : undefined;
    const checked = Checker.check(program, names, earlierNames ? [...earlierNames.variables] : []);
    return {
        source,
        tokens,
        names,
        program,
        diagnostics: [...diagnostics, ...checked.diagnostics],
        files: [...files.keys()],
    };
}
/** App-only files are detected before parsing so `run` can give a clear next step. */
export function looksLikeApp(text) {
    return /^\s*app(?:\s|"|:)/im.test(text);
}
// --------------------------------------------------------------------- modules
function scanImports(tokens) {
    const imports = [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
        const token = tokens[i];
        if (token.kind !== "word" || token.lower !== "use")
            continue;
        const next = tokens[i + 1];
        if (next.kind !== "text")
            continue;
        imports.push({ target: String(next.value), token: next });
    }
    return imports;
}
function resolveImport(fromFile, target, _root) {
    return path.resolve(path.dirname(fromFile), target);
}
function isInside(root, file) {
    const relative = path.relative(root, file);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}
function loadImports(fromFile, root, files, diagnostics, stack) {
    const file = files.get(fromFile);
    if (!file)
        return;
    for (const imported of file.imports) {
        const target = resolveImport(fromFile, imported.target, root);
        if (!isInside(root, target)) {
            diagnostics.push(new Diagnostic(`The import "${imported.target}" is outside the project folder.`, spanFromToken(imported.token), 'Keep imported files inside the folder that holds your program.'));
            continue;
        }
        if (stack.includes(target)) {
            const chain = [...stack.slice(stack.indexOf(target)), target]
                .map((item) => path.basename(item))
                .join(" → ");
            diagnostics.push(new Diagnostic(`These files import each other in a loop: ${chain}.`, spanFromToken(imported.token), "Remove one of the imports so the chain has an end."));
            continue;
        }
        if (files.has(target))
            continue;
        let text;
        try {
            text = fs.readFileSync(target, "utf8");
        }
        catch {
            diagnostics.push(new Diagnostic(`I could not find the imported file "${imported.target}".`, spanFromToken(imported.token), 'Check the spelling and the folder, then try again.'));
            continue;
        }
        let tokens;
        try {
            tokens = Lexer.lex(target, text);
        }
        catch (error) {
            if (error instanceof ParseError) {
                diagnostics.push(error.diagnostic);
                continue;
            }
            throw error;
        }
        files.set(target, {
            path: target,
            source: makeSource(target, text),
            tokens,
            imports: scanImports(tokens),
        });
        loadImports(target, root, files, diagnostics, [...stack, target]);
    }
}
function expandModules(entryPath, root, programs, diagnostics) {
    const included = new Set();
    const namesSeen = new Map();
    const stack = [];
    const emit = (filePath, via) => {
        if (included.has(filePath))
            return [];
        included.add(filePath);
        stack.push(filePath);
        const program = programs.get(filePath);
        if (!program) {
            stack.pop();
            return [];
        }
        for (const [name, token] of declaredNames(program)) {
            const owner = namesSeen.get(name);
            if (owner !== undefined && owner !== filePath) {
                diagnostics.push(new Diagnostic(`The name "${name}" is defined in both "${path.basename(owner)}" and "${path.basename(filePath)}".`, spanFromToken(via ?? token), "Give one of them a different name so both files can be used together."));
            }
            else {
                namesSeen.set(name, filePath);
            }
        }
        const statements = [];
        for (const statement of program.body) {
            if (statement.kind !== "use" || !statement.isPath) {
                statements.push(statement);
                continue;
            }
            const target = resolveImport(filePath, statement.target, root);
            if (!isInside(root, target)) {
                diagnostics.push(new Diagnostic(`The import "${statement.target}" is outside the project folder.`, spanFromToken(statement.token), 'Keep imported files inside the folder that holds your program.'));
                continue;
            }
            if (stack.includes(target)) {
                const chain = [...stack.slice(stack.indexOf(target)), target]
                    .map((item) => path.basename(item))
                    .join(" → ");
                diagnostics.push(new Diagnostic(`These files import each other in a loop: ${chain}.`, spanFromToken(statement.token), "Remove one of the imports so the chain has an end."));
                continue;
            }
            statements.push(...emit(target, statement.token));
        }
        stack.pop();
        return statements;
    };
    return emit(entryPath);
}
function declaredNames(program) {
    const names = new Map();
    const add = (name, token) => {
        if (!names.has(name))
            names.set(name, token);
    };
    for (const statement of program.body) {
        switch (statement.kind) {
            case "define":
            case "kind":
                add(statement.name, statement.token);
                break;
            case "set":
                if (statement.target.kind === "variable")
                    add(statement.target.name, statement.token);
                break;
            case "state":
            case "ask":
            case "read-file":
            case "list-files":
            case "load-device":
            case "get-data":
            case "send-data":
                add(statement.name, statement.token);
                break;
        }
    }
    return names;
}
//# sourceMappingURL=program.js.map