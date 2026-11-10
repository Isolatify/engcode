import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { startApp } from "../runtime/web-runtime.js";
const n = (value) => ({ kind: "number", value });
const t = (value) => ({ kind: "text", value });
const b = (value) => ({ kind: "boolean", value });
const v = (name) => ({ kind: "variable", name });
const err = () => ({ kind: "error-ref" });
const bin = (operator, left, right) => ({ kind: "binary", operator, left, right });
const cmp = (operator, left, right) => ({
    kind: "comparison",
    operator,
    left,
    right: right === undefined ? [] : Array.isArray(right) ? right : [right],
});
const call = (name, ...args) => ({ kind: "builtin", name, args });
const listExpr = (...items) => ({ kind: "list", items });
const tableExpr = (entries) => ({
    kind: "table",
    entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
});
const set = (target, value) => ({ kind: "set", target, value });
const change = (target, value) => ({ kind: "change", target, value });
const add = (value, target) => ({ kind: "add", value, target });
const remove = (value, target) => ({ kind: "remove", value, target });
const say = (value) => ({ kind: "say", value });
const changeText = (id, value) => ({ kind: "change-of", property: "text", id, value });
const ifThen = (condition, body, otherwise) => ({
    kind: "if",
    branches: [{ condition, body }],
    otherwise,
});
const giveBack = (value) => ({ kind: "give-back", value });
const define = (name, params, body) => ({
    kind: "define",
    name,
    params: params.map((name) => ({ name })),
    body,
});
const page = (name, body = []) => ({ kind: "page", name, body });
const node = (element, uid, extra = {}) => ({
    kind: "ui",
    element,
    uid,
    children: [],
    ...extra,
});
const HTML = [
    '<a class="eng-skip" href="#eng-main">Skip</a>',
    '<div id="eng-app">',
    '<main id="eng-main">',
    '<section class="eng-page" data-page="home" id="page-home">',
    '<h1 data-eng-node="u1" data-eng-id="title">Runtime</h1>',
    '<h2 data-eng-node="u18" data-eng-id="dynamic">Dynamic</h2>',
    '<form data-eng-node="u2" data-eng-id="form"><input data-eng-node="u19" data-eng-id="inside"></form>',
    '<input data-eng-node="u3" data-eng-id="name" value="Ada">',
    '<input type="checkbox" data-eng-node="u4" data-eng-id="check" checked>',
    '<textarea data-eng-node="u5" data-eng-id="note">hello</textarea>',
    '<select data-eng-node="u6" data-eng-id="pick"><option value="a">a</option><option value="b">b</option></select>',
    '<span data-eng-node="u7" data-eng-id="output">Ready</span>',
    '<span data-eng-node="u20" data-eng-id="message">none</span>',
    '<span data-eng-node="u21" data-eng-id="page">home</span>',
    '<span data-eng-node="u22" data-eng-id="tick">0</span>',
    '<img data-eng-node="u8" data-eng-id="pic" alt="old">',
    '<ul data-eng-node="u9" data-eng-id="items"></ul>',
    '<table data-eng-node="u10" data-eng-id="rows"><caption>Rows</caption><thead><tr></tr></thead><tbody></tbody></table>',
    '<table data-eng-node="u38" data-eng-id="inferred"><caption>Inferred</caption><thead><tr></tr></thead><tbody></tbody></table>',
    '<dialog data-eng-node="u11" data-eng-id="dialog">Popup</dialog>',
    '<canvas data-eng-node="u12" data-eng-id="board" width="200" height="100"></canvas>',
    '<button data-eng-node="u13" data-eng-id="go" type="button">Go</button>',
    '<button data-eng-node="u14" data-eng-id="close" type="button">Close</button>',
    '<button data-eng-node="u15" data-eng-id="other" type="button">Other</button>',
    '<div data-eng-node="u16" data-eng-id="box">Box</div>',
    '<input type="range" data-eng-node="u23" data-eng-id="slider" min="0" max="10" value="0">',
    '<input type="checkbox" data-eng-node="u24" data-eng-id="switch" role="switch">',
    '<div class="eng-card" data-eng-node="u30" data-eng-id="card"><p class="eng-label">Old card</p><span data-eng-node="u31" data-eng-id="inner">keep</span></div>',
    '<div class="eng-field"><label for="u32">Old field</label><input id="u32" data-eng-node="u32" data-eng-id="field"></div>',
    '<label class="eng-check"><input type="checkbox" data-eng-node="u33" data-eng-id="check2"> <span class="eng-check-label">Old check</span></label>',
    '<img data-eng-node="u34" data-eng-id="pic2" alt="old">',
    '<video data-eng-node="u35" data-eng-id="vid" controls></video>',
    '<audio data-eng-node="u36" data-eng-id="aud" controls></audio>',
    '</section>',
    '<section class="eng-page" data-page="other" id="page-other" hidden>',
    '<h1 data-eng-node="u17" data-eng-id="other-title">Other</h1>',
    '</section>',
    '</main>',
    '</div>',
].join("");
const GLOBALS = [
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLButtonElement",
    "HTMLAnchorElement",
    "HTMLCanvasElement",
    "HTMLDialogElement",
    "HTMLImageElement",
    "HTMLUListElement",
    "KeyboardEvent",
    "Event",
    "Node",
    "Audio",
    "Image",
];
function installGlobals(window) {
    const target = globalThis;
    for (const name of GLOBALS) {
        const value = window[name];
        if (value !== undefined)
            target[name] = value;
    }
    target.window = window;
}
function mount(definition, options = {}, prepare) {
    const window = new Window({ url: "http://localhost/" });
    window.document.body.innerHTML = HTML;
    installGlobals(window);
    prepare?.(window);
    const stop = startApp(definition, { startTimers: false, ...options });
    return { window, document: window.document, definition, stop };
}
async function flush(times = 30) {
    for (let index = 0; index < times; index += 1)
        await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}
