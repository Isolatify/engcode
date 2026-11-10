import test from "node:test";
import assert from "node:assert/strict";
import { ParseError } from "../src/diagnostics.js";
import { parse } from "./helpers.js";

test("parses a say statement", () => {
  const program = parse('say "Hello"');
  assert.equal(program.body.length, 1);
  const statement = program.body[0] as any;
  assert.equal(statement.kind, "say");
  assert.equal(statement.value.kind, "text");
  assert.equal(statement.value.value, "Hello");
});

test("gives times higher precedence than plus", () => {
  const program = parse("set x to 2 plus 3 times 4");
  const value = (program.body[0] as any).value;
  assert.equal(value.kind, "binary");
  assert.equal(value.operator, "plus");
  assert.equal(value.right.kind, "binary");
  assert.equal(value.right.operator, "times");
});

test("parentheses regroup an expression", () => {
  const program = parse("set x to (2 plus 3) times 4");
  const value = (program.body[0] as any).value;
  assert.equal(value.operator, "times");
  assert.equal(value.left.operator, "plus");
});

test("parses comparisons joined with and", () => {
  const program = parse("if age is at least 18 and age is less than 65:\n    say 1\nend");
  const condition = (program.body[0] as any).branches[0].condition;
  assert.equal(condition.kind, "binary");
  assert.equal(condition.operator, "and");
  assert.equal(condition.left.kind, "comparison");
  assert.equal(condition.left.operator, "at least");
  assert.equal(condition.right.operator, "less than");
});

test("parses is between and still allows an outer and", () => {
  const program = parse("if age is between 13 and 19 and name is empty:\n    say 1\nend");
  const condition = (program.body[0] as any).branches[0].condition;
  assert.equal(condition.operator, "and");
  assert.equal(condition.left.operator, "between");
  assert.equal(condition.left.right.length, 2);
});

test("parses not around a comparison", () => {
  const program = parse("if not name is empty:\n    say 1\nend");
  const condition = (program.body[0] as any).branches[0].condition;
  assert.equal(condition.kind, "unary");
  assert.equal(condition.operator, "not");
  assert.equal(condition.operand.kind, "comparison");
});

test("parses otherwise if and otherwise", () => {
  const program = parse(
    [
      "if age is greater than 17:",
      '    say "adult"',
      "otherwise if age is 17:",
      '    say "almost"',
      "otherwise:",
      '    say "minor"',
      "end",
    ].join("\n"),
  );
  const statement = program.body[0] as any;
  assert.equal(statement.kind, "if");
  assert.equal(statement.branches.length, 2);
  assert.ok(statement.otherwise);
  assert.equal(statement.otherwise.length, 1);
});

test("parses repeat with a times delimiter", () => {
  const program = parse('repeat 5 times:\n    say "hi"\nend');
  const statement = program.body[0] as any;
  assert.equal(statement.kind, "repeat");
  assert.equal(statement.count.kind, "number");
  assert.equal(statement.body.length, 1);
});

test("parses count with a renamed counter", () => {
  const program = parse("count from 1 to 3 as number:\n    say number\nend");
  const statement = program.body[0] as any;
  assert.equal(statement.kind, "count");
  assert.equal(statement.name, "number");
});

test("parses function parameters and defaults", () => {
  const program = parse(
    'define welcome with name and greeting default "Hello":\n    say greeting\nend',
  );
  const statement = program.body[0] as any;
  assert.equal(statement.kind, "define");
  assert.equal(statement.name, "welcome");
  assert.equal(statement.params.length, 2);
  assert.equal(statement.params[0].name, "name");
  assert.equal(statement.params[1].defaultValue.value, "Hello");
});

test("parses an anonymous function with that gives back", () => {
  const program = parse("set double to a function with x that gives back x times 2");
  const value = (program.body[0] as any).value;
  assert.equal(value.kind, "function");
  assert.equal(value.params[0].name, "x");
  assert.equal(value.expressionBody.kind, "binary");
});

test("separates function arguments with and", () => {
  const program = parse("define add with a and b:\n    give back a plus b\nend\nsay add 2 and 3");
  const call = (program.body[1] as any).value;
  assert.equal(call.kind, "call");
  assert.equal(call.name, "add");
  assert.equal(call.args.length, 2);
});

test("parses list and table literals", () => {
  const program = parse(
    'set fruits to a list of "apple", "banana" and "cherry"\nset person to a table with name "Sam", age 25',
  );
  const list = (program.body[0] as any).value;
  assert.equal(list.kind, "list");
  assert.equal(list.items.length, 3);
  const table = (program.body[1] as any).value;
  assert.equal(table.kind, "table");
  assert.equal(table.entries.length, 2);
  assert.equal(table.entries[0].key, "name");
});

test("parses ask and ask for a number", () => {
  const program = parse(
    'ask "Name?" and save it as name\nask for a number "Age?" and save it as age',
  );
  assert.equal((program.body[0] as any).number, false);
  assert.equal((program.body[0] as any).name, "name");
  assert.equal((program.body[1] as any).number, true);
  assert.equal((program.body[1] as any).name, "age");
});

test("treats add with to as a mutation", () => {
  const program = parse("set fruits to an empty list\nadd \"mango\" to fruits");
  assert.equal((program.body[1] as any).kind, "add");
});

test("treats add without to as a function call", () => {
  const program = parse("define add with a and b:\n    give back a plus b\nend\nsay add 2 and 3");
  const call = (program.body[1] as any).value;
  assert.equal(call.kind, "call");
  assert.equal(call.args.length, 2);
});

test("parses property assignment", () => {
  const program = parse("set person to an empty table\nset person's age to 26");
  const target = (program.body[1] as any).target;
  assert.equal(target.kind, "property");
  assert.equal(target.key, "age");
  assert.equal(target.base.kind, "variable");
});

test("parses multi-word names that look like keywords", () => {
  const program = parse("set is happy to yes\nif is happy is yes:\n    say 1\nend");
  assert.equal((program.body[0] as any).target.name, "is happy");
  const condition = (program.body[1] as any).branches[0].condition;
  assert.equal(condition.left.name, "is happy");
});

test("parses random number from to", () => {
  const program = parse("set secret to random number from 1 to 100");
  const value = (program.body[0] as any).value;
  assert.equal(value.kind, "builtin");
  assert.equal(value.name, "random number");
  assert.equal(value.args.length, 2);
});

test("rejects chained comparisons with a suggestion", () => {
  assert.throws(
    () => parse("if a is b is c:\n    say 1\nend"),
    (error: unknown) => {
      assert.ok(error instanceof ParseError);
      assert.match(error.diagnostic.message, /cannot be chained/);
      assert.match(error.diagnostic.suggestion ?? "", /and/);
      return true;
    },
  );
});

test("reports a missing end", () => {
  assert.throws(
    () => parse('repeat 2 times:\n    say "hi"'),
    (error: unknown) =>
      error instanceof ParseError && /expected "end"/.test(error.diagnostic.message),
  );
});

test("rejects an extra end", () => {
  assert.throws(
    () => parse('say "hi"\nend'),
    (error: unknown) =>
      error instanceof ParseError && /extra "end"/.test(error.diagnostic.message),
  );
});
