/**
 * EngCode browser runtime.
 *
 * This file is compiled to `dist/runtime/web-runtime.js` and copied next to a
 * built app as `runtime.js`. It has no Node imports, no dependencies, and never
 * evaluates source text with `eval`.
 */
class AppFailure extends Error {
    constructor(message) {
        super(message);
        this.name = "AppFailure";
    }
}
class StopSignal {
}
class SkipSignal {
}
class ReturnSignal {
    value;
    constructor(value) {
        this.value = value;
    }
    continue = false;
}
const STOP = new StopSignal();
const SKIP = new SkipSignal();
function isFunctionValue(value) {
    return typeof value === "object" && value !== null && value.__function === true;
}
function display(value) {
    if (value === null || value === undefined)
        return "nothing";
    if (typeof value === "boolean")
        return value ? "yes" : "no";
    if (Array.isArray(value))
        return value.map((item) => display(item)).join(", ");
    if (isFunctionValue(value))
        return "a function";
    if (typeof value === "object") {
        const record = value;
        if (typeof record.__display === "string")
            return record.__display;
        const parts = [];
        for (const [key, item] of Object.entries(record)) {
            if (key.startsWith("__"))
                continue;
            parts.push(`${key} ${display(item)}`);
        }
        return parts.join(", ");
    }
    return String(value);
}
/** Lists of tables read best when the table's title is shown instead of every field. */
function listItemLabel(value) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const record = value;
        if (typeof record.__display === "string")
            return record.__display;
        const title = typeof record.title === "string" ? record.title.trim() : "";
        if (title.length > 0)
            return record.pinned === true ? `📌 ${title}` : title;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (name.length > 0)
            return name;
    }
    return display(value);
}
function equal(left, right) {
    if (left === right)
        return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((item, index) => equal(item, right[index]));
    }
    if (typeof left === "object" &&
        left !== null &&
        typeof right === "object" &&
        right !== null &&
        !Array.isArray(left) &&
        !Array.isArray(right)) {
        const a = left;
        const b = right;
        const keysA = Object.keys(a).filter((key) => !key.startsWith("__"));
        const keysB = Object.keys(b).filter((key) => !key.startsWith("__"));
        return keysA.length === keysB.length && keysA.every((key) => equal(a[key], b[key]));
    }
    return false;
}
function truthy(value) {
    if (typeof value !== "boolean") {
        throw new AppFailure(`I expected yes or no here, but found ${display(value)}.`);
    }
    return value;
}
function toNumber(value) {
    if (typeof value === "number")
        return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
    }
    throw new AppFailure(`I expected a number here, but found ${display(value)}.`);
}
function asText(value) {
    if (typeof value === "string")
        return value;
    throw new AppFailure(`I expected text here, but found ${display(value)}.`);
}
function colorCss(value) {
    const raw = String(value ?? "").trim();
    const known = {
        "light gray": "lightgray",
        "light grey": "lightgray",
        "dark gray": "darkgray",
        "dark grey": "darkgray",
        "dark blue": "darkblue",
        "light blue": "lightblue",
        "dark green": "darkgreen",
        "light green": "lightgreen",
        "dark red": "darkred",
        "light red": "lightcoral",
        "dark yellow": "darkkhaki",
        "light yellow": "lightyellow",
        "dark cyan": "darkcyan",
        "dark magenta": "darkmagenta",
        "dark orange": "darkorange",
        "sky blue": "skyblue",
        "royal blue": "royalblue",
        "forest green": "forestgreen",
        "midnight blue": "midnightblue",
        "hot pink": "hotpink",
    };
    const lower = raw.toLowerCase();
    if (known[lower])
        return known[lower];
    if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw))
        return raw;
    if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw))
        return raw;
    if (lower === "transparent")
        return "transparent";
    if (/^[a-z ]+$/.test(lower))
        return lower.replace(/\s+/g, "");
    return raw;
}
function numberPx(value) {
    if (typeof value === "number")
        return `${value}px`;
    const raw = String(value ?? "");
    if (/^-?[0-9.]+$/.test(raw))
        return `${raw}px`;
    return raw;
}
function slug(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "home";
}
export function startApp(definition, options = {}) {
    const doc = document;
    const root = doc.getElementById("eng-app");
    if (!root)
        throw new Error("The app container is missing.");
    const state = new Map();
    const globalScope = { values: new Map() };
    const consts = new Map();
    const kinds = new Map();
    const elementsByUid = new Map();
    const elementsById = new Map();
    const hiddenByUser = new Set();
    const initialized = new Set();
    const nodeByUid = new Map();
    const selectedListItems = new Map();
    const listValues = new Map();
    const pressedKeys = new Set();
    const handlers = [];
    const timers = [];
    const intervalHandles = [];
    const allowedHosts = new Set((options.allowedHosts ?? []).map((host) => host.toLowerCase()));
    let currentError = null;
    let currentPage = "";
    let frameHandle = 0;
    const storagePrefix = `engcode:${definition.name}:`;
    // -------------------------------------------------------------- expressions
    const lookup = (scope, name) => {
        let cursor = scope;
        while (cursor) {
            if (cursor.values.has(name))
                return cursor.values.get(name);
            cursor = cursor.parent;
        }
        if (state.has(name))
            return state.get(name);
        if (consts.has(name))
            return consts.get(name);
        if (name === "nothing")
            return null;
        if (name === "yes" || name === "true")
            return true;
        if (name === "no" || name === "false")
            return false;
        throw new AppFailure(`I don't know the name "${name}".`);
    };
    const assign = (scope, name, value) => {
        let cursor = scope;
        while (cursor) {
            if (cursor.values.has(name)) {
                cursor.values.set(name, value);
                return;
            }
            cursor = cursor.parent;
        }
        if (state.has(name)) {
            state.set(name, value);
            return;
        }
        scope.values.set(name, value);
    };
    const evaluate = (expression, scope) => {
        if (!expression)
            return null;
        switch (expression.kind) {
            case "number":
            case "text":
                return expression.value;
            case "boolean":
                return Boolean(expression.value);
            case "nothing":
                return null;
            case "variable":
                return lookup(scope, expression.name);
            case "property": {
                const base = evaluate(expression.base, scope);
                if (base === null || base === undefined) {
                    throw new AppFailure(`"${expression.key}" is not on nothing.`);
                }
                return base[expression.key] ?? null;
            }
            case "unary": {
                const value = evaluate(expression.operand, scope);
                return expression.operator === "minus" ? -toNumber(value) : !truthy(value);
            }
            case "binary": {
                if (expression.operator === "and") {
                    return truthy(evaluate(expression.left, scope))
                        ? truthy(evaluate(expression.right, scope))
                        : false;
                }
                if (expression.operator === "or") {
                    return truthy(evaluate(expression.left, scope))
                        ? true
                        : truthy(evaluate(expression.right, scope));
                }
                const left = evaluate(expression.left, scope);
                const right = evaluate(expression.right, scope);
                switch (expression.operator) {
                    case "plus":
                        if (typeof left === "number" && typeof right === "number")
                            return left + right;
                        if (typeof left === "string" || typeof right === "string")
                            return display(left) + display(right);
                        if (Array.isArray(left) && Array.isArray(right))
                            return [...left, ...right];
                        throw new AppFailure(`I can't join ${display(left)} and ${display(right)} with "plus".`);
                    case "minus":
                        return toNumber(left) - toNumber(right);
                    case "times":
                        return toNumber(left) * toNumber(right);
                    case "divided by": {
                        const divisor = toNumber(right);
                        if (divisor === 0)
                            throw new AppFailure("I cannot divide by zero.");
                        return toNumber(left) / divisor;
                    }
                    case "remainder":
                        return toNumber(left) % toNumber(right);
                    default:
                        throw new AppFailure(`I don't know the operator "${expression.operator}".`);
                }
            }
            case "comparison": {
                const left = evaluate(expression.left, scope);
                const right = (expression.right ?? []).map((item) => evaluate(item, scope));
                switch (expression.operator) {
                    case "is":
                        return equal(left, right[0]);
                    case "is not":
                        return !equal(left, right[0]);
                    case "greater than":
                        return toNumber(left) > toNumber(right[0]);
                    case "less than":
                        return toNumber(left) < toNumber(right[0]);
                    case "at least":
                        return toNumber(left) >= toNumber(right[0]);
                    case "at most":
                        return toNumber(left) <= toNumber(right[0]);
                    case "between":
                        return toNumber(left) >= toNumber(right[0]) && toNumber(left) <= toNumber(right[1]);
                    case "contains":
                        if (Array.isArray(left))
                            return left.some((item) => equal(item, right[0]));
                        if (typeof left === "string")
                            return left.includes(display(right[0]));
                        if (typeof left === "object" && left !== null) {
                            return Object.prototype.hasOwnProperty.call(left, display(right[0]));
                        }
                        return false;
                    case "starts with":
                        return asText(left).startsWith(display(right[0]));
                    case "ends with":
                        return asText(left).endsWith(display(right[0]));
                    case "is empty":
                        return (left === null ||
                            left === undefined ||
                            left === "" ||
                            (Array.isArray(left) && left.length === 0) ||
                            (typeof left === "object" && left !== null && Object.keys(left).length === 0));
                    case "is not empty":
                        return !(left === null ||
                            left === undefined ||
                            left === "" ||
                            (Array.isArray(left) && left.length === 0) ||
                            (typeof left === "object" && left !== null && Object.keys(left).length === 0));
                    default:
                        throw new AppFailure(`I don't know the comparison "${expression.operator}".`);
                }
            }
            case "list":
                return expression.items.map((item) => evaluate(item, scope));
            case "table": {
                const table = {};
                for (const entry of expression.entries)
                    table[entry.key] = evaluate(entry.value, scope);
                return table;
            }
            case "function": {
                return {
                    __function: true,
                    params: expression.params,
                    body: expression.body,
                    expressionBody: expression.expressionBody,
                    closure: scope,
                };
            }
            case "function-ref": {
                if (consts.has(expression.name))
                    return consts.get(expression.name);
                throw new AppFailure(`I don't know a function called "${expression.name}".`);
            }
            case "error-ref":
                return currentError;
            case "new": {
                const value = { __kind: expression.kindName };
                for (const entry of expression.entries)
                    value[entry.key] = evaluate(entry.value, scope);
                return value;
            }
            case "call": {
                const args = expression.args.map((item) => evaluate(item, scope));
                return callFunctionValue(expression.name, args, scope);
            }
            case "call-value": {
                const callee = evaluate(expression.callee, scope);
                const args = expression.args.map((item) => evaluate(item, scope));
                if (typeof callee === "function")
                    return callee(...args);
                if (isFunctionValue(callee))
                    return runFunction(callee, args);
                throw new AppFailure("That value is not a function.");
            }
            case "builtin": {
                const args = expression.args.map((item) => evaluate(item, scope));
                return runBuiltin(expression.name, args, scope);
            }
            default:
                throw new AppFailure(`I don't understand the expression "${expression.kind}".`);
        }
    };
    const runBuiltin = (name, args, scope) => {
        switch (name) {
            case "uppercase":
                return asText(args[0]).toUpperCase();
            case "lowercase":
                return asText(args[0]).toLowerCase();
            case "trim":
                return asText(args[0]).trim();
            case "length":
                if (Array.isArray(args[0]))
                    return args[0].length;
                if (typeof args[0] === "string")
                    return Array.from(args[0]).length;
                if (typeof args[0] === "object" && args[0] !== null)
                    return Object.keys(args[0]).length;
                return 0;
            case "round":
                return Math.round(toNumber(args[0]));
            case "floor":
                return Math.floor(toNumber(args[0]));
            case "ceiling":
                return Math.ceil(toNumber(args[0]));
            case "absolute value":
                return Math.abs(toNumber(args[0]));
            case "square root": {
                const value = toNumber(args[0]);
                if (value < 0)
                    throw new AppFailure("I can't take the square root of a negative number.");
                return Math.sqrt(value);
            }
            case "sine":
                return Math.sin(toNumber(args[0]));
            case "cosine":
                return Math.cos(toNumber(args[0]));
            case "tangent":
                return Math.tan(toNumber(args[0]));
            case "minimum":
                return Math.min(toNumber(args[0]), toNumber(args[1]));
            case "maximum":
                return Math.max(toNumber(args[0]), toNumber(args[1]));
            case "power":
                return Math.pow(toNumber(args[0]), toNumber(args[1]));
            case "number from": {
                const text = asText(args[0]);
                const parsed = Number(text.trim());
                if (text.trim() === "" || Number.isNaN(parsed)) {
                    throw new AppFailure(`I can't read "${text}" as a number.`);
                }
                return parsed;
            }
            case "text":
                return display(args[0]);
            case "JSON of":
                return JSON.stringify(args[0]);
            case "data from JSON": {
                let parsed;
                try {
                    parsed = JSON.parse(asText(args[0]));
                }
                catch {
                    throw new AppFailure("That text is not valid JSON.");
                }
                return parsed;
            }
            case "random number": {
                const from = toNumber(args[0]);
                const to = toNumber(args[1]);
                if (!Number.isInteger(from) || !Number.isInteger(to)) {
                    throw new AppFailure('"random number from ... to ..." needs whole numbers.');
                }
                const low = Math.min(from, to);
                const high = Math.max(from, to);
                return low + Math.floor(Math.random() * (high - low + 1));
            }
            case "random decimal":
                return Math.random();
            case "random item": {
                const list = args[0];
                if (!Array.isArray(list)) {
                    throw new AppFailure('"random item of" needs a list.');
                }
                if (list.length === 0) {
                    throw new AppFailure("I can't pick a random item from an empty list.");
                }
                return list[Math.floor(Math.random() * list.length)];
            }
            case "item": {
                const index = toNumber(args[0]);
                const collection = args[1];
                if (!Number.isInteger(index)) {
                    throw new AppFailure('"item ... of ..." needs a whole-number position.');
                }
                if (Array.isArray(collection)) {
                    return index >= 1 && index <= collection.length ? collection[index - 1] : null;
                }
                if (typeof collection === "string") {
                    const characters = Array.from(collection);
                    return index >= 1 && index <= characters.length ? characters[index - 1] : null;
                }
                throw new AppFailure('"item ... of ..." needs a list or text.');
            }
            case "last item": {
                const collection = args[0];
                if (Array.isArray(collection)) {
                    return collection.length > 0 ? collection[collection.length - 1] : null;
                }
                if (typeof collection === "string") {
                    const characters = Array.from(collection);
                    return characters.length > 0 ? characters[characters.length - 1] : null;
                }
                throw new AppFailure('"last item of" needs a list or text.');
            }
            case "split": {
                const text = asText(args[0]);
                const separator = asText(args[1]);
                return separator === "" ? Array.from(text) : text.split(separator);
            }
            case "join": {
                if (!Array.isArray(args[0])) {
                    throw new AppFailure('"join" needs a list.');
                }
                return args[0].map((item) => display(item)).join(asText(args[1]));
            }
            case "replace": {
                const find = asText(args[0]);
                const replacement = asText(args[1]);
                const text = asText(args[2]);
                return find === "" ? text : text.split(find).join(replacement);
            }
            case "position": {
                const find = asText(args[0]);
                const text = asText(args[1]);
                const index = text.indexOf(find);
                return index < 0 ? 0 : Array.from(text.slice(0, index)).length + 1;
            }
            case "value of":
                return readValue(args[0]);
            case "key pressed":
                return pressedKeys.has(String(args[0]).toLowerCase());
            case "file exists":
                return false;
            case "now": {
                const now = new Date();
                return {
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                    day: now.getDate(),
                    hour: now.getHours(),
                    minute: now.getMinutes(),
                    second: now.getSeconds(),
                };
            }
            case "today": {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            }
            case "pi":
                return Math.PI;
            case "e":
                return Math.E;
            case "year":
            case "month":
            case "day":
            case "hour":
            case "minute":
            case "second": {
                const time = args[0];
                if (typeof time === "object" && time !== null) {
                    const value = time[name];
                    if (typeof value === "number")
                        return value;
                }
                throw new AppFailure(`"${name} of" needs a time value such as now.`);
            }
            case "format": {
                const time = args[0];
                if (typeof time !== "object" || time === null) {
                    throw new AppFailure('"format of" needs a time value such as now.');
                }
                const table = time;
                const partName = {
                    YYYY: "year",
                    MM: "month",
                    DD: "day",
                    HH: "hour",
                    mm: "minute",
                    ss: "second",
                };
                return asText(args[1]).replace(/YYYY|MM|DD|HH|mm|ss/g, (part) => {
                    const value = table[partName[part]];
                    return typeof value === "number" ? String(value).padStart(2, "0") : "00";
                });
            }
            default:
                throw new AppFailure(`I don't know the built-in "${name}" in a web app.`);
        }
    };
    const runFunction = (fn, args) => {
        const scope = { values: new Map(), parent: fn.closure };
        fn.params.forEach((param, index) => {
            if (index < args.length) {
                scope.values.set(param.name, args[index]);
            }
            else if (param.defaultValue) {
                scope.values.set(param.name, evaluate(param.defaultValue, scope));
            }
            else {
                scope.values.set(param.name, null);
            }
        });
        try {
            if (fn.expressionBody)
                return evaluate(fn.expressionBody, scope);
            for (const statement of fn.body)
                exec(statement, scope);
        }
        catch (signal) {
            if (signal instanceof ReturnSignal)
                return signal.value;
            throw signal;
        }
        return null;
    };
    const callFunctionValue = (name, args, scope) => {
        if (consts.has(name))
            return runFunction(consts.get(name), args);
        if (name === "say") {
            toast(display(args[0]));
            return null;
        }
        throw new AppFailure(`I don't know a function called "${name}".`);
    };
    // -------------------------------------------------------------- assignments
    const assignTarget = (target, value, scope) => {
        if (target.kind === "variable") {
            assign(scope, target.name, value);
            return;
        }
        if (target.kind === "property") {
            const base = evaluate(target.base, scope);
            if (typeof base !== "object" || base === null) {
                throw new AppFailure("I can only change a property on a table or object.");
            }
            base[target.key] = value;
            return;
        }
        throw new AppFailure("I don't know what to change here.");
    };
    const readTarget = (target, scope) => {
        if (target.kind === "variable")
            return lookup(scope, target.name);
        if (target.kind === "property") {
            const base = evaluate(target.base, scope);
            if (typeof base !== "object" || base === null)
                return null;
            return base[target.key] ?? null;
        }
        throw new AppFailure("I don't know what to read here.");
    };
    // ---------------------------------------------------------------- statements
    const execBlock = (statements, scope) => {
        for (const statement of statements)
            exec(statement, scope);
    };
    const exec = (statement, scope) => {
        switch (statement.kind) {
            case "say":
                toast(display(evaluate(statement.value, scope)));
                return;
            case "ask": {
                const answer = window.prompt(display(evaluate(statement.prompt, scope))) ?? "";
                assign(scope, statement.name, statement.number ? Number(answer) : answer);
                return;
            }
            case "set":
                assignTarget(statement.target, evaluate(statement.value, scope), scope);
                return;
            case "change":
                assignTarget(statement.target, evaluate(statement.value, scope), scope);
                return;
            case "add": {
                const value = evaluate(statement.value, scope);
                const current = readTarget(statement.target, scope);
                if (typeof current === "number") {
                    assignTarget(statement.target, current + toNumber(value), scope);
                }
                else if (typeof current === "string") {
                    assignTarget(statement.target, current + display(value), scope);
                }
                else if (Array.isArray(current)) {
                    current.push(value);
                }
                else {
                    throw new AppFailure(`I can't add to ${display(current)}.`);
                }
                return;
            }
            case "remove": {
                const value = evaluate(statement.value, scope);
                const current = readTarget(statement.target, scope);
                if (Array.isArray(current)) {
                    const index = current.findIndex((item) => equal(item, value));
                    if (index >= 0)
                        current.splice(index, 1);
                }
                else if (typeof current === "object" && current !== null) {
                    delete current[display(value)];
                }
                return;
            }
            case "if": {
                for (const branch of statement.branches) {
                    if (truthy(evaluate(branch.condition, scope))) {
                        execBlock(branch.body, scope);
                        return;
                    }
                }
                if (statement.otherwise)
                    execBlock(statement.otherwise, scope);
                return;
            }
            case "repeat": {
                const count = toNumber(evaluate(statement.count, scope));
                for (let index = 0; index < count; index += 1) {
                    try {
                        execBlock(statement.body, scope);
                    }
                    catch (signal) {
                        if (signal === SKIP)
                            continue;
                        if (signal === STOP)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "for-each": {
                const iterable = evaluate(statement.iterable, scope);
                const items = Array.isArray(iterable)
                    ? iterable
                    : typeof iterable === "string"
                        ? Array.from(iterable)
                        : [];
                for (const item of items) {
                    const inner = { values: new Map([[statement.name, item]]), parent: scope };
                    try {
                        execBlock(statement.body, inner);
                    }
                    catch (signal) {
                        if (signal === SKIP)
                            continue;
                        if (signal === STOP)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "count": {
                const start = toNumber(evaluate(statement.start, scope));
                const end = toNumber(evaluate(statement.end, scope));
                const step = start <= end ? 1 : -1;
                for (let index = start; step > 0 ? index <= end : index >= end; index += step) {
                    const inner = { values: new Map([[statement.name, index]]), parent: scope };
                    try {
                        execBlock(statement.body, inner);
                    }
                    catch (signal) {
                        if (signal === SKIP)
                            continue;
                        if (signal === STOP)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "while": {
                while (truthy(evaluate(statement.condition, scope))) {
                    try {
                        execBlock(statement.body, scope);
                    }
                    catch (signal) {
                        if (signal === SKIP)
                            continue;
                        if (signal === STOP)
                            break;
                        throw signal;
                    }
                }
                return;
            }
            case "stop":
                throw STOP;
            case "skip":
                throw SKIP;
            case "define": {
                const fn = {
                    __function: true,
                    name: statement.name,
                    params: statement.params,
                    body: statement.body,
                    expressionBody: statement.expressionBody,
                    closure: scope,
                };
                consts.set(statement.name, fn);
                return;
            }
            case "call-stmt": {
                const args = statement.args.map((item) => evaluate(item, scope));
                callFunctionValue(statement.name, args, scope);
                return;
            }
            case "call-value-stmt": {
                const callee = evaluate(statement.callee, scope);
                const args = statement.args.map((item) => evaluate(item, scope));
                if (typeof callee === "function") {
                    callee(...args);
                    return;
                }
                if (isFunctionValue(callee)) {
                    runFunction(callee, args);
                    return;
                }
                throw new AppFailure("That value is not a function.");
            }
            case "give-back":
                throw new ReturnSignal(statement.value ? evaluate(statement.value, scope) : null);
            case "try":
                try {
                    execBlock(statement.body, scope);
                }
                catch (error) {
                    if (error instanceof StopSignal || error instanceof SkipSignal || error instanceof ReturnSignal) {
                        throw error;
                    }
                    currentError = error instanceof Error ? error.message : String(error);
                    execBlock(statement.handler, scope);
                }
                return;
            case "state":
                state.set(statement.name, evaluate(statement.value, scope));
                return;
            case "kind": {
                kinds.set(statement.name, {
                    fields: new Set(statement.fields.map((field) => field.name)),
                    methods: new Map(statement.methods.map((method) => [method.name, method])),
                });
                return;
            }
            case "method-stmt": {
                const object = statement.object === "it" ? lookup(scope, "it") : lookup(scope, statement.object);
                if (typeof object !== "object" || object === null) {
                    throw new AppFailure(`I could not find "${statement.object}".`);
                }
                const kindName = object.__kind;
                const info = typeof kindName === "string" ? kinds.get(kindName) : undefined;
                const method = info?.methods.get(statement.method);
                if (!method)
                    throw new AppFailure(`That object has no method called "${statement.method}".`);
                const methodScope = { values: new Map([["it", object]]), parent: scope };
                method.params.forEach((param, index) => {
                    methodScope.values.set(param.name, evaluate(statement.args[index], scope));
                });
                execBlock(method.body, methodScope);
                return;
            }
            case "sort":
            case "reverse":
            case "shuffle": {
                const value = evaluate(statement.value, scope);
                if (Array.isArray(value)) {
                    if (statement.kind === "reverse")
                        value.reverse();
                    else if (statement.kind === "shuffle")
                        value.sort(() => Math.random() - 0.5);
                    else {
                        value.sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : display(a).localeCompare(display(b))));
                        if (statement.descending)
                            value.reverse();
                    }
                }
                return;
            }
            case "use":
            case "app":
            case "style":
            case "theme":
                return;
            case "show":
                hiddenByUser.delete(String(statement.id).toLowerCase());
                elementForId(statement.id)?.removeAttribute("hidden");
                return;
            case "hide":
                hiddenByUser.add(String(statement.id).toLowerCase());
                elementForId(statement.id)?.setAttribute("hidden", "");
                return;
            case "clear": {
                const element = elementForId(statement.id);
                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                    element.value = "";
                }
                else if (element) {
                    const uid = element.dataset.engNode;
                    if (uid)
                        selectedListItems.delete(uid);
                    element.textContent = "";
                }
                return;
            }
            case "change-of":
                changeScreen(statement.property, statement.id, evaluate(statement.value, scope));
                return;
            case "go-to-page":
                window.location.hash = `#/${slug(statement.page)}`;
                return;
            case "open-popup": {
                const element = elementForId(statement.id);
                if (element instanceof HTMLDialogElement)
                    element.showModal();
                return;
            }
            case "close-popup": {
                const element = elementForId(statement.id);
                if (element instanceof HTMLDialogElement)
                    element.close();
                return;
            }
            case "play-sound": {
                const source = evaluate(statement.path, scope);
                try {
                    const audio = new Audio(String(source));
                    void audio.play();
                }
                catch {
                    // Sound is optional; a missing file should not stop the app.
                }
                return;
            }
            case "clear-canvas": {
                const canvas = elementForId(statement.id);
                if (canvas instanceof HTMLCanvasElement) {
                    const context = canvas.getContext("2d");
                    if (context) {
                        context.fillStyle = colorCss(statement.color);
                        context.fillRect(0, 0, canvas.width, canvas.height);
                    }
                }
                return;
            }
            case "draw": {
                const canvas = elementForId(statement.id);
                if (!(canvas instanceof HTMLCanvasElement))
                    return;
                const context = canvas.getContext("2d");
                if (!context)
                    return;
                context.fillStyle = colorCss(statement.color ?? "black");
                context.strokeStyle = colorCss(statement.color ?? "black");
                const x = statement.x ? toNumber(evaluate(statement.x, scope)) : 0;
                const y = statement.y ? toNumber(evaluate(statement.y, scope)) : 0;
                const width = statement.width ? toNumber(evaluate(statement.width, scope)) : 0;
                const height = statement.height ? toNumber(evaluate(statement.height, scope)) : 0;
                const size = statement.size ? toNumber(evaluate(statement.size, scope)) : 0;
                switch (statement.shape) {
                    case "rectangle":
                        context.fillRect(x, y, width, height);
                        break;
                    case "circle":
                        context.beginPath();
                        context.arc(x, y, size / 2, 0, Math.PI * 2);
                        context.fill();
                        break;
                    case "line":
                        context.beginPath();
                        context.moveTo(toNumber(evaluate(statement.fromX, scope)), toNumber(evaluate(statement.fromY, scope)));
                        context.lineTo(toNumber(evaluate(statement.toX, scope)), toNumber(evaluate(statement.toY, scope)));
                        context.stroke();
                        break;
                    case "text":
                        context.font = "20px sans-serif";
                        context.fillText(display(evaluate(statement.text, scope)), x, y);
                        break;
                    case "image": {
                        const source = display(evaluate(statement.path, scope));
                        const image = new Image();
                        image.onload = () => context.drawImage(image, x - size / 2, y - size / 2, size, size);
                        image.src = source;
                        break;
                    }
                }
                return;
            }
            case "wait":
                return;
            case "save-device": {
                const key = display(evaluate(statement.key, scope));
                const value = JSON.stringify(evaluate(statement.value, scope));
                try {
                    window.localStorage.setItem(storagePrefix + key, value);
                }
                catch {
                    // Storage can be blocked; the app keeps working in memory.
                }
                return;
            }
            case "load-device": {
                const key = display(evaluate(statement.key, scope));
                let value = null;
                try {
                    const raw = window.localStorage.getItem(storagePrefix + key);
                    if (raw !== null)
                        value = JSON.parse(raw);
                }
                catch {
                    value = null;
                }
                assign(scope, statement.name, value);
                return;
            }
            case "delete-device": {
                const key = display(evaluate(statement.key, scope));
                try {
                    window.localStorage.removeItem(storagePrefix + key);
                }
                catch {
                    // Ignore blocked storage.
                }
                return;
            }
            case "get-data":
                return;
            case "send-data":
                return;
            default:
                throw new AppFailure(`I don't understand the statement "${statement.kind}".`);
        }
    };
    // get data and send data are async; run them through a promise-aware path.
    const execAsync = async (statement, scope) => {
        if (statement.kind === "get-data") {
            const url = display(evaluate(statement.url, scope));
            const data = await fetchData(url, "GET");
            assign(scope, statement.name, data);
            return;
        }
        if (statement.kind === "send-data") {
            const url = display(evaluate(statement.url, scope));
            const value = evaluate(statement.value, scope);
            const data = await fetchData(url, "POST", value);
            assign(scope, statement.name, data);
            return;
        }
        if (statement.kind === "wait") {
            const seconds = toNumber(evaluate(statement.seconds, scope));
            await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
            return;
        }
        if (statement.kind === "try") {
            try {
                await runBlockAsync(statement.body, scope);
            }
            catch (error) {
                if (error instanceof StopSignal || error instanceof SkipSignal || error instanceof ReturnSignal) {
                    throw error;
                }
                currentError = error instanceof Error ? error.message : String(error);
                await runBlockAsync(statement.handler, scope);
            }
            return;
        }
        if (statement.kind === "if") {
            for (const branch of statement.branches) {
                if (truthy(evaluate(branch.condition, scope))) {
                    await runBlockAsync(branch.body, scope);
                    return;
                }
            }
            if (statement.otherwise)
                await runBlockAsync(statement.otherwise, scope);
            return;
        }
        if (statement.kind === "repeat") {
            const count = toNumber(evaluate(statement.count, scope));
            for (let index = 0; index < count; index += 1) {
                try {
                    await runBlockAsync(statement.body, scope);
                }
                catch (signal) {
                    if (signal === SKIP)
                        continue;
                    if (signal === STOP)
                        break;
                    throw signal;
                }
            }
            return;
        }
        if (statement.kind === "for-each") {
            const iterable = evaluate(statement.iterable, scope);
            const items = Array.isArray(iterable)
                ? iterable
                : typeof iterable === "string"
                    ? Array.from(iterable)
                    : [];
            for (const item of items) {
                const inner = { values: new Map([[statement.name, item]]), parent: scope };
                try {
                    await runBlockAsync(statement.body, inner);
                }
                catch (signal) {
                    if (signal === SKIP)
                        continue;
                    if (signal === STOP)
                        break;
                    throw signal;
                }
            }
            return;
        }
        if (statement.kind === "count") {
            const start = toNumber(evaluate(statement.start, scope));
            const end = toNumber(evaluate(statement.end, scope));
            const step = start <= end ? 1 : -1;
            for (let index = start; step > 0 ? index <= end : index >= end; index += step) {
                const inner = { values: new Map([[statement.name, index]]), parent: scope };
                try {
                    await runBlockAsync(statement.body, inner);
                }
                catch (signal) {
                    if (signal === SKIP)
                        continue;
                    if (signal === STOP)
                        break;
                    throw signal;
                }
            }
            return;
        }
        if (statement.kind === "while") {
            while (truthy(evaluate(statement.condition, scope))) {
                try {
                    await runBlockAsync(statement.body, scope);
                }
                catch (signal) {
                    if (signal === SKIP)
                        continue;
                    if (signal === STOP)
                        break;
                    throw signal;
                }
            }
            return;
        }
        exec(statement, scope);
    };
    const runBlockAsync = async (statements, scope) => {
        for (const statement of statements)
            await execAsync(statement, scope);
    };
    const fetchData = async (url, method, body) => {
        let parsed;
        try {
            parsed = new URL(url, window.location.href);
        }
        catch {
            throw new AppFailure("That web address is not valid.");
        }
        if (parsed.protocol !== "https:") {
            throw new AppFailure("Web requests must use https.");
        }
        if (allowedHosts.size > 0 && !allowedHosts.has(parsed.hostname.toLowerCase())) {
            throw new AppFailure(`This app is not allowed to call ${parsed.hostname}.`);
        }
        const response = await fetch(parsed.toString(), {
            method,
            headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
            body: method === "POST" ? JSON.stringify(body ?? null) : undefined,
        });
        if (!response.ok) {
            throw new AppFailure(`The web request failed with status ${response.status}.`);
        }
        const text = await response.text();
        if (text.length > 1_000_000) {
            throw new AppFailure("The web response was too large.");
        }
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    };
    // -------------------------------------------------------------------- screen
    const elementForUid = (uid) => {
        return elementsByUid.get(uid) ?? root.querySelector(`[data-eng-node="${uid}"]`);
    };
    const elementForId = (id) => {
        return elementsById.get(String(id).toLowerCase()) ?? null;
    };
    const readValue = (id) => {
        const element = elementForId(display(id));
        if (!element)
            return "";
        if (element instanceof HTMLUListElement) {
            const uid = element.dataset.engNode;
            const current = element.querySelector('li[aria-current="true"]');
            return uid && current && selectedListItems.has(uid) ? selectedListItems.get(uid) : null;
        }
        if (element instanceof HTMLInputElement) {
            if (element.type === "checkbox" || element.type === "radio")
                return element.checked;
            if (element.type === "range" || element.type === "number")
                return element.value === "" ? 0 : Number(element.value);
            return element.value;
        }
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return element.value;
        }
        return element.textContent ?? "";
    };
    const changeScreen = (property, id, value) => {
        const element = elementForId(id);
        if (!element)
            return;
        switch (property) {
            case "text":
                element.textContent = display(value);
                return;
            case "value":
                if (element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element instanceof HTMLSelectElement) {
                    element.value = display(value);
                }
                else if (element instanceof HTMLUListElement) {
                    // Selecting a list value in code updates the visible highlight too,
                    // so opening a note can light up its row in the sidebar.
                    const uid = element.dataset.engNode;
                    if (uid) {
                        // Store the choice even when the list has not rendered its rows yet.
                        // The next render then marks the matching row.
                        selectedListItems.set(uid, value);
                        const items = listValues.get(uid) ?? [];
                        const index = items.findIndex((item) => equal(item, value));
                        if (index >= 0) {
                            Array.from(element.children).forEach((child, childIndex) => {
                                if (!(child instanceof HTMLElement))
                                    return;
                                if (childIndex === index)
                                    child.setAttribute("aria-current", "true");
                                else
                                    child.removeAttribute("aria-current");
                            });
                            const chosen = element.children[index];
                            if (chosen instanceof HTMLElement)
                                chosen.scrollIntoView?.({ block: "nearest" });
                        }
                    }
                }
                return;
            case "background":
                element.style.backgroundColor = colorCss(value);
                return;
            case "text color":
                element.style.color = colorCss(value);
                return;
            case "font size":
                element.style.fontSize = numberPx(value);
                return;
            case "width":
                element.style.width = numberPx(value);
                return;
            case "height":
                element.style.height = numberPx(value);
                return;
            case "rounded corners":
                element.style.borderRadius = numberPx(value);
                return;
            case "padding":
                element.style.padding = numberPx(value);
                return;
            case "margin":
                element.style.margin = numberPx(value);
                return;
            case "border":
                element.style.border = `${numberPx(value)} solid currentColor`;
                return;
            case "opacity":
                element.style.opacity = String(toNumber(value));
                return;
            case "alignment":
                element.style.textAlign = display(value);
                return;
        }
    };
    const labelText = (node) => {
        if (node.label === undefined)
            return "";
        if (isSimpleLiteral(node.label))
            return display(node.label.value);
        return "";
    };
    const isSimpleLiteral = (expression) => {
        if (typeof expression !== "object" || expression === null)
            return false;
        const kind = expression.kind;
        return kind === "text" || kind === "number" || kind === "boolean";
    };
    const renderNode = (node) => {
        if (!node.uid)
            return;
        const element = elementForUid(node.uid);
        if (!element)
            return;
        nodeByUid.set(node.uid, node);
        if (node.id && !elementsById.has(node.id.toLowerCase())) {
            elementsById.set(node.id.toLowerCase(), element);
        }
        if (node.label && !isSimpleLiteral(node.label)) {
            const text = display(evaluate(node.label, globalScope));
            switch (node.element) {
                case "image":
                case "video":
                case "audio":
                    element.src = text;
                    break;
                case "input":
                case "text area":
                case "dropdown":
                case "slider": {
                    const labelElement = element.closest(".eng-field")?.querySelector("label") ??
                        doc.querySelector(`label[for="${element.id}"]`);
                    if (labelElement)
                        labelElement.textContent = text;
                    break;
                }
                case "checkbox":
                case "switch":
                case "radio choice": {
                    const labelElement = element.closest("label")?.querySelector(".eng-check-label");
                    if (labelElement)
                        labelElement.textContent = text;
                    break;
                }
                case "section":
                case "row":
                case "column":
                case "grid":
                case "card": {
                    const labelElement = Array.from(element.children).find((child) => child.classList.contains("eng-label"));
                    if (labelElement)
                        labelElement.textContent = text;
                    break;
                }
                case "tab":
                    element.setAttribute("aria-label", text);
                    break;
                case "list":
                case "table":
                    break;
                default:
                    element.textContent = text;
            }
        }
        if (node.description && !isSimpleLiteral(node.description) && element instanceof HTMLImageElement) {
            element.alt = display(evaluate(node.description, globalScope));
        }
        if (node.element === "list" && node.showing) {
            const value = evaluate(node.showing, globalScope);
            const items = Array.isArray(value) ? value : [];
            const list = element instanceof HTMLUListElement ? element : element.querySelector("ul");
            if (list) {
                const interactive = node.id !== undefined &&
                    handlers.some((handler) => handler.event?.type === "click" &&
                        handler.event.id.toLowerCase() === node.id.toLowerCase());
                const hasSelection = selectedListItems.has(node.uid);
                const selected = selectedListItems.get(node.uid);
                listValues.set(node.uid, items);
                list.classList.toggle("eng-list-interactive", interactive);
                const choose = (index) => {
                    selectedListItems.set(node.uid, items[index]);
                    Array.from(list.children).forEach((child, childIndex) => {
                        if (!(child instanceof HTMLElement))
                            return;
                        if (childIndex === index)
                            child.setAttribute("aria-current", "true");
                        else
                            child.removeAttribute("aria-current");
                    });
                };
                list.replaceChildren(...items.map((item, index) => {
                    const li = doc.createElement("li");
                    li.textContent = listItemLabel(item);
                    // A selection made in code should be visible and readable even when
                    // the list has no click handler.
                    if (hasSelection && equal(selected, item))
                        li.setAttribute("aria-current", "true");
                    if (interactive) {
                        li.tabIndex = 0;
                        li.setAttribute("role", "button");
                        li.addEventListener("click", () => choose(index));
                        li.addEventListener("keydown", (keyboardEvent) => {
                            const key = keyboardEvent.key;
                            if (key !== "Enter" && key !== " ")
                                return;
                            keyboardEvent.preventDefault();
                            li.click();
                        });
                    }
                    return li;
                }));
            }
        }
        if (node.element === "table" && node.showing) {
            renderTable(element, node);
        }
        if (node.element === "dropdown" && node.choices && node.choices.length > 0 && element instanceof HTMLSelectElement) {
            const labels = node.choices.map((choice) => isSimpleLiteral(choice) ? display(choice.value) : display(evaluate(choice, globalScope)));
            const current = element.value;
            if (element.options.length !== labels.length || labels.some((label, index) => element.options[index]?.value !== label)) {
                element.replaceChildren(...labels.map((label) => {
                    const option = doc.createElement("option");
                    option.value = label;
                    option.textContent = label;
                    return option;
                }));
                element.value = current;
            }
        }
        if (node.element === "input" || node.element === "text area" || node.element === "slider") {
            if (node.starting && !initialized.has(node.uid)) {
                initialized.add(node.uid);
                const value = evaluate(node.starting, globalScope);
                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                    element.value = display(value);
                }
            }
        }
        if (node.element === "checkbox" || node.element === "switch") {
            if (node.starting && !initialized.has(node.uid) && element instanceof HTMLInputElement) {
                initialized.add(node.uid);
                element.checked = truthy(evaluate(node.starting, globalScope));
            }
        }
        for (const child of node.children ?? [])
            renderNode(child);
    };
    const renderTable = (element, node) => {
        const value = evaluate(node.showing, globalScope);
        const rows = Array.isArray(value) ? value : [];
        const body = element.querySelector("tbody");
        if (!body)
            return;
        const columns = (node.columns ?? [])
            .map((column) => isSimpleLiteral(column) ? display(column.value) : display(evaluate(column, globalScope)))
            .filter((column) => column.length > 0);
        const first = rows[0];
        const inferred = columns.length > 0
            ? columns
            : typeof first === "object" && first !== null
                ? Object.keys(first).filter((key) => !key.startsWith("__"))
                : [];
        const head = element.querySelector("thead");
        if (head) {
            const tr = doc.createElement("tr");
            for (const column of inferred) {
                const th = doc.createElement("th");
                th.scope = "col";
                th.textContent = column;
                tr.append(th);
            }
            head.replaceChildren(tr);
            head.hidden = inferred.length === 0;
        }
        body.replaceChildren(...rows.map((row) => {
            const tr = doc.createElement("tr");
            for (const column of inferred) {
                const td = doc.createElement("td");
                const record = row;
                td.textContent = display(record?.[column]);
                tr.append(td);
            }
            return tr;
        }));
    };
    const render = () => {
        for (const page of definition.pages) {
            for (const node of page.body)
                renderNode(node);
        }
    };
    // -------------------------------------------------------------------- toasts
    const toast = (message) => {
        let region = doc.getElementById("eng-toasts");
        if (!region) {
            region = doc.createElement("div");
            region.id = "eng-toasts";
            region.setAttribute("role", "status");
            region.setAttribute("aria-live", "polite");
            root.append(region);
        }
        const item = doc.createElement("p");
        item.className = "eng-toast";
        item.textContent = message;
        region.append(item);
        window.setTimeout(() => item.remove(), 4000);
    };
    // ------------------------------------------------------------------- routing
    const pageSections = () => Array.from(root.querySelectorAll("[data-page]"));
    const showPage = (name) => {
        const target = slug(name);
        const sections = pageSections();
        const found = sections.find((section) => section.dataset.page === target);
        if (!found)
            return;
        currentPage = target;
        for (const section of sections) {
            section.hidden = section !== found;
        }
        root.dataset.page = target;
        runPageOpenHandlers(name);
        found.scrollIntoView?.({ block: "start" });
    };
    const route = () => {
        const hash = window.location.hash.replace(/^#\/?/, "");
        if (hash.length === 0) {
            const first = definition.pages[0];
            if (first) {
                window.history.replaceState(null, "", `#/${slug(first.name)}`);
                showPage(first.name);
            }
            return;
        }
        const page = definition.pages.find((item) => slug(item.name) === hash);
        if (page)
            showPage(page.name);
    };
    // -------------------------------------------------------------------- events
    const runHandler = (statement) => {
        void (async () => {
            try {
                await runBlockAsync(statement.body, globalScope);
                render();
            }
            catch (error) {
                reportError(error);
            }
        })();
    };
    const runPageOpenHandlers = (pageName) => {
        for (const handler of handlers) {
            if (handler.event?.type !== "page-open")
                continue;
            if (handler.event.page && slug(handler.event.page) !== slug(pageName))
                continue;
            runHandler(handler);
        }
    };
    const reportError = (error) => {
        const message = error instanceof Error ? error.message : String(error);
        toast(`Something went wrong: ${message}`);
        if (options.development)
            console.error(error);
    };
    const bindEvents = () => {
        for (const handler of handlers) {
            const event = handler.event ?? {};
            switch (event.type) {
                case "click": {
                    elementForId(event.id)?.addEventListener("click", (clickEvent) => {
                        const target = clickEvent.target;
                        if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement)
                            clickEvent.preventDefault();
                        runHandler(handler);
                    });
                    break;
                }
                case "submit": {
                    const form = elementForId(event.id);
                    form?.addEventListener("submit", (submitEvent) => {
                        submitEvent.preventDefault();
                        runHandler(handler);
                    });
                    break;
                }
                case "change":
                    elementForId(event.id)?.addEventListener("change", () => runHandler(handler));
                    break;
                case "typing":
                    elementForId(event.id)?.addEventListener("input", () => runHandler(handler));
                    break;
                case "hover":
                case "mouse-enter":
                    elementForId(event.id)?.addEventListener("mouseenter", () => runHandler(handler));
                    break;
                case "mouse-leave":
                    elementForId(event.id)?.addEventListener("mouseleave", () => runHandler(handler));
                    break;
                case "key":
                    window.addEventListener("keydown", (keyEvent) => {
                        if (keyEvent.key.toLowerCase() === String(event.key).toLowerCase())
                            runHandler(handler);
                    });
                    break;
                case "resize":
                    window.addEventListener("resize", () => runHandler(handler));
                    break;
                case "page-open":
                    break;
            }
        }
        window.addEventListener("keydown", (event) => pressedKeys.add(event.key.toLowerCase()));
        window.addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));
        window.addEventListener("blur", () => pressedKeys.clear());
        window.addEventListener("keydown", (event) => {
            if (event.key !== "Escape")
                return;
            for (const dialog of Array.from(root.querySelectorAll("dialog[open]"))) {
                dialog.close();
            }
        });
        window.addEventListener("hashchange", route);
    };
    const startTimers = () => {
        for (const timer of timers) {
            if (timer.frame) {
                const tick = () => {
                    if (document.hidden) {
                        frameHandle = window.requestAnimationFrame(tick);
                        return;
                    }
                    void (async () => {
                        try {
                            await runBlockAsync(timer.body, globalScope);
                            render();
                        }
                        catch (error) {
                            reportError(error);
                        }
                        frameHandle = window.requestAnimationFrame(tick);
                    })();
                };
                frameHandle = window.requestAnimationFrame(tick);
            }
            else {
                const milliseconds = Math.max(16, Number(timer.seconds ?? 1) * 1000);
                const handle = window.setInterval(() => {
                    try {
                        void runBlockAsync(timer.body, globalScope).then(render);
                    }
                    catch (error) {
                        reportError(error);
                    }
                }, milliseconds);
                intervalHandles.push(handle);
            }
        }
    };
    // --------------------------------------------------------------------- theme
    const setupTheme = () => {
        let saved = null;
        try {
            saved = window.localStorage.getItem("engcode:theme");
        }
        catch {
            saved = null;
        }
        if (saved === "dark" || saved === "light") {
            doc.documentElement.dataset.theme = saved;
        }
        const isDark = () => {
            const theme = doc.documentElement.dataset.theme;
            if (theme)
                return theme === "dark";
            return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        };
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "eng-theme-toggle";
        button.setAttribute("aria-label", "Switch between light and dark mode");
        const syncLabel = () => {
            button.textContent = isDark() ? "Light mode" : "Dark mode";
            button.title = isDark() ? "Switch to light mode" : "Switch to dark mode";
        };
        syncLabel();
        button.addEventListener("click", () => {
            const next = isDark() ? "light" : "dark";
            doc.documentElement.dataset.theme = next;
            try {
                window.localStorage.setItem("engcode:theme", next);
            }
            catch {
                // Ignore storage errors.
            }
            syncLabel();
        });
        root.prepend(button);
    };
    // --------------------------------------------------------------------- start
    const collectElements = (nodes) => {
        for (const node of nodes) {
            if (node.uid) {
                const element = root.querySelector(`[data-eng-node="${node.uid}"]`);
                if (element) {
                    elementsByUid.set(node.uid, element);
                    nodeByUid.set(node.uid, node);
                }
                if (node.id) {
                    const byId = element ?? root.querySelector(`[data-eng-id="${node.id}"]`);
                    if (byId)
                        elementsById.set(node.id.toLowerCase(), byId);
                }
            }
            collectElements(node.children ?? []);
        }
    };
    for (const page of definition.pages)
        collectElements(page.body);
    // Also map any element with an id in the markup, even when it is not part of
    // the collected node tree (for example, content added by a component).
    for (const element of Array.from(root.querySelectorAll("[data-eng-id]"))) {
        const id = element.dataset.engId;
        if (id && !elementsById.has(id.toLowerCase())) {
            elementsById.set(id.toLowerCase(), element);
        }
    }
    for (const statement of definition.body) {
        if (statement.kind === "app" ||
            statement.kind === "style" ||
            statement.kind === "theme") {
            continue;
        }
        if (statement.kind === "when") {
            handlers.push(statement);
            continue;
        }
        if (statement.kind === "every") {
            timers.push(statement);
            continue;
        }
        try {
            exec(statement, globalScope);
        }
        catch (error) {
            reportError(error);
        }
    }
    bindEvents();
    render();
    setupTheme();
    route();
    if (options.startTimers !== false)
        startTimers();
    // Keep the reference so consumers can cancel a frame loop during tests.
    window.__engcodeFrame = frameHandle;
    return () => {
        for (const handle of intervalHandles)
            window.clearInterval(handle);
        intervalHandles.length = 0;
        if (frameHandle)
            window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
    };
}
export default startApp;
//# sourceMappingURL=web-runtime.js.map