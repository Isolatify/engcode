import type { Expression, Parameter, Statement } from "./ast.js";

export class ListValue {
  readonly kind = "list";
  constructor(public items: Value[]) {}
}

export class TableValue {
  readonly kind = "table";
  constructor(public entries: Map<string, Value> = new Map()) {}
}

export class FunctionValue {
  readonly kind = "function";
  constructor(
    public readonly name: string,
    public readonly params: Parameter[],
    public readonly body: Statement[],
    public readonly closure: Env,
    public readonly expressionBody?: Expression,
  ) {}
}

export class ObjectValue {
  readonly kind = "object";
  constructor(
    public readonly kindName: string,
    public readonly fields: Map<string, Value> = new Map(),
    public readonly kindDef: KindValue | null = null,
  ) {}
}

export class BuiltinValue {
  readonly kind = "builtin";
  constructor(
    public readonly name: string,
    public readonly call: (args: Value[]) => Value,
  ) {}
}

export class KindValue {
  readonly kind = "kind";
  constructor(
    public readonly name: string,
    public readonly fields: string[],
    public readonly methods: Map<string, FunctionValue>,
  ) {}
}

export class BoundMethodValue {
  readonly kind = "bound-method";
  constructor(
    public readonly object: ObjectValue,
    public readonly fn: FunctionValue,
  ) {}
}

export type Value =
  | number
  | string
  | boolean
  | null
  | ListValue
  | TableValue
  | FunctionValue
  | ObjectValue
  | BuiltinValue
  | KindValue
  | BoundMethodValue;

export class Env {
  private readonly vars = new Map<string, Value>();
  /** Fields of the object whose method is running, if any. */
  public self: ObjectValue | null = null;

  constructor(public readonly parent: Env | null = null) {}

  define(name: string, value: Value): void {
    this.vars.set(name, value);
  }

  lookup(name: string): { found: boolean; value: Value } {
    if (this.vars.has(name)) {
      return { found: true, value: this.vars.get(name)! };
    }
    if (this.self && this.self.fields.has(name)) {
      return { found: true, value: this.self.fields.get(name)! };
    }
    if (this.parent) return this.parent.lookup(name);
    return { found: false, value: null };
  }

  get(name: string): Value | undefined {
    const result = this.lookup(name);
    return result.found ? result.value : undefined;
  }

  has(name: string): boolean {
    return this.lookup(name).found;
  }

  assign(name: string, value: Value): boolean {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return true;
    }
    if (this.self && this.self.fields.has(name)) {
      this.self.fields.set(name, value);
      return true;
    }
    if (this.parent) return this.parent.assign(name, value);
    return false;
  }

  localNames(): string[] {
    const names = new Set(this.vars.keys());
    if (this.self) for (const name of this.self.fields.keys()) names.add(name);
    return [...names];
  }

  allNames(): string[] {
    const names = new Set(this.localNames());
    if (this.parent) for (const name of this.parent.allNames()) names.add(name);
    return [...names];
  }

  clear(): void {
    this.vars.clear();
    this.self = null;
  }
}

export function isList(value: Value): value is ListValue {
  return value instanceof ListValue;
}

export function isTable(value: Value): value is TableValue {
  return value instanceof TableValue;
}

export function isFunction(value: Value | undefined): value is FunctionValue | BuiltinValue | BoundMethodValue {
  return (
    value instanceof FunctionValue ||
    value instanceof BuiltinValue ||
    value instanceof BoundMethodValue
  );
}

export function typeName(value: Value): string {
  if (value === null) return "nothing";
  if (typeof value === "number") return "a number";
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "yes or no";
  if (value instanceof ListValue) return "a list";
  if (value instanceof TableValue) return "a table";
  if (value instanceof FunctionValue) return "a function";
  if (value instanceof BuiltinValue) return "a built-in function";
  if (value instanceof BoundMethodValue) return "a method";
  if (value instanceof KindValue) return "a kind";
  if (value instanceof ObjectValue) return `a ${value.kindName}`;
  return "a value";
}

export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "not a number";
  if (value === Infinity) return "infinity";
  if (value === -Infinity) return "-infinity";
  const normalized = Object.is(value, -0) ? 0 : value;
  if (Number.isInteger(normalized)) return String(normalized);
  const clean = Number.parseFloat(normalized.toPrecision(12));
  return String(clean);
}

function displayKey(key: string): string {
  return /[\s"]/u.test(key) ? JSON.stringify(key) : key;
}

function nested(value: Value): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof ListValue) {
    return `[${value.items.map(nested).join(", ")}]`;
  }
  if (value instanceof TableValue) {
    return `{${[...value.entries]
      .map(([key, entry]) => `${displayKey(key)}: ${nested(entry)}`)
      .join(", ")}}`;
  }
  if (value instanceof FunctionValue) return value.name ? `a function called ${value.name}` : "a function";
  if (value instanceof BuiltinValue) return `the built-in ${value.name}`;
  if (value instanceof BoundMethodValue) return `the method ${value.fn.name}`;
  if (value instanceof KindValue) return `the kind ${value.name}`;
  if (value instanceof ObjectValue) return `a ${value.kindName}`;
  if (value === null) return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

export function display(value: Value): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null) return "nothing";
  if (value instanceof ListValue) return `[${value.items.map(nested).join(", ")}]`;
  if (value instanceof TableValue) {
    return `{${[...value.entries]
      .map(([key, entry]) => `${displayKey(key)}: ${nested(entry)}`)
      .join(", ")}}`;
  }
  if (value instanceof FunctionValue) return value.name ? `a function called ${value.name}` : "a function";
  if (value instanceof BuiltinValue) return `the built-in ${value.name}`;
  if (value instanceof BoundMethodValue) return `the method ${value.fn.name}`;
  if (value instanceof KindValue) return `the kind ${value.name}`;
  if (value instanceof ObjectValue) return `a ${value.kindName}`;
  return String(value);
}

export function deepEqual(left: Value, right: Value): boolean {
  if (left === right) return true;
  if (typeof left === "number" && typeof right === "number") return left === right;
  if (left instanceof ListValue && right instanceof ListValue) {
    if (left.items.length !== right.items.length) return false;
    return left.items.every((item, index) => deepEqual(item, right.items[index]!));
  }
  if (left instanceof TableValue && right instanceof TableValue) {
    if (left.entries.size !== right.entries.size) return false;
    for (const [key, value] of left.entries) {
      if (!right.entries.has(key)) return false;
      if (!deepEqual(value, right.entries.get(key)!)) return false;
    }
    return true;
  }
  if (left instanceof ObjectValue && right instanceof ObjectValue) {
    if (left.kindName !== right.kindName || left.fields.size !== right.fields.size) return false;
    for (const [key, value] of left.fields) {
      if (!right.fields.has(key)) return false;
      if (!deepEqual(value, right.fields.get(key)!)) return false;
    }
    return true;
  }
  return false;
}

export function toPlain(value: Value): unknown {
  if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof ListValue) return value.items.map(toPlain);
  if (value instanceof TableValue) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of value.entries) result[key] = toPlain(entry);
    return result;
  }
  if (value instanceof ObjectValue) {
    const result: Record<string, unknown> = { kind: value.kindName };
    for (const [key, entry] of value.fields) result[key] = toPlain(entry);
    return result;
  }
  return String(display(value));
}

export function fromPlain(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return new ListValue(value.map(fromPlain));
  if (typeof value === "object") {
    const table = new TableValue();
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      table.entries.set(key, fromPlain(entry));
    }
    return table;
  }
  return String(value);
}

export function valueToText(value: Value): string {
  return display(value);
}
