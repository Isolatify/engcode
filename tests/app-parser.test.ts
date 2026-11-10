import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/program.js";

const DEMO = [
  'app "Demo":',
  '    page "Home":',
  '        heading "Welcome"',
  '        row:',
  '            input called "name" with label "Your name" and hint "Type here"',
  '            button "Say hi" called "hi button"',
  '        end',
  '        list called "items" showing things',
  '        canvas called "board" with width 400 and height 300',
  '    end',
  "end",
  "",
  "keep track of things as an empty list",
  "keep track of total as 0",
  "",
  "style everything:",
  '    font is "Helvetica"',
  "    background is light gray",
  "    text color is dark blue",
  "end",
  "",
  'style "hi button" on small screens:',
  "    width is full",
  "    when mouse is over:",
  "        background is blue",
  "    end",
  "end",
  "",
  "style everything in dark mode:",
  "    background is #111827",
  "end",
  "",
  'theme "Day":',
  "    accent is #2563eb",
  "    font is modern",
  "    corner radius is 12",
  "end",
  "",
  'theme "Night" in dark mode:',
  "    background is #0f172a",
  "end",
  "",
  "style navigation bar:",
  "    animation is slide down over 0.4 seconds",
  "end",
  "",
  'when "hi button" is clicked:',
  '    say "hello"',
  "    show \"name\"",
  "end",
  "",
  "when the page opens:",
  '    say "open"',
  "end",
  "",
  "every 5 seconds:",
  "    change total to total plus 1",
  "end",
].join("\n");

test("parses an app, pages, blocks, styles, events, and timers", () => {
  const analysis = analyze("demo.eng", DEMO, { allowApps: true });
  assert.deepEqual(
    analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.ok(analysis.program);

  const app = analysis.program!.body.find((statement) => statement.kind === "app") as any;
  assert.equal(app.name, "Demo");
  assert.equal(app.pages.length, 1);
  assert.equal(app.pages[0].name, "Home");
  assert.deepEqual(
    app.pages[0].body.map((node: any) => node.element),
    ["heading", "row", "list", "canvas"],
  );
  assert.equal(app.pages[0].body[1].children[0].id, "name");
  assert.equal(app.pages[0].body[1].children[1].submits, false);
  assert.equal(app.pages[0].body[3].width.kind, "number");

  const styles = analysis.program!.body.filter((statement) => statement.kind === "style") as any[];
  assert.equal(styles.length, 4);
  assert.equal(styles[0].targetType, "everything");
  assert.equal(styles[1].target, "hi button");
  assert.equal(styles[1].media, "small screens");
  assert.equal(styles[1].states[0].state, "mouse is over");
  assert.equal(styles[2].dark, true);
  assert.equal(styles[3].target, "navigation bar");

  const themes = analysis.program!.body.filter((statement) => statement.kind === "theme") as any[];
  assert.equal(themes.length, 2);
  assert.equal(themes[0].name, "Day");
  assert.equal(themes[0].dark, false);
  assert.equal(themes[0].declarations[0].property, "accent");
  assert.equal(themes[1].name, "Night");
  assert.equal(themes[1].dark, true);

  const events = analysis.program!.body.filter((statement) => statement.kind === "when") as any[];
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].event, { type: "click", id: "hi button" });
  assert.deepEqual(events[1].event, { type: "page-open" });

  const timer = analysis.program!.body.find((statement) => statement.kind === "every") as any;
  assert.equal(timer.seconds, 5);
  assert.equal(timer.frame, false);
});

test("parses every-frame timers and keyboard conditions", () => {
  const source = [
    'app "Game":',
    '    page "Play":',
    '        heading "Game"',
    '        canvas called "board"',
    "    end",
    "end",
    "",
    "every frame:",
    '    if key "w" is pressed:',
    "        say \"up\"",
    "    end",
    "end",
  ].join("\n");
  const analysis = analyze("game.eng", source, { allowApps: true });
  assert.deepEqual(
    analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const timer = analysis.program!.body.find((statement) => statement.kind === "every") as any;
  assert.equal(timer.frame, true);
  const condition = timer.body[0].branches[0].condition;
  assert.equal(condition.kind, "builtin");
  assert.equal(condition.name, "key pressed");
});

test("parses screen update statements", () => {
  const source = [
    'app "Demo":',
    '    page "Home":',
    '        heading "Demo"',
    '        text "Ready" called "status"',
    '        canvas called "board"',
    "    end",
    "end",
    "",
    'when the page opens:',
    '    change text of "status" to "Done"',
    '    go to page "Home"',
    '    clear "status"',
    '    clear canvas "board" to #111827',
    '    draw circle on "board" at x 10 and y 20 with size 8 in white',
    "end",
  ].join("\n");
  const analysis = analyze("demo.eng", source, { allowApps: true });
  assert.deepEqual(
    analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const handler = analysis.program!.body.find((statement) => statement.kind === "when") as any;
  assert.deepEqual(
    handler.body.map((statement: any) => statement.kind),
    ["change-of", "go-to-page", "clear", "clear-canvas", "draw"],
  );
  assert.equal(handler.body[0].property, "text");
  assert.equal(handler.body[4].shape, "circle");
});

test("rejects app blocks when apps are not allowed", () => {
  const analysis = analyze("test.eng", 'app "Demo":\nend', { allowApps: false });
  assert.equal(analysis.diagnostics.length, 1);
  assert.match(analysis.diagnostics[0]!.message, /belongs to an app/);
});

test("keeps functions named show working", () => {
  const analysis = analyze(
    "test.eng",
    ["define show with score:", "    say score", "end", "set high score to 10", "show high score"].join(
      "\n",
    ),
  );
  assert.deepEqual(
    analysis.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
});
