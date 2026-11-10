import test from "node:test";
import assert from "node:assert/strict";
import { explainStatement } from "../src/explain.js";
import { lex } from "./helpers.js";
const token = lex("say 1")[0];
function statement(kind, extra = {}) {
    return { kind, token, ...extra };
}
test("explain describes the main kinds of statement", () => {
    const samples = [
        [statement("say"), /show a value/],
        [statement("ask", { name: "name" }), /save the answer as "name"/],
        [statement("set", { target: { kind: "variable", name: "age", token } }), /store a value in "age"/],
        [statement("set", { target: { kind: "property", key: "title", token } }), /store a value in "title"/],
        [statement("set", { target: { kind: "list", token } }), /store a value/],
        [statement("change", { target: { kind: "variable", name: "age", token } }), /update a value in "age"/],
        [statement("add", { target: { kind: "variable", name: "items", token } }), /add to a value/],
        [statement("remove", { target: { kind: "variable", name: "items", token } }), /remove from a value/],
        [statement("if"), /choose which branch/],
        [statement("repeat"), /fixed number of times/],
        [statement("for-each", { name: "item" }), /call each one "item"/],
        [statement("count", { name: "number" }), /using "number"/],
        [statement("while"), /condition stays true/],
        [statement("stop"), /leave the nearest loop/],
        [statement("skip"), /next turn/],
        [statement("define", { name: "greet" }), /function "greet"/],
        [statement("give-back"), /return a value/],
        [statement("try"), /handle a failure/],
        [statement("use", { target: "math", isPath: false }), /make "math" available/],
        [statement("use", { target: "helpers.eng", isPath: true }), /load the file "helpers.eng"/],
        [statement("state", { name: "total" }), /keep track of "total"/],
        [statement("call-stmt", { name: "greet" }), /call the function "greet"/],
        [statement("call-value-stmt"), /call a function value/],
        [statement("method-stmt", { object: "rex", method: "bark" }), /"rex" to run "bark"/],
        [statement("sort"), /sort a list/],
        [statement("reverse"), /reverse a list/],
        [statement("shuffle"), /shuffle a list/],
        [statement("kind", { name: "Dog" }), /kind of thing called "Dog"/],
        [statement("read-file", { name: "notes" }), /into "notes"/],
        [statement("write-file"), /write text/],
        [statement("delete-file"), /delete a project file/],
        [statement("list-files", { name: "names" }), /into "names"/],
        [statement("wait"), /pause/],
        [statement("save-device"), /save a value/],
        [statement("load-device", { name: "colour" }), /into "colour"/],
        [statement("delete-device"), /remove a saved value/],
        [statement("get-data", { name: "reply" }), /into "reply"/],
        [statement("send-data"), /send data/],
        [statement("app", { name: "Demo" }), /app "Demo"/],
        [statement("style"), /looks/],
        [statement("theme", { name: "Night" }), /"Night"/],
        [statement("when"), /visitor acts/],
        [statement("every"), /timer/],
        [statement("show"), /show part/],
        [statement("hide"), /hide part/],
        [statement("clear"), /clear a list/],
        [statement("change-of"), /change part of a page/],
        [statement("go-to-page"), /another page/],
        [statement("open-popup"), /open a dialog/],
        [statement("close-popup"), /close a dialog/],
        [statement("play-sound"), /play a sound/],
        [statement("clear-canvas"), /clear a drawing/],
        [statement("draw"), /draw a shape/],
    ];
    for (const [value, expected] of samples) {
        assert.match(explainStatement(value), expected, value.kind);
    }
});
//# sourceMappingURL=explain.test.js.map