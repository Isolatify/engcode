import test from "node:test";
import assert from "node:assert/strict";
import { runSource } from "./helpers.js";

test("runs a loop with one hundred thousand iterations quickly", () => {
  const source = [
    "set total to 0",
    "repeat 100000 times:",
    "    change total to total plus 1",
    "end",
    "say total",
  ].join("\n");
  const started = process.hrtime.bigint();
  const result = runSource(source);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  assert.equal(result.output, "100000\n");
  assert.ok(elapsedMs < 2000, `loop took ${elapsedMs.toFixed(0)}ms`);
});

test("runs a one million iteration loop under two seconds", () => {
  const source = [
    "set total to 0",
    "repeat 1000000 times:",
    "    change total to total plus 1",
    "end",
    "say total",
  ].join("\n");
  const started = process.hrtime.bigint();
  const result = runSource(source);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  assert.equal(result.output, "1000000\n");
  assert.ok(elapsedMs < 2000, `one million loops took ${elapsedMs.toFixed(0)}ms`);
});
