export class ListValue {
    items;
    kind = "list";
    constructor(items) {
        this.items = items;
    }
}
export class TableValue {
    entries;
    kind = "table";
    constructor(entries = new Map()) {
        this.entries = entries;
    }
}
export class FunctionValue {
    name;
    params;
    body;
    closure;
    expressionBody;
    kind = "function";
    constructor(name, params, body, closure, expressionBody) {
        this.name = name;
        this.params = params;
        this.body = body;
        this.closure = closure;
        this.expressionBody = expressionBody;
    }
}
export class ObjectValue {
    kindName;
    fields;
    kindDef;
    kind = "object";
    constructor(kindName, fields = new Map(), kindDef = null) {
        this.kindName = kindName;
        this.fields = fields;
        this.kindDef = kindDef;
    }
}
export class BuiltinValue {
    name;
    call;
    kind = "builtin";
    constructor(name, call) {
        this.name = name;
        this.call = call;
    }
}
export class KindValue {
    name;
    fields;
    methods;
    kind = "kind";
    constructor(name, fields, methods) {
        this.name = name;
        this.fields = fields;
        this.methods = methods;
    }
}
export class BoundMethodValue {
    object;
    fn;
    kind = "bound-method";
    constructor(object, fn) {
        this.object = object;
        this.fn = fn;
    }
}
export class Env {
    parent;
    vars = new Map();
    /** Fields of the object whose method is running, if any. */
    self = null;
    constructor(parent = null) {
        this.parent = parent;
    }
    define(name, value) {
        this.vars.set(name, value);
    }
    lookup(name) {
        if (this.vars.has(name)) {
            return { found: true, value: this.vars.get(name) };
        }
        if (this.self && this.self.fields.has(name)) {
            return { found: true, value: this.self.fields.get(name) };
        }
        if (this.parent)
            return this.parent.lookup(name);
        return { found: false, value: null };
    }
    get(name) {
        const result = this.lookup(name);
        return result.found ? result.value : undefined;
    }
    has(name) {
        return this.lookup(name).found;
    }
    assign(name, value) {
        if (this.vars.has(name)) {
            this.vars.set(name, value);
            return true;
        }
        if (this.self && this.self.fields.has(name)) {
            this.self.fields.set(name, value);
            return true;
        }
        if (this.parent)
            return this.parent.assign(name, value);
        return false;
    }
    localNames() {
        const names = new Set(this.vars.keys());
        if (this.self)
            for (const name of this.self.fields.keys())
                names.add(name);
        return [...names];
    }
    allNames() {
        const names = new Set(this.localNames());
        if (this.parent)
            for (const name of this.parent.allNames())
                names.add(name);
        return [...names];
    }
    clear() {
        this.vars.clear();
        this.self = null;
    }
}
export function isList(value) {
    return value instanceof ListValue;
}
export function isTable(value) {
    return value instanceof TableValue;
}
export function isFunction(value) {
    return (value instanceof FunctionValue ||
        value instanceof BuiltinValue ||
        value instanceof BoundMethodValue);
}
export function typeName(value) {
    if (value === null)
        return "nothing";
    if (typeof value === "number")
        return "a number";
    if (typeof value === "string")
        return "text";
    if (typeof value === "boolean")
        return "yes or no";
    if (value instanceof ListValue)
        return "a list";
    if (value instanceof TableValue)
        return "a table";
    if (value instanceof FunctionValue)
        return "a function";
    if (value instanceof BuiltinValue)
        return "a built-in function";
    if (value instanceof BoundMethodValue)
        return "a method";
    if (value instanceof KindValue)
        return "a kind";
    if (value instanceof ObjectValue)
        return `a ${value.kindName}`;
    return "a value";
}
export function formatNumber(value) {
    if (Number.isNaN(value))
        return "not a number";
    if (value === Infinity)
        return "infinity";
    if (value === -Infinity)
        return "-infinity";
    const normalized = Object.is(value, -0) ? 0 : value;
    if (Number.isInteger(normalized))
        return String(normalized);
    const clean = Number.parseFloat(normalized.toPrecision(12));
    return String(clean);
}
function displayKey(key) {
    return /[\s"]/u.test(key) ? JSON.stringify(key) : key;
}
function nested(value) {
    if (typeof value === "string")
        return JSON.stringify(value);
    if (value instanceof ListValue) {
        return `[${value.items.map(nested).join(", ")}]`;
    }
    if (value instanceof TableValue) {
        return `{${[...value.entries]
            .map(([key, entry]) => `${displayKey(key)}: ${nested(entry)}`)
            .join(", ")}}`;
    }
    if (value instanceof FunctionValue)
        return value.name ? `a function called ${value.name}` : "a function";
    if (value instanceof BuiltinValue)
        return `the built-in ${value.name}`;
    if (value instanceof BoundMethodValue)
        return `the method ${value.fn.name}`;
    if (value instanceof KindValue)
        return `the kind ${value.name}`;
    if (value instanceof ObjectValue)
        return `a ${value.kindName}`;
    if (value === null)
        return "nothing";
    if (typeof value === "boolean")
        return value ? "yes" : "no";
    if (typeof value === "number")
        return formatNumber(value);
    return String(value);
}
export function display(value) {
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return formatNumber(value);
    if (typeof value === "boolean")
        return value ? "yes" : "no";
    if (value === null)
        return "nothing";
    if (value instanceof ListValue)
        return `[${value.items.map(nested).join(", ")}]`;
    if (value instanceof TableValue) {
        return `{${[...value.entries]
            .map(([key, entry]) => `${displayKey(key)}: ${nested(entry)}`)
            .join(", ")}}`;
    }
    if (value instanceof FunctionValue)
        return value.name ? `a function called ${value.name}` : "a function";
    if (value instanceof BuiltinValue)
        return `the built-in ${value.name}`;
    if (value instanceof BoundMethodValue)
        return `the method ${value.fn.name}`;
    if (value instanceof KindValue)
        return `the kind ${value.name}`;
    if (value instanceof ObjectValue)
        return `a ${value.kindName}`;
    return String(value);
}
export function deepEqual(left, right) {
    if (left === right)
        return true;
    if (typeof left === "number" && typeof right === "number")
        return left === right;
    if (left instanceof ListValue && right instanceof ListValue) {
        if (left.items.length !== right.items.length)
            return false;
        return left.items.every((item, index) => deepEqual(item, right.items[index]));
    }
    if (left instanceof TableValue && right instanceof TableValue) {
        if (left.entries.size !== right.entries.size)
            return false;
        for (const [key, value] of left.entries) {
            if (!right.entries.has(key))
                return false;
            if (!deepEqual(value, right.entries.get(key)))
                return false;
        }
        return true;
    }
    if (left instanceof ObjectValue && right instanceof ObjectValue) {
        if (left.kindName !== right.kindName || left.fields.size !== right.fields.size)
            return false;
        for (const [key, value] of left.fields) {
            if (!right.fields.has(key))
                return false;
            if (!deepEqual(value, right.fields.get(key)))
                return false;
        }
        return true;
    }
    return false;
}
export function toPlain(value) {
    if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (value instanceof ListValue)
        return value.items.map(toPlain);
    if (value instanceof TableValue) {
        const result = {};
        for (const [key, entry] of value.entries)
            result[key] = toPlain(entry);
        return result;
    }
    if (value instanceof ObjectValue) {
        const result = { kind: value.kindName };
        for (const [key, entry] of value.fields)
            result[key] = toPlain(entry);
        return result;
    }
    return String(display(value));
}
export function fromPlain(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return new ListValue(value.map(fromPlain));
    if (typeof value === "object") {
        const table = new TableValue();
        for (const [key, entry] of Object.entries(value)) {
            table.entries.set(key, fromPlain(entry));
        }
        return table;
    }
    return String(value);
}
export function valueToText(value) {
    return display(value);
}
//# sourceMappingURL=values.js.map