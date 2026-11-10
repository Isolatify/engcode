import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeError } from "../src/diagnostics.js";
import { parse, runProgram, runSource } from "./helpers.js";
test("says numbers and follows precedence", () => {
    assert.equal(runSource("say 2 plus 3 times 4").output, "14\n");
});
test("joins text with plus", () => {
    assert.equal(runSource('say "Total: " plus 7').output, "Total: 7\n");
});
test("trims floating point noise", () => {
    assert.equal(runSource("say 0.1 plus 0.2").output, "0.3\n");
});
test("sets and changes variables", () => {
    const result = runSource("set age to 25\nchange age to age plus 1\nsay age");
    assert.equal(result.output, "26\n");
});
test("runs if and otherwise", () => {
    const source = [
        "set age to 20",
        "if age is greater than 17:",
        '    say "adult"',
        "otherwise:",
        '    say "minor"',
        "end",
    ].join("\n");
    assert.equal(runSource(source).output, "adult\n");
});
test("repeats a block", () => {
    assert.equal(runSource('repeat 3 times:\n    say "hi"\nend').output, "hi\nhi\nhi\n");
});
test("counts inclusively", () => {
    assert.equal(runSource("count from 1 to 3:\n    say counter\nend").output, "1\n2\n3\n");
});
test("loops over each list item", () => {
    const source = 'set fruits to a list of "apple", "banana"\nfor each fruit in fruits:\n    say fruit\nend';
    assert.equal(runSource(source).output, "apple\nbanana\n");
});
test("loops over the characters of text", () => {
    assert.equal(runSource('for each letter in "abc":\n    say letter\nend').output, "a\nb\nc\n");
});
test("stops and skips inside a loop", () => {
    const source = [
        "set n to 0",
        "repeat 10 times:",
        "    change n to n plus 1",
        "    if n is 3:",
        "        skip to the next one",
        "    end",
        "    if n is 5:",
        "        stop the loop",
        "    end",
        "    say n",
        "end",
    ].join("\n");
    assert.equal(runSource(source).output, "1\n2\n4\n");
});
test("runs a while loop", () => {
    const source = [
        "set lives to 3",
        "while lives is greater than 0:",
        "    say lives",
        "    change lives to lives minus 1",
        "end",
    ].join("\n");
    assert.equal(runSource(source).output, "3\n2\n1\n");
});
test("calls a recursive function", () => {
    const source = [
        "define factorial with n:",
        "    if n is at most 1:",
        "        give back 1",
        "    end",
        "    give back n times factorial n minus 1",
        "end",
        "say factorial 5",
    ].join("\n");
    assert.equal(runSource(source).output, "120\n");
});
test("uses a default parameter", () => {
    const source = [
        "define welcome with name and greeting default \"Hello\":",
        '    say greeting plus ", " plus name',
        "end",
        'welcome "Sam"',
    ].join("\n");
    assert.equal(runSource(source).output, "Hello, Sam\n");
});
test("calls an anonymous function value", () => {
    const source = [
        "set double to a function with x that gives back x times 2",
        "say call double with 21",
    ].join("\n");
    assert.equal(runSource(source).output, "42\n");
});
test("ask saves trimmed text", () => {
    const result = runSource('ask "What is your name?" and save it as name\nsay "Hi " plus name', ["  Sam  "]);
    assert.equal(result.output, "Hi Sam\n");
    assert.deepEqual(result.input.prompts, ["What is your name?"]);
});
test("ask for a number retries until the answer is valid", () => {
    const result = runSource('ask for a number "Age?" and save it as age\nsay age plus 1', ["not a number", "41"]);
    assert.match(result.output, /Please type a number\./);
    assert.match(result.output, /42\n$/);
});
test("builds lists and uses positions from one", () => {
    const source = [
        'set fruits to a list of "apple", "banana"',
        'add "cherry" to fruits',
        "say length of fruits",
        "say item 1 of fruits",
        "say last item of fruits",
    ].join("\n");
    assert.equal(runSource(source).output, "3\napple\ncherry\n");
});
test("removes a list item and prints the list", () => {
    const source = [
        'set fruits to a list of "apple", "banana", "cherry"',
        'remove "banana" from fruits',
        "say fruits",
    ].join("\n");
    assert.equal(runSource(source).output, '["apple", "cherry"]\n');
});
test("reads and changes table entries", () => {
    const source = [
        'set person to a table with name "Sam", age 25',
        "say person's name",
        "set person's age to 26",
        "say person's age",
        "say person's missing",
    ].join("\n");
    assert.equal(runSource(source).output, "Sam\n26\nnothing\n");
});
test("sorts and reverses a list", () => {
    const source = [
        "set nums to a list of 3, 1, 2",
        "sort nums",
        "say nums",
        "reverse nums",
        "say nums",
    ].join("\n");
    assert.equal(runSource(source).output, "[1, 2, 3]\n[3, 2, 1]\n");
});
test("catches a runtime error", () => {
    const source = [
        "try:",
        "    set x to 1 divided by 0",
        "if it fails:",
        "    say the error",
        "end",
    ].join("\n");
    assert.equal(runSource(source).output, "You can't divide by zero.\n");
});
test("uses text built-ins", () => {
    const source = [
        'say uppercase of "hello"',
        'say lowercase of "HI"',
        'say trim of "  hi  "',
        'say replace "a" with "b" in "banana"',
        'say position of "n" in "banana"',
        'say position of "z" in "banana"',
    ].join("\n");
    assert.equal(runSource(source).output, "HELLO\nhi\nhi\nbbnbnb\n3\n0\n");
});
test("splits and joins text", () => {
    const source = 'say join (split "a,b,c" by ",") with "-"';
    assert.equal(runSource(source).output, "a-b-c\n");
});
test("uses math built-ins", () => {
    const source = [
        "say round of 3.6",
        "say absolute value of -4",
        "say square root of 9",
        "say minimum of 2 and 8",
        "say maximum of 2 and 8",
        "say power of 2 and 8",
    ].join("\n");
    assert.equal(runSource(source).output, "4\n4\n3\n2\n8\n256\n");
});
test("uses the injected random source", () => {
    const result = runSource("say random number from 1 to 10", [], () => 0);
    assert.equal(result.output, "1\n");
});
test("compares lists deeply", () => {
    const source = [
        "if (a list of 1, 2) is (a list of 1, 2):",
        '    say "same"',
        "otherwise:",
        '    say "different"',
        "end",
    ].join("\n");
    assert.equal(runSource(source).output, "same\n");
});
test("supports is between", () => {
    assert.equal(runSource('if 15 is between 13 and 19:\n    say "yes"\nend').output, "yes\n");
});
test("supports not", () => {
    assert.equal(runSource('if not "x" is empty:\n    say "yes"\nend').output, "yes\n");
});
test("reports division by zero as a runtime error", () => {
    assert.throws(() => runSource("say 1 divided by 0"), (error) => {
        assert.ok(error instanceof RuntimeError);
        assert.match(error.diagnostic.message, /divide by zero/);
        return true;
    });
});
test("reports a non-boolean condition at runtime", () => {
    const source = [
        "define give with value:",
        "    give back value",
        "end",
        "set x to give 5",
        "if x:",
        "    say 1",
        "end",
    ].join("\n");
    assert.throws(() => runSource(source), (error) => {
        assert.ok(error instanceof RuntimeError);
        assert.match(error.diagnostic.message, /must be yes or no/);
        return true;
    });
});
test("uses rounding, roots, and trigonometry built-ins", () => {
    const source = [
        "say floor of 2.9",
        "say ceiling of 2.1",
        "say sine of 0",
        "say cosine of 0",
        "say tangent of 0",
    ].join("\n");
    assert.equal(runSource(source).output, "2\n3\n0\n1\n0\n");
});
test("converts text to a number", () => {
    assert.equal(runSource('say number from "42"').output, "42\n");
    assert.throws(() => runSource('say number from "many"'), (error) => error instanceof RuntimeError && /can't read/.test(error.diagnostic.message));
});
test("works with JSON", () => {
    const source = [
        'say JSON of a table with name "Sam", age 25',
        'set data to data from JSON "{\\"name\\":\\"Sam\\",\\"age\\":25}"',
        "say data's name",
        "say data's age",
    ].join("\n");
    assert.equal(runSource(source).output, '{"name":"Sam","age":25}\nSam\n25\n');
    assert.throws(() => runSource('say data from JSON "not json"'), (error) => error instanceof RuntimeError && /not valid JSON/.test(error.diagnostic.message));
});
test("reads items from text", () => {
    const source = [
        'say item 2 of "abc"',
        'say item 9 of "abc"',
        'say last item of "abc"',
        'say item 1 of an empty list',
    ].join("\n");
    assert.equal(runSource(source).output, "b\nnothing\nc\nnothing\n");
});
test("picks random items", () => {
    assert.equal(runSource('say random item of a list of "a", "b"', [], () => 0).output, "a\n");
    assert.throws(() => runSource("say random item of an empty list", [], () => 0), (error) => error instanceof RuntimeError && /empty list/.test(error.diagnostic.message));
});
test("splits by characters when the separator is empty", () => {
    assert.equal(runSource('say split "abc" by ""').output, '["a", "b", "c"]\n');
});
test("reads the clock and formats it", () => {
    const source = [
        "say year of now",
        "say month of now",
        "say day of now",
        "say hour of now",
        "say minute of now",
        "say second of now",
        "say format of now with \"YYYY-MM-DD\"",
    ].join("\n");
    const output = runSource(source).output.trim().split("\n");
    assert.equal(output.length, 7);
    assert.match(output[6], /^\d{4}-\d{2}-\d{2}$/);
    assert.match(runSource("say today").output, /^\d{4}-\d{2}-\d{2}\n$/);
});
test("reads pi and the key state", () => {
    const result = runSource('say pi\nsay key "a" is pressed');
    const [piLine, keyLine] = result.output.trim().split("\n");
    assert.ok(Number(piLine) > 3.14 && Number(piLine) < 3.15);
    assert.equal(keyLine, "no");
});
test("sorts descending, shuffles, and reverses text", () => {
    const source = [
        "set nums to a list of 3, 1, 2",
        "sort nums descending",
        "say nums",
        "set word to \"abc\"",
        "reverse word",
        "say word",
    ].join("\n");
    assert.equal(runSource(source, [], () => 0).output, "[3, 2, 1]\ncba\n");
    const shuffled = runSource("set nums to a list of 1, 2, 3\nshuffle nums\nsay nums", [], () => 0);
    assert.equal(shuffled.output, "[2, 3, 1]\n");
});
test("adds to numbers and text", () => {
    const source = [
        "set total to 1",
        "add 2 to total",
        "say total",
        'set word to "a"',
        'add "b" to word',
        "say word",
    ].join("\n");
    assert.equal(runSource(source).output, "3\nab\n");
});
test("removes a table entry", () => {
    const source = [
        "set scores to a table with a 1, b 2",
        'remove "a" from scores',
        "say length of scores",
    ].join("\n");
    assert.equal(runSource(source).output, "1\n");
});
test("reports adding to the wrong type", () => {
    assert.throws(() => runSource("set flag to yes\nadd 1 to flag"), (error) => error instanceof RuntimeError && /can add to a number, text, or a list/.test(error.diagnostic.message));
});
test("reports reading a property from a non-table", () => {
    assert.throws(() => runProgram(parse("set age to 10\nsay age's value")), (error) => error instanceof RuntimeError && /read a property/.test(error.diagnostic.message));
});
test("reports sorting and shuffling a non-list", () => {
    assert.throws(() => runSource("set age to 10\nsort age"), (error) => error instanceof RuntimeError && /needs a list/.test(error.diagnostic.message));
    assert.throws(() => runSource("set age to 10\nshuffle age"), (error) => error instanceof RuntimeError && /needs a list/.test(error.diagnostic.message));
    assert.throws(() => runSource("set age to 10\nreverse age"), (error) => error instanceof RuntimeError && /needs a list or text/.test(error.diagnostic.message));
});
test("reports an empty random range and bad arguments", () => {
    assert.throws(() => runSource("say random number from 1.5 to 2", [], () => 0), (error) => error instanceof RuntimeError && /whole numbers/.test(error.diagnostic.message));
    assert.throws(() => runProgram(parse("say uppercase of 5")), (error) => error instanceof RuntimeError && /expected text/.test(error.diagnostic.message));
});
test("reports a negative square root", () => {
    assert.throws(() => runSource("say square root of -1"), (error) => error instanceof RuntimeError && /negative number/.test(error.diagnostic.message));
});
test("reports taking the remainder with zero", () => {
    assert.throws(() => runSource("say 5 remainder 0"), (error) => error instanceof RuntimeError && /remainder with zero/.test(error.diagnostic.message));
});
test("value of only works inside an app", () => {
    assert.throws(() => runSource("say value of \"name\""), (error) => error instanceof RuntimeError && /only works inside an app/.test(error.diagnostic.message));
});
test("runs a countdown from a higher start that produces nothing", () => {
    assert.equal(runSource("count from 3 to 1:\n    say counter\nend").output, "");
});
//# sourceMappingURL=interpreter.test.js.map