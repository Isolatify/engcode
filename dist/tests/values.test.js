import test from "node:test";
import assert from "node:assert/strict";
import { BuiltinValue, Env, FunctionValue, ListValue, ObjectValue, TableValue, deepEqual, display, formatNumber, fromPlain, isFunction, isList, isTable, toPlain, typeName, } from "../src/values.js";
test("names every value type", () => {
    assert.equal(typeName(null), "nothing");
    assert.equal(typeName(1), "a number");
    assert.equal(typeName("hi"), "text");
    assert.equal(typeName(true), "yes or no");
    assert.equal(typeName(new ListValue([])), "a list");
    assert.equal(typeName(new TableValue()), "a table");
    assert.equal(typeName(new FunctionValue("f", [], [], new Env())), "a function");
    assert.equal(typeName(new BuiltinValue("b", () => null)), "a built-in function");
    assert.equal(typeName(new ObjectValue("cat")), "a cat");
});
test("formats numbers without floating point noise", () => {
    assert.equal(formatNumber(3), "3");
    assert.equal(formatNumber(0.1 + 0.2), "0.3");
    assert.equal(formatNumber(-0), "0");
    assert.equal(formatNumber(Number.NaN), "not a number");
    assert.equal(formatNumber(Infinity), "infinity");
    assert.equal(formatNumber(-Infinity), "-infinity");
});
test("displays every value type for people", () => {
    assert.equal(display("hi"), "hi");
    assert.equal(display(2.5), "2.5");
    assert.equal(display(true), "yes");
    assert.equal(display(false), "no");
    assert.equal(display(null), "nothing");
    assert.equal(display(new ListValue([1, "a", null])), '[1, "a", nothing]');
    assert.equal(display(new TableValue(new Map([["age", 2]]))), "{age: 2}");
    assert.equal(display(new TableValue(new Map([["home address", "x"]]))), '{"home address": "x"}');
    assert.equal(display(new FunctionValue("greet", [], [], new Env())), "a function called greet");
    assert.equal(display(new FunctionValue("", [], [], new Env())), "a function");
    assert.equal(display(new BuiltinValue("round", () => 0)), "the built-in round");
    assert.equal(display(new ObjectValue("cat")), "a cat");
});
test("compares lists, tables, and objects deeply", () => {
    assert.equal(deepEqual(1, 1), true);
    assert.equal(deepEqual(1, 2), false);
    assert.equal(deepEqual(new ListValue([1, new ListValue([2])]), new ListValue([1, new ListValue([2])])), true);
    assert.equal(deepEqual(new ListValue([1]), new ListValue([1, 2])), false);
    assert.equal(deepEqual(new TableValue(new Map([["a", 1]])), new TableValue(new Map([["a", 1]]))), true);
    assert.equal(deepEqual(new TableValue(new Map([["a", 1]])), new TableValue(new Map([["b", 1]]))), false);
    assert.equal(deepEqual(new TableValue(new Map([["a", 1]])), new TableValue(new Map([["a", 2]]))), false);
    assert.equal(deepEqual(new ObjectValue("cat", new Map([["legs", 4]])), new ObjectValue("cat", new Map([["legs", 4]]))), true);
    assert.equal(deepEqual(new ObjectValue("cat"), new ObjectValue("dog")), false);
});
test("converts values to plain data and back", () => {
    const value = new TableValue(new Map([
        ["name", "Sam"],
        ["items", new ListValue([1, true, null])],
        ["nested", new TableValue(new Map([["ok", true]]))],
    ]));
    const plain = toPlain(value);
    assert.deepEqual(plain, {
        name: "Sam",
        items: [1, true, null],
        nested: { ok: true },
    });
    const roundTrip = fromPlain(plain);
    assert.ok(roundTrip instanceof TableValue);
    assert.equal(roundTrip.entries.get("name"), "Sam");
    assert.equal(fromPlain(undefined), null);
    assert.equal(fromPlain(1), 1);
});
test("recognizes collection and function values", () => {
    assert.equal(isList(new ListValue([])), true);
    assert.equal(isList(1), false);
    assert.equal(isTable(new TableValue()), true);
    assert.equal(isTable("x"), false);
    assert.equal(isFunction(new FunctionValue("f", [], [], new Env())), true);
    assert.equal(isFunction(new BuiltinValue("b", () => 0)), true);
    assert.equal(isFunction(undefined), false);
});
test("stores and updates names in nested environments", () => {
    const outer = new Env();
    outer.define("x", 1);
    const inner = new Env(outer);
    inner.define("y", 2);
    assert.equal(inner.get("x"), 1);
    assert.equal(inner.get("y"), 2);
    assert.equal(inner.has("missing"), false);
    assert.equal(inner.assign("x", 5), true);
    assert.equal(outer.get("x"), 5);
    assert.equal(inner.assign("missing", 1), false);
    assert.deepEqual(inner.allNames().sort(), ["x", "y"]);
});
//# sourceMappingURL=values.test.js.map