function pick(document, selector) {
    const element = document.querySelector(selector);
    assert.ok(element, `expected ${selector}`);
    return element;
}
function textOf(document, id) {
    return pick(document, `[data-eng-id="${id}"]`).textContent ?? "";
}
test("evaluates expressions, built-ins, loops, functions, kinds, and errors", () => {
    const pieces = [
        t("total"), v("total"),
        t("label"), v("label"),
        t("doubled"), v("doubled"),
        t("greeting"), v("greeting"),
        t("upper"), call("uppercase", t("abc")),
        t("lower"), call("lowercase", t("ABC")),
        t("trim"), call("trim", t("  x  ")),
        t("len"), call("length", t("hello")),
        t("lenList"), call("length", listExpr(n(1), n(2))),
        t("round"), call("round", n(3.6)),
        t("floor"), call("floor", n(3.9)),
        t("ceil"), call("ceiling", n(3.1)),
        t("abs"), call("absolute value", n(-4)),
        t("sqrt"), call("square root", n(9)),
        t("sin"), call("sine", n(0)),
        t("cos"), call("cosine", n(0)),
        t("tan"), call("tangent", n(0)),
        t("max"), call("maximum", n(2), n(7)),
        t("min"), call("minimum", n(2), n(7)),
        t("pow"), call("power", n(2), n(3)),
        t("num"), call("number from", t("42.5")),
        t("text"), call("text", n(5)),
        t("json"), call("JSON of", tableExpr({ a: n(9) })),
        t("unjson"), ({ kind: "property", base: call("data from JSON", t('{"x":1}')), key: "x" }),
        t("random"), call("random number", n(5), n(5)),
        t("randomItem"), call("random item", listExpr(t("only"))),
        t("item"), call("item", n(2), t("abc")),
        t("last"), call("last item", t("abc")),
        t("splitLength"), call("length", call("split", t("a,b"), t(","))),
        t("splitFirst"), call("item", n(1), call("split", t("a,b"), t(","))),
        t("joined"), call("join", listExpr(t("a"), t("b")), t("-")),
        t("replaced"), call("replace", t("a"), t("o"), t("banana")),
        t("position"), call("position", t("n"), t("banana")),
        t("year"), call("year", call("now")),
        t("today"), call("today"),
        t("formatted"), call("format", call("now"), t("YYYY-MM-DD")),
        t("pi"), call("pi"),
        t("e"), call("e"),
        t("key"), call("key pressed", t("w")),
        t("file"), call("file exists", t("x.txt")),
        t("value"), call("value of", t("name")),
        t("sorted"), call("item", n(1), v("letters")),
        t("record"), ({ kind: "property", base: v("record"), key: "a" }),
        t("has"), cmp("contains", v("letters"), t("a")),
        t("starts"), cmp("starts with", t("banana"), t("ban")),
        t("ends"), cmp("ends with", t("banana"), t("ana")),
        t("empty"), cmp("is empty", t("")),
        t("notEmpty"), cmp("is not empty", t("x")),
        t("between"), cmp("between", n(5), [n(1), n(10)]),
        t("not"), ({ kind: "unary", operator: "not", operand: b(false) }),
        t("negative"), ({ kind: "unary", operator: "minus", operand: n(4) }),
    ];
    const definition = {
        name: "Kitchen Sink",
        body: [
            { kind: "state", name: "total", value: n(0) },
            { kind: "state", name: "label", value: t("start") },
            { kind: "state", name: "letters", value: listExpr(t("b"), t("a"), t("c")) },
            { kind: "state", name: "record", value: tableExpr({ a: n(1), b: n(2) }) },
            add(n(10), v("total")),
            { kind: "repeat", count: n(2), body: [add(n(1), v("total"))] },
            {
                kind: "for-each",
                name: "number",
                iterable: listExpr(n(1), n(2), n(3)),
                body: [add(v("number"), v("total"))],
            },
            {
                kind: "count",
                start: n(1),
                end: n(5),
                name: "i",
                body: [
                    ifThen(cmp("is", v("i"), n(3)), [{ kind: "skip" }]),
                    add(v("i"), v("total")),
                ],
            },
            {
                kind: "while",
                condition: cmp("less than", v("total"), n(33)),
                body: [change(v("total"), bin("plus", v("total"), n(1)))],
            },
            {
                kind: "repeat",
                count: n(5),
                body: [
                    change(v("total"), bin("plus", v("total"), n(1))),
                    ifThen(cmp("is", v("total"), n(35)), [{ kind: "stop" }]),
                ],
            },
            define("double", ["number"], [giveBack(bin("times", v("number"), n(2)))]),
            define("greet", ["who"], [giveBack(bin("plus", t("Hi "), v("who")))]),
            set(v("doubled"), { kind: "call", name: "double", args: [n(4)] }),
            set(v("greeting"), { kind: "call", name: "greet", args: [t("Sam")] }),
            {
                kind: "kind",
                name: "Dog",
                fields: [{ name: "name" }],
                methods: [
                    {
                        name: "bark",
                        params: [],
                        body: [add(n(1), v("total"))],
                    },
                ],
            },
            set(v("rex"), { kind: "new", kindName: "Dog", entries: [{ key: "name", value: t("Rex") }] }),
            { kind: "method-stmt", object: "rex", method: "bark", args: [] },
            { kind: "sort", value: v("letters"), descending: false },
            { kind: "reverse", value: v("letters") },
            { kind: "shuffle", value: v("letters") },
            set({ kind: "property", base: v("record"), key: "a" }, n(9)),
            remove(t("b"), v("record")),
            {
                kind: "try",
                body: [
                    { kind: "call-stmt", name: "missing", args: [] },
                ],
                handler: [set(v("label"), bin("plus", t("caught:"), err()))],
            },
            changeText("output", call("join", listExpr(...pieces), t("|"))),
            changeText("dynamic", v("greeting")),
            { kind: "show", id: "box" },
            { kind: "hide", id: "box" },
            { kind: "clear", id: "note" },
            {
                kind: "change-of",
                property: "background",
                id: "box",
                value: t("light blue"),
            },
            {
                kind: "change-of",
                property: "text color",
                id: "box",
                value: t("white"),
            },
            { kind: "change-of", property: "font size", id: "box", value: n(20) },
            { kind: "change-of", property: "width", id: "box", value: n(120) },
            { kind: "change-of", property: "height", id: "box", value: n(50) },
            { kind: "change-of", property: "rounded corners", id: "box", value: n(6) },
            { kind: "change-of", property: "padding", id: "box", value: n(8) },
            { kind: "change-of", property: "margin", id: "box", value: n(4) },
            { kind: "change-of", property: "border", id: "box", value: n(2) },
            { kind: "change-of", property: "opacity", id: "box", value: n(0.5) },
            { kind: "change-of", property: "alignment", id: "box", value: t("center") },
            { kind: "change-of", property: "value", id: "name", value: t("Grace") },
        ],
        pages: [
            page("Home", [
                node("heading", "u1", { level: 1, label: t("Runtime") }),
                node("heading", "u18", { level: 2, label: v("greeting") }),
                node("input", "u3", { id: "name", label: t("Name"), starting: t("Ada") }),
                node("text", "u7", { id: "output", label: t("Ready") }),
            ]),
            page("Other", [node("heading", "u17", { level: 1, label: t("Other") })]),
        ],
    };
    const { document, window } = mount(definition);
    const output = textOf(document, "output");
    const value = Object.fromEntries(output.split("|").reduce((pairs, item, index, all) => {
        if (index % 2 === 0)
            pairs.push([item, all[index + 1] ?? ""]);
        return pairs;
    }, []));
    assert.equal(value.total, "36");
    assert.match(value.label, /^caught:I don't know a function called "missing"\.$/);
    assert.equal(value.doubled, "8");
    assert.equal(value.greeting, "Hi Sam");
    assert.equal(value.upper, "ABC");
    assert.equal(value.lower, "abc");
    assert.equal(value.trim, "x");
    assert.equal(value.len, "5");
    assert.equal(value.lenList, "2");
    assert.equal(value.round, "4");
    assert.equal(value.floor, "3");
    assert.equal(value.ceil, "4");
    assert.equal(value.abs, "4");
    assert.equal(value.sqrt, "3");
    assert.equal(value.sin, "0");
    assert.equal(value.cos, "1");
    assert.equal(value.tan, "0");
    assert.equal(value.max, "7");
    assert.equal(value.min, "2");
    assert.equal(value.pow, "8");
    assert.equal(value.num, "42.5");
    assert.equal(value.text, "5");
    assert.equal(value.json, '{"a":9}');
    assert.equal(value.unjson, "1");
    assert.equal(value.random, "5");
    assert.equal(value.randomItem, "only");
    assert.equal(value.item, "b");
    assert.equal(value.last, "c");
    assert.equal(value.splitLength, "2");
    assert.equal(value.splitFirst, "a");
    assert.equal(value.joined, "a-b");
    assert.equal(value.replaced, "bonono");
    assert.equal(value.position, "3");
    assert.equal(value.today, value.formatted);
    assert.match(value.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(value.key, "no");
    assert.equal(value.file, "no");
    assert.equal(value.has, "yes");
    assert.equal(value.starts, "yes");
    assert.equal(value.ends, "yes");
    assert.equal(value.empty, "yes");
    assert.equal(value.notEmpty, "yes");
    assert.equal(value.between, "yes");
    assert.equal(value.not, "yes");
    assert.equal(value.negative, "-4");
    assert.equal(value.value, "Ada");
    assert.equal(textOf(document, "dynamic"), "Hi Sam");
    assert.equal(pick(document, '[data-eng-id="note"]').value, "");
    const box = pick(document, '[data-eng-id="box"]');
    assert.equal(box.style.width, "120px");
    assert.equal(box.style.opacity, "0.5");
    assert.equal(box.hidden, true);
    window.close();
});
test("runs click, form, change, typing, key, resize, hover, and page-open handlers", async () => {
    const definition = {
        name: "Events",
        body: [
            { kind: "state", name: "count", value: n(0) },
            { kind: "state", name: "items", value: listExpr() },
            { kind: "state", name: "rows", value: listExpr(tableExpr({ name: t("Sam"), age: n(7) })) },
            { kind: "state", name: "title", value: t("Before") },
            {
                kind: "when",
                event: { type: "click", id: "go" },
                body: [
                    change(v("count"), bin("plus", v("count"), n(1))),
                    add(t("one"), v("items")),
                    changeText("output", bin("plus", t("clicked "), v("count"))),
                    change(v("title"), t("After")),
                ],
            },
            {
                kind: "when",
                event: { type: "submit", id: "form" },
                body: [changeText("output", t("submitted"))],
            },
            {
                kind: "when",
                event: { type: "change", id: "pick" },
                body: [changeText("output", call("value of", t("pick")))],
            },
            {
                kind: "when",
                event: { type: "typing", id: "name" },
                body: [changeText("message", t("typing"))],
            },
            {
                kind: "when",
                event: { type: "hover", id: "go" },
                body: [changeText("message", t("hover"))],
            },
            {
                kind: "when",
                event: { type: "mouse-leave", id: "go" },
                body: [changeText("message", t("left"))],
            },
            {
                kind: "when",
                event: { type: "key", key: "Enter" },
                body: [changeText("page", t("enter"))],
            },
            {
                kind: "when",
                event: { type: "resize" },
                body: [changeText("tick", t("resized"))],
            },
            {
                kind: "when",
                event: { type: "page-open" },
                body: [changeText("page", t("opened"))],
            },
            {
                kind: "when",
                event: { type: "page-open", page: "Other" },
                body: [changeText("other-title", t("Other opened"))],
            },
            {
                kind: "when",
                event: { type: "click", id: "close" },
                body: [
                    { kind: "open-popup", id: "dialog" },
                    {
                        kind: "change-of",
                        property: "text",
                        id: "output",
                        value: t("popup"),
                    },
                ],
            },
            {
                kind: "when",
                event: { type: "click", id: "other" },
                body: [{ kind: "go-to-page", page: "Other" }],
            },
        ],
        pages: [
            page("Home", [
                node("heading", "u1", { level: 1, label: t("Events") }),
                node("heading", "u18", { level: 2, label: v("title"), id: "dynamic" }),
                node("input", "u3", { id: "name", label: t("Name") }),
                node("select", "u6", {
                    id: "pick",
                    label: t("Pick"),
                    choices: [t("a"), t("b")],
                }),
                node("list", "u9", { id: "items", showing: v("items") }),
                node("table", "u10", {
                    id: "rows",
                    showing: v("rows"),
                    columns: [t("name"), t("age")],
                }),
                node("text", "u7", { id: "output", label: t("Ready") }),
            ]),
            page("Other", [node("heading", "u17", { level: 1, label: t("Other"), id: "other-title" })]),
        ],
    };
    const { document, window } = mount(definition);
    await flush();
    assert.equal(textOf(document, "page"), "opened");
    pick(document, '[data-eng-id="go"]').click();
    await flush();
    assert.equal(textOf(document, "output"), "clicked 1");
    assert.equal(textOf(document, "dynamic"), "After");
    assert.match(pick(document, '[data-eng-id="items"]').textContent ?? "", /one/);
    assert.match(pick(document, '[data-eng-id="rows"]').textContent ?? "", /Sam/);
    assert.match(pick(document, '[data-eng-id="rows"]').textContent ?? "", /7/);
    const form = pick(document, '[data-eng-id="form"]');
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(textOf(document, "output"), "submitted");
    const select = pick(document, '[data-eng-id="pick"]');
    select.value = "b";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
    await flush();
    assert.equal(textOf(document, "output"), "b");
    const name = pick(document, '[data-eng-id="name"]');
    name.dispatchEvent(new window.Event("input", { bubbles: true }));
    await flush();
    assert.equal(textOf(document, "message"), "typing");
    pick(document, '[data-eng-id="go"]').dispatchEvent(new window.Event("mouseenter", { bubbles: true }));
    await flush();
    assert.equal(textOf(document, "message"), "hover");
    pick(document, '[data-eng-id="go"]').dispatchEvent(new window.Event("mouseleave", { bubbles: true }));
    await flush();
    assert.equal(textOf(document, "message"), "left");
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    assert.equal(textOf(document, "page"), "enter");
    window.dispatchEvent(new window.Event("resize"));
    await flush();
    assert.equal(textOf(document, "tick"), "resized");
    pick(document, '[data-eng-id="close"]').click();
    await flush();
    assert.equal(textOf(document, "output"), "popup");
    assert.equal(pick(document, '[data-eng-id="dialog"]').open, true);
    pick(document, '[data-eng-id="other"]').click();
    await flush();
    assert.match(window.location.hash, /#\/other/);
    assert.equal(pick(document, '[data-page="other"]').hidden, false);
    assert.equal(pick(document, '[data-page="home"]').hidden, true);
    assert.equal(textOf(document, "other-title"), "Other opened");
    window.close();
});
test("updates dynamic labels, columns, choices, and media", async () => {
    const definition = {
        name: "Dynamic",
        body: [
            { kind: "state", name: "cardLabel", value: t("New card") },
            { kind: "state", name: "fieldLabel", value: t("Your name") },
            { kind: "state", name: "checkLabel", value: t("Agree") },
            { kind: "state", name: "picture", value: t("photo.png") },
            { kind: "state", name: "clip", value: t("clip.mp4") },
            { kind: "state", name: "sound", value: t("sound.mp3") },
            { kind: "state", name: "alt", value: t("A picture") },
            { kind: "state", name: "colA", value: t("Name") },
            { kind: "state", name: "colB", value: t("Score") },
            {
                kind: "state",
                name: "rows",
                value: listExpr(tableExpr({ Name: t("Ada"), Score: n(10) })),
            },
        ],
        pages: [
            page("Home", [
                node("card", "u30", {
                    id: "card",
                    label: v("cardLabel"),
                    children: [node("text", "u31", { id: "inner", label: t("keep") })],
                }),
                node("input", "u32", { id: "field", label: v("fieldLabel") }),
                node("checkbox", "u33", { id: "check2", label: v("checkLabel") }),
                node("image", "u34", { id: "pic2", label: v("picture"), description: v("alt") }),
                node("video", "u35", { id: "vid", label: v("clip") }),
                node("audio", "u36", { id: "aud", label: v("sound") }),
                node("table", "u10", { id: "rows", showing: v("rows"), columns: [v("colA"), v("colB")] }),
                node("table", "u38", { id: "inferred", showing: v("rows") }),
                node("dropdown", "u6", { id: "pick", label: t("Colour"), choices: [t("Red"), t("Blue")] }),
            ]),
        ],
    };
    const { document, window } = mount(definition);
    await flush();
    const card = pick(document, '[data-eng-id="card"]');
    assert.equal(card.querySelector(".eng-label")?.textContent, "New card");
    assert.equal(card.querySelector('[data-eng-id="inner"]')?.textContent, "keep");
    const field = pick(document, '[data-eng-id="field"]');
    assert.equal(field.closest(".eng-field")?.querySelector("label")?.textContent, "Your name");
    const check = pick(document, '[data-eng-id="check2"]');
    assert.equal(check.closest("label")?.querySelector(".eng-check-label")?.textContent, "Agree");
    const image = pick(document, '[data-eng-id="pic2"]');
    assert.match(image.getAttribute("src") ?? "", /photo\.png$/);
    assert.equal(image.alt, "A picture");
    assert.match(pick(document, '[data-eng-id="vid"]').getAttribute("src") ?? "", /clip\.mp4$/);
    assert.match(pick(document, '[data-eng-id="aud"]').getAttribute("src") ?? "", /sound\.mp3$/);
    const headerTexts = (id) => Array.from(pick(document, `[data-eng-id="${id}"]`).querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    assert.deepEqual(headerTexts("rows"), ["Name", "Score"]);
    assert.deepEqual(headerTexts("inferred"), ["Name", "Score"]);
    const options = Array.from(pick(document, '[data-eng-id="pick"]').options).map((option) => option.value);
    assert.deepEqual(options, ["Red", "Blue"]);
    window.close();
});
test("awaits web data inside event-handler loops", async () => {
    const definition = {
        name: "Loop Fetch",
        body: [
            { kind: "state", name: "results", value: listExpr() },
            {
                kind: "when",
                event: { type: "click", id: "go" },
                body: [
                    {
                        kind: "repeat",
                        count: n(2),
                        body: [
                            { kind: "get-data", url: t("https://api.example.com/item"), name: "data" },
                            {
                                kind: "add",
                                value: { kind: "property", base: v("data"), key: "value" },
                                target: v("results"),
                            },
                        ],
                    },
                    changeText("output", call("join", v("results"), t(","))),
                ],
            },
        ],
        pages: [page("Home", [node("text", "u7", { id: "output", label: t("Ready") })])],
    };
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return { ok: true, status: 200, text: async () => JSON.stringify({ value: calls }) };
    };
    const { document, window } = mount(definition);
    pick(document, '[data-eng-id="go"]').click();
    await flush(80);
    assert.equal(textOf(document, "output"), "1,2");
    assert.equal(calls, 2);
    window.close();
});
test("closes an open popup when Escape is pressed", async () => {
    const definition = {
        name: "Popup",
        body: [
            {
                kind: "when",
                event: { type: "click", id: "close" },
                body: [{ kind: "open-popup", id: "dialog" }],
            },
        ],
        pages: [page("Home")],
    };
    const { document, window } = mount(definition);
    const dialog = pick(document, '[data-eng-id="dialog"]');
    pick(document, '[data-eng-id="close"]').click();
    await flush();
    assert.equal(dialog.open, true);
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    assert.equal(dialog.open, false);
    window.close();
});
test("saves, loads, deletes, asks, and toggles the theme", async () => {
    const definition = {
        name: "Devices",
        body: [
            { kind: "state", name: "loaded", value: t("not loaded") },
            { kind: "ask", prompt: t("Number?"), name: "answer", number: true },
            { kind: "save-device", key: t("score"), value: n(12) },
            { kind: "load-device", key: t("score"), name: "loaded" },
            changeText("output", bin("plus", t("answer "), v("answer"))),
            changeText("message", v("loaded")),
            { kind: "delete-device", key: t("score") },
            { kind: "play-sound", path: t("beep.mp3") },
            say(t("hello")),
        ],
        pages: [page("Home", [node("text", "u7", { id: "output", label: t("Ready") })])],
    };
    const { document, window } = mount(definition, {}, (window) => {
        window.prompt = () => "42";
    });
    await flush();
    assert.equal(textOf(document, "output"), "answer 42");
    assert.equal(textOf(document, "message"), "12");
    assert.equal(window.localStorage.getItem("engcode:Devices:score"), null);
    const toggle = pick(document, ".eng-theme-toggle");
    toggle.click();
    assert.ok(["light", "dark"].includes(document.documentElement.dataset.theme ?? ""));
    toggle.click();
    assert.ok(["light", "dark"].includes(document.documentElement.dataset.theme ?? ""));
    assert.ok(window.localStorage.getItem("engcode:theme"));
    window.close();
});
test("fetches web data, handles failures, and checks network limits", async () => {
    const definition = {
        name: "Web",
        body: [
            {
                kind: "when",
                event: { type: "click", id: "go" },
                body: [
                    {
                        kind: "try",
                        body: [
                            {
                                kind: "get-data",
                                url: t("https://api.example.com/data"),
                                name: "data",
                            },
                            changeText("output", { kind: "property", base: v("data"), key: "value" }),
                        ],
                        handler: [changeText("output", bin("plus", t("failed "), err()))],
                    },
                ],
            },
            {
                kind: "when",
                event: { type: "click", id: "close" },
                body: [
                    {
                        kind: "try",
                        body: [
                            {
                                kind: "send-data",
                                url: t("https://api.example.com/data"),
                                value: tableExpr({ ok: b(true) }),
                                name: "result",
                            },
                            changeText("output", t("sent")),
                        ],
                        handler: [changeText("output", bin("plus", t("send failed "), err()))],
                    },
                ],
            },
            {
                kind: "when",
                event: { type: "click", id: "other" },
                body: [
                    {
                        kind: "try",
                        body: [
                            { kind: "get-data", url: t("http://plain.example.com/x"), name: "bad" },
                        ],
                        handler: [changeText("output", err())],
                    },
                ],
            },
        ],
        pages: [page("Home", [node("text", "u7", { id: "output", label: t("Ready") })])],
    };
    const target = globalThis;
    const responses = [
        { ok: true, status: 200, text: async () => '{"value":"from web"}' },
        { ok: true, status: 200, text: async () => '{"ok":true}' },
        { ok: false, status: 500, text: async () => "nope" },
    ];
    let calls = 0;
    target.fetch = async (..._args) => {
        const response = responses[Math.min(calls, responses.length - 1)];
        calls += 1;
        return response;
    };
    const { document, window } = mount(definition);
    pick(document, '[data-eng-id="go"]').click();
    await flush();
    assert.equal(textOf(document, "output"), "from web");
    pick(document, '[data-eng-id="close"]').click();
    await flush();
    assert.equal(textOf(document, "output"), "sent");
    assert.equal(calls, 2);
    pick(document, '[data-eng-id="other"]').click();
    await flush();
    assert.match(textOf(document, "output"), /https/);
    window.close();
    const limited = mount(definition, { allowedHosts: ["other.example.com"] });
    pick(limited.document, '[data-eng-id="go"]').click();
    await flush();
    assert.match(textOf(limited.document, "output"), /not allowed to call api\.example\.com/);
    limited.window.close();
});
test("draws on a canvas, plays sounds, and updates a frame timer", async () => {
    const calls = [];
    const context = {
        fillStyle: "",
        strokeStyle: "",
        font: "",
        fillRect: (...args) => calls.push(`fillRect:${args.join(",")}`),
        beginPath: () => calls.push("beginPath"),
        arc: (...args) => calls.push(`arc:${args.join(",")}`),
        fill: () => calls.push("fill"),
        moveTo: (...args) => calls.push(`moveTo:${args.join(",")}`),
        lineTo: (...args) => calls.push(`lineTo:${args.join(",")}`),
        stroke: () => calls.push("stroke"),
        fillText: (...args) => calls.push(`fillText:${args[0]}`),
        drawImage: () => calls.push("drawImage"),
    };
    const definition = {
        name: "Canvas",
        body: [
            {
                kind: "when",
                event: { type: "click", id: "go" },
                body: [
                    { kind: "clear-canvas", id: "board", color: "black" },
                    { kind: "draw", shape: "rectangle", id: "board", x: n(1), y: n(2), width: n(3), height: n(4), color: "red" },
                    { kind: "draw", shape: "circle", id: "board", x: n(10), y: n(20), size: n(8), color: "blue" },
                    { kind: "draw", shape: "line", id: "board", fromX: n(0), fromY: n(0), toX: n(5), toY: n(5), color: "green" },
                    { kind: "draw", shape: "text", id: "board", x: n(4), y: n(6), text: t("hi"), color: "white" },
                    { kind: "draw", shape: "image", id: "board", path: t("sprite.png"), x: n(10), y: n(10), size: n(16) },
                    { kind: "play-sound", path: t("boop.mp3") },
                ],
            },
            {
                kind: "every",
                frame: true,
                body: [changeText("tick", t("frame"))],
            },
        ],
        pages: [page("Home", [node("text", "u22", { id: "tick", label: t("0") })]), page("Other")],
    };
    const sounds = [];
    const frames = [];
    const { document, window } = mount(definition, { startTimers: true }, (window) => {
        window.HTMLCanvasElement.prototype.getContext = () => context;
        window.Image = class {
            onload = null;
            set src(_value) {
                this.onload?.();
            }
        };
        globalThis.Image = window.Image;
        window.Audio = class {
            src;
            constructor(src) {
                this.src = src;
                sounds.push(src);
            }
            play() {
                return Promise.resolve();
            }
        };
        globalThis.Audio = window.Audio;
        window.requestAnimationFrame = (callback) => {
            frames.push(callback);
            return frames.length;
        };
        globalThis.requestAnimationFrame = window.requestAnimationFrame;
    });
    pick(document, '[data-eng-id="go"]').click();
    await flush();
    assert.ok(calls.includes("fillRect:0,0,200,100"));
    assert.ok(calls.some((call) => call.startsWith("arc:10,20,4")));
    assert.ok(calls.some((call) => call.startsWith("moveTo:0,0")));
    assert.ok(calls.includes("fillText:hi"));
    assert.ok(calls.includes("drawImage"));
    assert.equal(sounds[0], "boop.mp3");
    assert.ok(frames.length > 0);
    frames[0](0);
    await flush();
    assert.equal(textOf(document, "tick"), "frame");
    window.close();
});
test("runs interval timers and handles blocked storage", async () => {
    const definition = {
        name: "Timers",
        body: [
            { kind: "state", name: "ticks", value: n(0) },
            {
                kind: "every",
                seconds: 0.02,
                body: [change(v("ticks"), bin("plus", v("ticks"), n(1))), changeText("tick", v("ticks"))],
            },
            { kind: "save-device", key: t("k"), value: n(1) },
        ],
        pages: [page("Home", [node("text", "u22", { id: "tick", label: t("0") })])],
    };
    const { document, window, stop } = mount(definition, { startTimers: true }, (window) => {
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
                throw new Error("blocked");
            },
        });
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.notEqual(textOf(document, "tick"), "0");
    stop();
    window.close();
});
//# sourceMappingURL=web-runtime.test.js.map