import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { Diagnostic, RuntimeError, spanFromToken } from "./diagnostics.js";
import { BoundMethodValue, BuiltinValue, Env, FunctionValue, KindValue, ListValue, ObjectValue, TableValue, deepEqual, display, formatNumber, fromPlain, isFunction, toPlain, typeName, } from "./values.js";
export class EmptyInput {
    readLine(prompt) {
        throw new Error(`The program asked "${prompt}" but no input was available.`);
    }
}
class StopSignal {
    kind = "stop";
}
class SkipSignal {
    kind = "skip";
}
class ReturnSignal {
    value;
    kind = "return";
    constructor(value) {
        this.value = value;
    }
}
export class Interpreter {
    globals = new Env(null);
    write;
    input;
    random;
    maxSteps;
    fileRoot;
    allowNetwork;
    storagePath;
    steps = 0;
    constructor(options = {}) {
        this.write = options.write ?? ((text) => process.stdout.write(text));
        this.input = options.input ?? new EmptyInput();
        this.random = options.random ?? Math.random;
        this.maxSteps = options.maxSteps ?? 0;
        this.fileRoot = path.resolve(options.fileRoot ?? process.cwd());
        this.allowNetwork = options.allowNetwork ?? false;
        this.storagePath = path.resolve(options.storagePath ?? path.join(this.fileRoot, ".engcode", "storage.json"));
    }
    /** Clears all names so a REPL can start over. */
    reset() {
        this.globals.clear();
        this.steps = 0;
    }
    run(program) {
        this.execStatements(program.body, this.globals);
    }
    // ---------------------------------------------------------------- statements
    execStatements(statements, env) {
        this.hoistFunctions(statements, env);
        for (const statement of statements)
            this.execStatement(statement, env);
    }
    hoistFunctions(statements, env) {
        for (const statement of statements) {
            if (statement.kind === "define") {
                const fn = new FunctionValue(statement.name, statement.params, statement.body, env);
                env.define(statement.name, fn);
            }
            else if (statement.kind === "kind") {
                const methods = new Map();
                for (const method of statement.methods) {
                    methods.set(method.name, new FunctionValue(method.name, method.params, method.body, env));
                }
                env.define(statement.name, new KindValue(statement.name, statement.fields.map((field) => field.name), methods));
            }
        }
    }
    execStatement(statement, env) {
        this.steps += 1;
        if (this.maxSteps > 0 && this.steps > this.maxSteps) {
            this.fail("This program has been running for a very long time. I stopped it so you are not stuck.", statement.token, "Check the loop condition, or press Ctrl+C to stop.");
        }
        switch (statement.kind) {
            case "say": {
                const value = this.evaluate(statement.value, env);
                this.write(display(value) + "\n");
                return;
            }
            case "ask": {
                const prompt = display(this.evaluate(statement.prompt, env));
                let answer = this.input.readLine(prompt);
                if (statement.number) {
                    let parsed = parseNumberText(answer);
                    while (parsed === null) {
                        this.write("Please type a number.\n");
                        answer = this.input.readLine(prompt);
                        parsed = parseNumberText(answer);
                    }
                    this.setVariable(env, statement.name, parsed, "set", statement.token);
                }
                else {
                    this.setVariable(env, statement.name, answer.trim(), "set", statement.token);
                }
                return;
            }
            case "set": {
                const value = this.evaluate(statement.value, env);
                this.assignTarget(statement.target, value, env, "set", statement.token);
                return;
            }
            case "change": {
                const value = this.evaluate(statement.value, env);
                this.assignTarget(statement.target, value, env, "change", statement.token);
                return;
            }
            case "add": {
                const amount = this.evaluate(statement.value, env);
                const current = this.readTarget(statement.target, env, statement.token);
                if (typeof current === "number") {
                    if (typeof amount !== "number") {
                        this.fail(`I can only add a number to a number, but this is ${typeName(amount)}.`, statement.value.token);
                    }
                    this.assignTarget(statement.target, current + amount, env, "change", statement.token);
                }
                else if (typeof current === "string") {
                    this.assignTarget(statement.target, current + display(amount), env, "change", statement.token);
                }
                else if (current instanceof ListValue) {
                    current.items.push(amount);
                }
                else {
                    this.fail(`I can add to a number, text, or a list, but this is ${typeName(current)}.`, statement.token);
                }
                return;
            }
            case "remove": {
                const value = this.evaluate(statement.value, env);
                const current = this.readTarget(statement.target, env, statement.token);
                if (current instanceof ListValue) {
                    const index = current.items.findIndex((item) => deepEqual(item, value));
                    if (index >= 0)
                        current.items.splice(index, 1);
                }
                else if (current instanceof TableValue) {
                    if (typeof value !== "string") {
                        this.fail("To remove a table entry, the key must be text.", statement.value.token);
                    }
                    current.entries.delete(value);
                }
                else {
                    this.fail(`I can remove from a list or a table, but this is ${typeName(current)}.`, statement.token);
                }
                return;
            }
            case "if": {
                for (const branch of statement.branches) {
                    const condition = this.evaluate(branch.condition, env);
                    if (this.conditionValue(condition, branch.condition.token)) {
                        this.runBlock(branch.body, env);
                        return;
                    }
                }
                if (statement.otherwise)
                    this.runBlock(statement.otherwise, env);
                return;
            }
            case "repeat": {
                const count = this.evaluate(statement.count, env);
                if (typeof count !== "number") {
                    this.fail(`"repeat ... times" needs a number, but this is ${typeName(count)}.`, statement.count.token);
                }
                if (!Number.isInteger(count) || count < 0) {
                    this.fail("The repeat count must be a whole number, 0 or more.", statement.count.token);
                }
                for (let i = 0; i < count; i += 1) {
                    try {
                        this.runBlock(statement.body, env);
                    }
                    catch (signal) {
                        if (signal instanceof SkipSignal)
                            continue;
                        if (signal instanceof StopSignal)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "for-each": {
                const iterable = this.evaluate(statement.iterable, env);
                let items;
                if (iterable instanceof ListValue)
                    items = iterable.items.slice();
                else if (typeof iterable === "string")
                    items = Array.from(iterable);
                else {
                    this.fail(`I can only repeat over a list or text, but this is ${typeName(iterable)}.`, statement.iterable.token);
                }
                for (const item of items) {
                    const iteration = new Env(env);
                    iteration.define(statement.name, item);
                    try {
                        this.execStatements(statement.body, iteration);
                    }
                    catch (signal) {
                        if (signal instanceof SkipSignal)
                            continue;
                        if (signal instanceof StopSignal)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "count": {
                const start = this.evaluate(statement.start, env);
                const end = this.evaluate(statement.end, env);
                if (typeof start !== "number" || typeof end !== "number") {
                    this.fail('"count from ... to ..." needs two numbers.', statement.token);
                }
                for (let i = start; i <= end; i += 1) {
                    const iteration = new Env(env);
                    iteration.define(statement.name, i);
                    try {
                        this.execStatements(statement.body, iteration);
                    }
                    catch (signal) {
                        if (signal instanceof SkipSignal)
                            continue;
                        if (signal instanceof StopSignal)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "while": {
                while (this.conditionValue(this.evaluate(statement.condition, env), statement.condition.token)) {
                    try {
                        this.runBlock(statement.body, env);
                    }
                    catch (signal) {
                        if (signal instanceof SkipSignal)
                            continue;
                        if (signal instanceof StopSignal)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "stop":
                throw new StopSignal();
            case "skip":
                throw new SkipSignal();
            case "define": {
                // Handled by hoisting. Defining again here keeps the block environment current.
                if (!env.lookup(statement.name).found) {
                    env.define(statement.name, new FunctionValue(statement.name, statement.params, statement.body, env));
                }
                return;
            }
            case "kind": {
                // Handled by hoisting. This keeps kinds defined inside blocks available.
                if (!env.lookup(statement.name).found) {
                    const methods = new Map();
                    for (const method of statement.methods) {
                        methods.set(method.name, new FunctionValue(method.name, method.params, method.body, env));
                    }
                    env.define(statement.name, new KindValue(statement.name, statement.fields.map((field) => field.name), methods));
                }
                return;
            }
            case "give-back": {
                const value = statement.value ? this.evaluate(statement.value, env) : null;
                throw new ReturnSignal(value);
            }
            case "try": {
                try {
                    this.runBlock(statement.body, env);
                }
                catch (error) {
                    if (!(error instanceof RuntimeError))
                        throw error;
                    const handlerEnv = new Env(env);
                    handlerEnv.define("__error__", error.diagnostic.message);
                    this.execStatements(statement.handler, handlerEnv);
                }
                return;
            }
            case "use":
                return;
            case "state":
                this.setVariable(env, statement.name, this.evaluate(statement.value, env), "set", statement.token);
                return;
            case "call-stmt": {
                const fn = env.get(statement.name);
                if (fn === undefined) {
                    this.fail(`I don't know a function called "${statement.name}".`, statement.token);
                }
                const args = statement.args.map((arg) => this.evaluate(arg, env));
                this.callValue(fn, args, statement.token);
                return;
            }
            case "call-value-stmt": {
                const fn = this.evaluate(statement.callee, env);
                const args = statement.args.map((arg) => this.evaluate(arg, env));
                this.callValue(fn, args, statement.token);
                return;
            }
            case "method-stmt": {
                const found = env.lookup(statement.object);
                if (!found.found) {
                    this.fail(`I don't know the name "${statement.object}".`, statement.token);
                }
                const object = found.value;
                if (!(object instanceof ObjectValue)) {
                    this.fail(`"${statement.object}" is not an object.`, statement.token);
                }
                const method = object.kindDef?.methods.get(statement.method) ??
                    (isFunction(object.fields.get(statement.method))
                        ? object.fields.get(statement.method)
                        : undefined);
                if (!method) {
                    this.fail(`"${statement.object}" does not have a method called "${statement.method}".`, statement.token);
                }
                const args = statement.args.map((arg) => this.evaluate(arg, env));
                this.callValue(new BoundMethodValue(object, method), args, statement.token);
                return;
            }
            case "sort": {
                const value = this.evaluate(statement.value, env);
                if (!(value instanceof ListValue)) {
                    this.fail(`"sort" needs a list, but this is ${typeName(value)}.`, statement.token);
                }
                this.sortList(value, statement.descending, statement.token);
                return;
            }
            case "reverse": {
                const value = this.evaluate(statement.value, env);
                if (value instanceof ListValue) {
                    value.items.reverse();
                    return;
                }
                if (typeof value === "string") {
                    this.assignTarget(statement.value, Array.from(value).reverse().join(""), env, "change", statement.token);
                    return;
                }
                this.fail(`"reverse" needs a list or text, but this is ${typeName(value)}.`, statement.token);
            }
            case "shuffle": {
                const value = this.evaluate(statement.value, env);
                if (!(value instanceof ListValue)) {
                    this.fail(`"shuffle" needs a list, but this is ${typeName(value)}.`, statement.token);
                }
                for (let i = value.items.length - 1; i > 0; i -= 1) {
                    const j = Math.floor(this.random() * (i + 1));
                    [value.items[i], value.items[j]] = [value.items[j], value.items[i]];
                }
                return;
            }
            case "read-file": {
                const file = this.resolveInside(display(this.evaluate(statement.path, env)), statement.path.token);
                let text;
                try {
                    text = fs.readFileSync(file, "utf8");
                }
                catch {
                    this.fail(`I could not read the file "${this.showPath(file)}".`, statement.token);
                }
                this.setVariable(env, statement.name, text, "set", statement.token);
                return;
            }
            case "write-file": {
                const file = this.resolveInside(display(this.evaluate(statement.path, env)), statement.path.token);
                const value = this.evaluate(statement.value, env);
                try {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    if (statement.append)
                        fs.appendFileSync(file, display(value) + "\n", "utf8");
                    else
                        fs.writeFileSync(file, display(value) + "\n", "utf8");
                }
                catch {
                    this.fail(`I could not write the file "${this.showPath(file)}".`, statement.token);
                }
                return;
            }
            case "delete-file": {
                const file = this.resolveInside(display(this.evaluate(statement.path, env)), statement.path.token);
                try {
                    fs.rmSync(file, { force: true });
                }
                catch {
                    this.fail(`I could not delete the file "${this.showPath(file)}".`, statement.token);
                }
                return;
            }
            case "list-files": {
                const folder = this.resolveInside(display(this.evaluate(statement.path, env)), statement.path.token);
                let names;
                try {
                    names = fs.readdirSync(folder);
                }
                catch {
                    this.fail(`I could not open the folder "${this.showPath(folder)}".`, statement.token);
                }
                this.setVariable(env, statement.name, new ListValue(names), "set", statement.token);
                return;
            }
            case "wait": {
                const seconds = this.evaluate(statement.seconds, env);
                if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
                    this.fail('"wait ... seconds" needs a number, 0 or more.', statement.seconds.token);
                }
                const milliseconds = Math.round(seconds * 1000);
                if (milliseconds > 0) {
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
                }
                return;
            }
            case "save-device": {
                const key = display(this.evaluate(statement.key, env));
                const value = this.evaluate(statement.value, env);
                const storage = this.readStorage();
                storage[key] = toPlain(value);
                this.writeStorage(storage, statement.token);
                return;
            }
            case "load-device": {
                const key = display(this.evaluate(statement.key, env));
                const storage = this.readStorage();
                this.setVariable(env, statement.name, fromPlain(storage[key]), "set", statement.token);
                return;
            }
            case "delete-device": {
                const key = display(this.evaluate(statement.key, env));
                const storage = this.readStorage();
                delete storage[key];
                this.writeStorage(storage, statement.token);
                return;
            }
            case "get-data": {
                const url = display(this.evaluate(statement.url, env));
                const reply = this.request("GET", url, undefined, statement.token);
                this.setVariable(env, statement.name, reply, "set", statement.token);
                return;
            }
            case "send-data": {
                const url = display(this.evaluate(statement.url, env));
                const value = this.evaluate(statement.value, env);
                const reply = this.request("POST", url, value, statement.token);
                this.setVariable(env, statement.name, reply, "set", statement.token);
                return;
            }
        }
    }
    // ------------------------------------------------------------------ targets
    assignTarget(target, value, env, mode, token) {
        if (target.kind === "variable") {
            this.setVariable(env, target.name, value, mode, token);
            return;
        }
        if (target.kind === "property") {
            const base = this.evaluate(target.base, env);
            if (base instanceof TableValue) {
                base.entries.set(target.key, value);
                return;
            }
            if (base instanceof ObjectValue) {
                const known = base.fields.has(target.key) || (base.kindDef?.fields.includes(target.key) ?? false);
                if (!known) {
                    this.fail(`This ${base.kindName} does not have a field called "${target.key}".`, token);
                }
                base.fields.set(target.key, value);
                return;
            }
            this.fail(`I can only set a property on a table or object, but this is ${typeName(base)}.`, token);
        }
        this.fail("I can only give a name or a property a value.", token);
    }
    setVariable(env, name, value, mode, token) {
        if (mode === "change") {
            if (!env.assign(name, value)) {
                this.fail(`I don't know the name "${name}". Use "set" to create it first.`, token);
            }
            return;
        }
        if (!env.assign(name, value))
            env.define(name, value);
    }
    readTarget(target, env, token) {
        if (target.kind === "variable") {
            const found = env.lookup(target.name);
            if (!found.found) {
                this.fail(`I don't know the name "${target.name}".`, token);
            }
            return found.value;
        }
        if (target.kind === "property") {
            const base = this.evaluate(target.base, env);
            if (base instanceof TableValue)
                return base.entries.get(target.key) ?? null;
            if (base instanceof ObjectValue) {
                if (!base.fields.has(target.key)) {
                    this.fail(`This ${base.kindName} does not have a field called "${target.key}".`, token);
                }
                return base.fields.get(target.key);
            }
            this.fail(`I can only read a property from a table or object, but this is ${typeName(base)}.`, token);
        }
        return this.evaluate(target, env);
    }
    // -------------------------------------------------------------- expressions
    evaluate(expression, env) {
        switch (expression.kind) {
            case "number":
                return expression.value;
            case "text":
                return expression.value;
            case "boolean":
                return expression.value;
            case "nothing":
                return null;
            case "variable": {
                const found = env.lookup(expression.name);
                if (!found.found) {
                    this.fail(`I don't know the name "${expression.name}".`, expression.token);
                }
                return found.value;
            }
            case "property": {
                const base = this.evaluate(expression.base, env);
                if (base instanceof TableValue)
                    return base.entries.get(expression.key) ?? null;
                if (base instanceof ObjectValue) {
                    if (base.fields.has(expression.key)) {
                        return base.fields.get(expression.key);
                    }
                    const method = base.kindDef?.methods.get(expression.key);
                    if (method)
                        return new BoundMethodValue(base, method);
                    this.fail(`This ${base.kindName} does not have a field called "${expression.key}".`, expression.token);
                }
                this.fail(`I can only read a property from a table or object, but this is ${typeName(base)}.`, expression.token);
            }
            case "unary": {
                const value = this.evaluate(expression.operand, env);
                if (expression.operator === "minus") {
                    if (typeof value !== "number") {
                        this.fail(`I can only put minus in front of a number, but this is ${typeName(value)}.`, expression.token);
                    }
                    return -value;
                }
                return !this.conditionValue(value, expression.operand.token);
            }
            case "binary":
                return this.evaluateBinary(expression, env);
            case "comparison":
                return this.evaluateComparison(expression, env);
            case "call": {
                const fn = env.get(expression.name);
                if (fn === undefined) {
                    this.fail(`I don't know a function called "${expression.name}".`, expression.token);
                }
                const args = expression.args.map((arg) => this.evaluate(arg, env));
                return this.callValue(fn, args, expression.token);
            }
            case "call-value": {
                const fn = this.evaluate(expression.callee, env);
                const args = expression.args.map((arg) => this.evaluate(arg, env));
                return this.callValue(fn, args, expression.token);
            }
            case "function-ref": {
                const fn = env.get(expression.name);
                if (fn === undefined) {
                    this.fail(`I don't know a function called "${expression.name}".`, expression.token);
                }
                return fn;
            }
            case "error-ref": {
                const found = env.lookup("__error__");
                if (!found.found) {
                    this.fail('"the error" only works inside "if it fails".', expression.token);
                }
                return found.value;
            }
            case "builtin":
                return this.evaluateBuiltin(expression, env);
            case "list":
                return new ListValue(expression.items.map((item) => this.evaluate(item, env)));
            case "table": {
                const table = new TableValue();
                for (const entry of expression.entries) {
                    table.entries.set(entry.key, this.evaluate(entry.value, env));
                }
                return table;
            }
            case "function": {
                if (expression.expressionBody) {
                    const body = [
                        {
                            kind: "give-back",
                            value: expression.expressionBody,
                            token: expression.token,
                        },
                    ];
                    return new FunctionValue("", expression.params, body, env);
                }
                return new FunctionValue("", expression.params, expression.body, env);
            }
            case "new": {
                const kind = env.get(expression.kindName);
                if (!(kind instanceof KindValue)) {
                    this.fail(`I don't know a kind called "${expression.kindName}".`, expression.token);
                }
                const fields = new Map();
                for (const entry of expression.entries) {
                    if (!kind.fields.includes(entry.key)) {
                        this.fail(`A ${kind.name} does not have a field called "${entry.key}".`, entry.token);
                    }
                    fields.set(entry.key, this.evaluate(entry.value, env));
                }
                const missing = kind.fields.filter((field) => !fields.has(field));
                if (missing.length > 0) {
                    this.fail(`A ${kind.name} needs ${missing.length === 1 ? "a value" : "values"} for ${missing.map((field) => `"${field}"`).join(", ")}.`, expression.token);
                }
                return new ObjectValue(kind.name, fields, kind);
            }
        }
    }
    evaluateBinary(expression, env) {
        const left = this.evaluate(expression.left, env);
        if (expression.operator === "and") {
            if (!this.conditionValue(left, expression.left.token))
                return false;
            const right = this.evaluate(expression.right, env);
            return this.conditionValue(right, expression.right.token);
        }
        if (expression.operator === "or") {
            if (this.conditionValue(left, expression.left.token))
                return true;
            const right = this.evaluate(expression.right, env);
            return this.conditionValue(right, expression.right.token);
        }
        const right = this.evaluate(expression.right, env);
        if (expression.operator === "plus") {
            if (typeof left === "string" || typeof right === "string") {
                return display(left) + display(right);
            }
            if (typeof left === "number" && typeof right === "number")
                return left + right;
            this.fail(`I can't join ${typeName(left)} and ${typeName(right)} with "plus".`, expression.token, 'Use text in quotes, or "text of" to turn a value into text.');
        }
        if (typeof left !== "number" || typeof right !== "number") {
            this.fail(`"${expression.operator}" needs numbers on both sides.`, expression.token);
        }
        switch (expression.operator) {
            case "minus":
                return left - right;
            case "times":
                return left * right;
            case "divided by":
                if (right === 0) {
                    this.fail("You can't divide by zero.", expression.token, "Check the value you are dividing by.");
                }
                return left / right;
            case "remainder":
                if (right === 0) {
                    this.fail("You can't take the remainder with zero.", expression.token);
                }
                return left % right;
            default:
                this.fail("I don't know that operation.", expression.token);
        }
    }
    evaluateComparison(expression, env) {
        const left = this.evaluate(expression.left, env);
        switch (expression.operator) {
            case "is":
                return deepEqual(left, this.evaluate(expression.right[0], env));
            case "is not":
                return !deepEqual(left, this.evaluate(expression.right[0], env));
            case "is empty": {
                if (left === null)
                    return true;
                if (typeof left === "string")
                    return left.length === 0;
                if (left instanceof ListValue)
                    return left.items.length === 0;
                if (left instanceof TableValue)
                    return left.entries.size === 0;
                this.fail(`"is empty" needs text, a list, a table, or nothing.`, expression.token);
            }
            case "is not empty": {
                if (left === null)
                    return false;
                if (typeof left === "string")
                    return left.length > 0;
                if (left instanceof ListValue)
                    return left.items.length > 0;
                if (left instanceof TableValue)
                    return left.entries.size > 0;
                this.fail(`"is not empty" needs text, a list, a table, or nothing.`, expression.token);
            }
            case "contains": {
                const right = this.evaluate(expression.right[0], env);
                if (typeof left === "string") {
                    if (typeof right !== "string")
                        this.fail('Text can only contain text.', expression.token);
                    return left.includes(right);
                }
                if (left instanceof ListValue)
                    return left.items.some((item) => deepEqual(item, right));
                if (left instanceof TableValue) {
                    if (typeof right !== "string")
                        this.fail("A table can only contain text keys.", expression.token);
                    return left.entries.has(right);
                }
                this.fail(`"contains" needs text, a list, or a table.`, expression.token);
            }
            case "starts with": {
                const [leftText, rightText] = this.checkTextPair(left, this.evaluate(expression.right[0], env), expression.token);
                return leftText.startsWith(rightText);
            }
            case "ends with": {
                const [leftText, rightText] = this.checkTextPair(left, this.evaluate(expression.right[0], env), expression.token);
                return leftText.endsWith(rightText);
            }
            case "between": {
                const low = this.evaluate(expression.right[0], env);
                const high = this.evaluate(expression.right[1], env);
                return (this.compareOrdered(left, low, expression.token) >= 0 &&
                    this.compareOrdered(left, high, expression.token) <= 0);
            }
            case "greater than":
                return this.compareOrdered(left, this.evaluate(expression.right[0], env), expression.token) > 0;
            case "less than":
                return this.compareOrdered(left, this.evaluate(expression.right[0], env), expression.token) < 0;
            case "at least":
                return this.compareOrdered(left, this.evaluate(expression.right[0], env), expression.token) >= 0;
            case "at most":
                return this.compareOrdered(left, this.evaluate(expression.right[0], env), expression.token) <= 0;
        }
    }
    checkTextPair(left, right, token) {
        if (typeof left !== "string" || typeof right !== "string") {
            this.fail("This comparison needs text on both sides.", token);
        }
        return [left, right];
    }
    compareOrdered(left, right, token) {
        if (typeof left === "number" && typeof right === "number") {
            return left === right ? 0 : left < right ? -1 : 1;
        }
        if (typeof left === "string" && typeof right === "string") {
            return left === right ? 0 : left < right ? -1 : 1;
        }
        this.fail(`I can't put ${typeName(left)} and ${typeName(right)} in order.`, token, "Compare two numbers or two pieces of text.");
    }
    // ----------------------------------------------------------------- builtins
    evaluateBuiltin(expression, env) {
        const args = expression.args.map((arg) => this.evaluate(arg, env));
        const token = expression.token;
        switch (expression.name) {
            case "uppercase":
                return this.textArg(args[0], token).toUpperCase();
            case "lowercase":
                return this.textArg(args[0], token).toLowerCase();
            case "trim":
                return this.textArg(args[0], token).trim();
            case "length": {
                const value = args[0];
                if (typeof value === "string")
                    return Array.from(value).length;
                if (value instanceof ListValue)
                    return value.items.length;
                if (value instanceof TableValue)
                    return value.entries.size;
                this.fail(`"length of" needs text, a list, or a table, but this is ${typeName(value)}.`, token);
            }
            case "round":
                return Math.round(this.numberArg(args[0], token));
            case "floor":
                return Math.floor(this.numberArg(args[0], token));
            case "ceiling":
                return Math.ceil(this.numberArg(args[0], token));
            case "absolute value":
                return Math.abs(this.numberArg(args[0], token));
            case "square root": {
                const value = this.numberArg(args[0], token);
                if (value < 0)
                    this.fail("I can't take the square root of a negative number.", token);
                return Math.sqrt(value);
            }
            case "sine":
                return Math.sin(this.numberArg(args[0], token));
            case "cosine":
                return Math.cos(this.numberArg(args[0], token));
            case "tangent":
                return Math.tan(this.numberArg(args[0], token));
            case "number from": {
                const text = this.textArg(args[0], token);
                const parsed = parseNumberText(text);
                if (parsed === null) {
                    this.fail(`I can't read "${text}" as a number.`, token);
                }
                return parsed;
            }
            case "text":
                return display(args[0]);
            case "JSON of":
                return JSON.stringify(toPlain(args[0]));
            case "data from JSON": {
                const text = this.textArg(args[0], token);
                try {
                    return fromPlain(JSON.parse(text));
                }
                catch {
                    this.fail("That text is not valid JSON.", token, 'JSON looks like {"name": "Sam"}.');
                }
                break;
            }
            case "random number": {
                const from = this.numberArg(args[0], token);
                const to = this.numberArg(args[1], token);
                if (!Number.isInteger(from) || !Number.isInteger(to)) {
                    this.fail('"random number from ... to ..." needs whole numbers.', token);
                }
                const low = Math.min(from, to);
                const high = Math.max(from, to);
                return low + Math.floor(this.random() * (high - low + 1));
            }
            case "random decimal":
                return this.random();
            case "random item": {
                const list = this.listArg(args[0], token);
                if (list.items.length === 0) {
                    this.fail("I can't pick a random item from an empty list.", token);
                }
                return list.items[Math.floor(this.random() * list.items.length)];
            }
            case "item": {
                const index = this.numberArg(args[0], token);
                const collection = args[1];
                if (!Number.isInteger(index)) {
                    this.fail('"item ... of ..." needs a whole-number position.', token);
                }
                if (collection instanceof ListValue) {
                    return index >= 1 && index <= collection.items.length ? collection.items[index - 1] : null;
                }
                if (typeof collection === "string") {
                    const characters = Array.from(collection);
                    return index >= 1 && index <= characters.length ? characters[index - 1] : null;
                }
                this.fail(`"item ... of ..." needs a list or text, but this is ${typeName(collection)}.`, token);
            }
            case "last item": {
                const collection = args[0];
                if (collection instanceof ListValue) {
                    return collection.items.length > 0 ? collection.items[collection.items.length - 1] : null;
                }
                if (typeof collection === "string") {
                    const characters = Array.from(collection);
                    return characters.length > 0 ? characters[characters.length - 1] : null;
                }
                this.fail(`"last item of" needs a list or text, but this is ${typeName(collection)}.`, token);
            }
            case "minimum":
                return Math.min(this.numberArg(args[0], token), this.numberArg(args[1], token));
            case "maximum":
                return Math.max(this.numberArg(args[0], token), this.numberArg(args[1], token));
            case "power":
                return Math.pow(this.numberArg(args[0], token), this.numberArg(args[1], token));
            case "split": {
                const text = this.textArg(args[0], token);
                const separator = this.textArg(args[1], token);
                return new ListValue((separator === "" ? Array.from(text) : text.split(separator)));
            }
            case "join": {
                const list = this.listArg(args[0], token);
                const separator = this.textArg(args[1], token);
                return list.items.map((item) => display(item)).join(separator);
            }
            case "replace": {
                const find = this.textArg(args[0], token);
                const replacement = this.textArg(args[1], token);
                const text = this.textArg(args[2], token);
                return find === "" ? text : text.split(find).join(replacement);
            }
            case "position": {
                const find = this.textArg(args[0], token);
                const text = this.textArg(args[1], token);
                const index = text.indexOf(find);
                return index < 0 ? 0 : Array.from(text.slice(0, index)).length + 1;
            }
            case "value of":
                this.fail('"value of" only works inside an app.', token, "Terminal scripts can use ask to read input.");
                break;
            case "key pressed":
                return false;
            case "now": {
                const now = new Date();
                const table = new TableValue();
                table.entries.set("year", now.getFullYear());
                table.entries.set("month", now.getMonth() + 1);
                table.entries.set("day", now.getDate());
                table.entries.set("hour", now.getHours());
                table.entries.set("minute", now.getMinutes());
                table.entries.set("second", now.getSeconds());
                return table;
            }
            case "today": {
                const now = new Date();
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const day = String(now.getDate()).padStart(2, "0");
                return `${now.getFullYear()}-${month}-${day}`;
            }
            case "pi":
                return Math.PI;
            case "e":
                return Math.E;
            case "file exists": {
                const file = this.resolveInside(display(args[0]), token);
                return fs.existsSync(file);
            }
            case "year":
            case "month":
            case "day":
            case "hour":
            case "minute":
            case "second": {
                const time = args[0];
                if (time instanceof TableValue) {
                    const value = time.entries.get(expression.name);
                    if (typeof value === "number")
                        return value;
                }
                this.fail(`"${expression.name} of" needs a time value such as now.`, token);
                break;
            }
            case "format": {
                const time = args[0];
                const pattern = this.textArg(args[1], token);
                if (!(time instanceof TableValue)) {
                    this.fail('"format of" needs a time value such as now.', token);
                }
                return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (part) => {
                    const partName = {
                        YYYY: "year",
                        MM: "month",
                        DD: "day",
                        HH: "hour",
                        mm: "minute",
                        ss: "second",
                    };
                    const value = time.entries.get(partName[part]);
                    return typeof value === "number" ? String(value).padStart(2, "0") : "00";
                });
            }
            default:
                this.fail(`I don't know the built-in "${expression.name}".`, token);
        }
        throw new Error("unreachable");
    }
    textArg(value, token) {
        if (typeof value !== "string") {
            this.fail(`I expected text here, but found ${typeName(value ?? null)}.`, token);
        }
        return value;
    }
    numberArg(value, token) {
        if (typeof value !== "number") {
            this.fail(`I expected a number here, but found ${typeName(value ?? null)}.`, token);
        }
        return value;
    }
    listArg(value, token) {
        if (!(value instanceof ListValue)) {
            this.fail(`I expected a list here, but found ${typeName(value ?? null)}.`, token);
        }
        return value;
    }
    // -------------------------------------------------------------------- calls
    callValue(fn, args, token) {
        let target = fn;
        let self = null;
        if (fn instanceof BoundMethodValue) {
            target = fn.fn;
            self = fn.object;
        }
        if (target instanceof BuiltinValue)
            return target.call(args);
        if (!(target instanceof FunctionValue)) {
            this.fail(`I can't call ${typeName(fn)}.`, token, "Only functions can be called.");
        }
        if (args.length > target.params.length) {
            this.fail(`This function takes ${target.params.length} ${target.params.length === 1 ? "argument" : "arguments"}, but ${args.length} were given.`, token);
        }
        const callEnv = new Env(target.closure);
        if (self) {
            callEnv.self = self;
            callEnv.define("it", self);
        }
        for (let i = 0; i < target.params.length; i += 1) {
            const param = target.params[i];
            if (i < args.length) {
                callEnv.define(param.name, args[i]);
            }
            else if (param.defaultValue) {
                callEnv.define(param.name, this.evaluate(param.defaultValue, callEnv));
            }
            else {
                this.fail(`I need a value for "${param.name}".`, token);
            }
        }
        try {
            if (target.expressionBody) {
                return this.evaluate(target.expressionBody, callEnv);
            }
            this.execStatements(target.body, callEnv);
            return null;
        }
        catch (signal) {
            if (signal instanceof ReturnSignal)
                return signal.value;
            if (signal instanceof RangeError) {
                this.fail("This program has too many nested calls. Check for a function that calls itself forever.", token);
            }
            throw signal;
        }
    }
    // ------------------------------------------------------------------ helpers
    runBlock(statements, parent) {
        this.execStatements(statements, new Env(parent));
    }
    conditionValue(value, token) {
        if (typeof value === "boolean")
            return value;
        this.fail(`A condition must be yes or no, but this is ${typeName(value)}.`, token, 'Write a comparison, as in "if age is greater than 17:". EngCode does not treat other values as true or false.');
    }
    sortList(list, descending, token) {
        const items = list.items;
        if (items.length < 2)
            return;
        const first = items[0];
        const allNumbers = items.every((item) => typeof item === "number");
        const allText = items.every((item) => typeof item === "string");
        if (!allNumbers && !allText) {
            this.fail(`I can only sort a list of all numbers or all text. This list starts with ${typeName(first)}.`, token);
        }
        items.sort((a, b) => {
            let result;
            if (typeof a === "number" && typeof b === "number") {
                result = a - b;
            }
            else {
                const left = String(a);
                const right = String(b);
                result = left < right ? -1 : left > right ? 1 : 0;
            }
            return descending ? -result : result;
        });
    }
    resolveInside(given, _token) {
        const resolved = path.resolve(this.fileRoot, given);
        const relative = path.relative(this.fileRoot, resolved);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            this.fail("Files must stay inside the project folder.", _token, `Put the file next to your program, inside "${this.fileRoot}".`);
        }
        return resolved;
    }
    showPath(file) {
        return path.relative(this.fileRoot, file) || file;
    }
    readStorage() {
        try {
            if (!fs.existsSync(this.storagePath))
                return {};
            const parsed = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // A damaged storage file should not stop the program.
        }
        return {};
    }
    writeStorage(storage, token) {
        try {
            fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
            fs.writeFileSync(this.storagePath, JSON.stringify(storage, null, 2), "utf8");
        }
        catch {
            this.fail("I could not save the device data.", token);
        }
    }
    request(method, url, body, token) {
        if (!this.allowNetwork) {
            this.fail("Network access is turned off.", token, 'Run again with "engcode run file.eng --allow-network" if you trust this address.');
        }
        if (!/^https:\/\//i.test(url)) {
            this.fail("Web addresses must start with https://.", token);
        }
        const args = method === "GET"
            ? ["-sS", "--fail", "--max-time", "20", url]
            : [
                "-sS",
                "--fail",
                "--max-time",
                "20",
                "-X",
                "POST",
                "-H",
                "Content-Type: application/json",
                "-d",
                JSON.stringify(toPlain(body ?? null)),
                url,
            ];
        const result = spawnSync("curl", args, { encoding: "utf8" });
        if (result.error) {
            this.fail("I could not use curl to reach the network.", token, "Install curl, or use an app build where the browser makes the request.");
        }
        if (result.status !== 0) {
            const detail = (result.stderr || "").trim();
            this.fail(`I could not reach "${url}".`, token, detail.length > 0 ? detail.split("\n")[0] : "Check the address and your connection.");
        }
        return result.stdout;
    }
    fail(message, token, suggestion, hint) {
        throw new RuntimeError(new Diagnostic(message, spanFromToken(token), suggestion, hint));
    }
}
export function parseNumberText(text) {
    const trimmed = text.trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed))
        return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
}
export { formatNumber };
//# sourceMappingURL=interpreter.js.map