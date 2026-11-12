import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Lexer } from "../src/lexer.js";
import { prescanNames } from "../src/names.js";
import { analyze } from "../src/program.js";
import {
  buildOccurrences,
  findOccurrenceAt,
  mirrorDeclarations,
  occurrencesNamed,
  type Occurrence,
  type SymbolFile,
} from "../src/symbols.js";

/**
 * Symbol spans are pure token math: nothing here touches the disk, so every
 * sample analyses under one virtual absolute path that both builds agree on.
 */
const FILE = path.resolve("virtual-symbols.eng");

/** Clause and operator words the parser never resolves to a name. */
const CLAUSE_OPERATOR_WORDS = new Set([
  // CLAUSE_WORDS
  "and",
  "or",
  "plus",
  "minus",
  "times",
  "divided",
  "remainder",
  "is",
  "contains",
  "starts",
  "ends",
  "to",
  "from",
  "with",
  "as",
  "in",
  "of",
  "by",
  "at",
  "on",
  "called",
  "showing",
  "level",
  "default",
  "that",
  "otherwise",
  "end",
  "seconds",
  "descending",
  // OPERATOR_WORDS
  "than",
  "least",
  "most",
  "not",
  "empty",
]);

function join(...lines: string[]): string {
  return lines.join("\n");
}

function keys(occurrences: Occurrence[]): string[] {
  return occurrences
    .map((occurrence) =>
      `${occurrence.name}|${occurrence.kind}|${occurrence.file}|${occurrence.line}|${occurrence.column}|${occurrence.length}`,
    )
    .sort();
}

const DOG_SOURCE = join(
  "define a kind of thing called Dog:",
  "    it has name and age",
  "    it can bark:",
  '        say name plus " says woof"',
  "    end",
  "    it can celebrate:",
  "    change age to age plus 1",
  "    end",
  "    it can years with amount:",
  "        give back age plus amount",
  "    end",
  "end",
  "",
  'set rex to a new Dog with name "Rex", age 3',
  "rex bark",
  "rex celebrate",
  "say rex's age",
  "say call rex's years with 10",
);

const APP_SOURCE = join(
  'app "Demo":',
  '    page "Home":',
  '        heading "Welcome"',
  "        row:",
  '            input called "name" with label "Your name" and hint "Type here"',
  '            button "Say hi" called "hi button"',
  "        end",
  '        list called "items" showing things',
  '        canvas called "board" with width 400 and height 300',
  "    end",
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
  '    show "name"',
  "end",
  "",
  "when the page opens:",
  '    say "open"',
  "end",
  "",
  "every 5 seconds:",
  "    change total to total plus 1",
  "end",
);

const DRAW_SOURCE = join(
  'app "Demo":',
  '    page "Home":',
  '        heading "Demo"',
  '        text "Ready" called "status"',
  '        canvas called "board"',
  "    end",
  "end",
  "",
  "when the page opens:",
  '    change text of "status" to "Done"',
  '    go to page "Home"',
  '    clear "status"',
  '    clear canvas "board" to #111827',
  '    draw circle on "board" at x 10 and y 20 with size 8 in white',
  "end",
);

interface Sample {
  label: string;
  source: string;
}

const SAMPLES: Sample[] = [
  {
    label: "basics",
    source: join(
      "set score to 0",
      'set player name to "Ada"',
      "change score to score plus 1",
      "add 5 to score",
      "say player name",
      "if score is greater than 3:",
      "    say player name",
      "otherwise:",
      '    say "low"',
      "end",
      "repeat 3 times:",
      "    say score",
      "end",
    ),
  },
  {
    label: "functions",
    source: join(
      "define greet with name:",
      '    say "hi " plus name',
      "end",
      "define add with a and b:",
      "    give back a plus b",
      "end",
      "define ping:",
      '    say "pong"',
      "end",
      'say greet "Ada"',
      "say add 2 and 3",
      "call ping",
      "set handler to the function greet",
      'say call greet with "Ada"',
    ),
  },
  { label: "kinds", source: DOG_SOURCE },
  {
    label: "builtins",
    source: join(
      'set fruits to a list of "apple", "banana"',
      'add "cherry" to fruits',
      "set idx to 1",
      "say length of fruits",
      "say item 1 of fruits",
      "say item idx of fruits",
      "say last item of fruits",
      'say uppercase of "hello"',
      "say round of 3.6",
      "say minimum of 2 and 8",
      "say power of 2 and 8",
      "say random number from 1 to 10",
      'set words to split "a,b,c" by ","',
      'say join words with "-"',
      'say position of "n" in "banana"',
      'say replace "a" with "b" in "banana"',
    ),
  },
  {
    label: "table-list",
    source: join(
      'set person to a table with name "Sam", age 25',
      "say person's name",
      "set person's age to 26",
      "say person's age",
      "set nums to a list of 3, 1, 2",
      "sort nums descending",
      "reverse nums",
      "say nums",
    ),
  },
  {
    label: "loops",
    source: join(
      'set fruits to a list of "apple", "banana"',
      "for each fruit in fruits:",
      "    say fruit",
      "end",
      "count from 1 to 3 as number:",
      "    say number",
      "end",
      "set i to 0",
      "while i is less than 3:",
      "    change i to i plus 1",
      "end",
    ),
  },
  {
    label: "device-io",
    source: join(
      'write "hi" to file "note.txt"',
      'read file "note.txt" and save it as text',
      "say text",
      'ask for a number "Age?" and save it as age',
      "say age plus 1",
      'get data from "https://example.com" and save it as reply',
      "say reply",
      'save "blue" to the device as "colour"',
      'load "colour" from the device and save it as colour',
      "say colour",
    ),
  },
  { label: "app-ui", source: APP_SOURCE },
  { label: "draw-ui", source: DRAW_SOURCE },
  {
    label: "minus",
    source: join(
      "set minus to 5",
      "set balance to 10 minus 3",
      "set negative to minus 5",
      "say balance minus 1",
      "say negative",
      "say round of balance",
    ),
  },
];

// ------------------------------------------------------------------- parity

test("mirror declarations agree with the prescan name table", () => {
  for (const { label, source } of SAMPLES) {
    const tokens = Lexer.lex(FILE, source);
    const mirrored = [...new Set(mirrorDeclarations(tokens, FILE).map((occurrence) => occurrence.name))].sort();
    const declared = [...prescanNames(tokens).declared].sort();
    assert.deepEqual(mirrored, declared, `${label}: mirror and prescan disagree`);
    assert.ok(declared.length > 0, `${label}: expected declared names`);
  }
});

// -------------------------------------------------------------------- spans

test("every occurrence span reads back as its own name", () => {
  for (const { label, source } of SAMPLES) {
    const tokens = Lexer.lex(FILE, source);
    const occurrences = buildOccurrences([{ path: FILE, tokens }]);
    const lines = source.split("\n");
    assert.ok(occurrences.length > 0, `${label}: expected occurrences`);
    for (const occurrence of occurrences) {
      const text = lines[occurrence.line - 1];
      assert.ok(text !== undefined, `${label}: line ${occurrence.line} is missing`);
      const slice = text.slice(occurrence.column - 1, occurrence.column - 1 + occurrence.length);
      assert.equal(slice, occurrence.name, `${label}: span at ${occurrence.line}:${occurrence.column}`);
    }
  }
});

// -------------------------------------------------------------- equivalence

for (const { label, source } of SAMPLES) {
  test(`equivalence: AST and degraded builds agree for ${label}`, () => {
    const analysis = analyze(FILE, source);
    const errors = analysis.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message);
    assert.deepEqual(errors, [], `${label} sample must be error-free`);

    // The degraded scanner is only reachable when analysis failed, so the
    // sample has to be fully clean — including warnings — for the comparison
    // to mean anything. Fail loudly if that assumption breaks.
    assert.deepEqual(
      analysis.diagnostics.map(
        (diagnostic) =>
          `${diagnostic.span ? `${diagnostic.span.line}:${diagnostic.span.column} ` : ""}${diagnostic.message}`,
      ),
      [],
      `${label} sample must be analysis-clean`,
    );

    const program = analysis.program;
    assert.ok(program, `${label}: analyze must produce a program`);

    const tokens = Lexer.lex(FILE, source);
    const files: SymbolFile[] = [{ path: FILE, tokens }];
    const fromAst = buildOccurrences(files, { program });
    const fromDegraded = buildOccurrences(files, { names: analysis.names! });

    assert.ok(fromAst.length > 0, `${label}: expected occurrences`);
    assert.deepEqual(keys(fromDegraded), keys(fromAst), `${label}: degraded and AST builds disagree`);
  });
}

// -------------------------------------------------------- reference hygiene

test("references never invent names and never point at operators", () => {
  for (const { label, source } of SAMPLES) {
    const tokens = Lexer.lex(FILE, source);
    const declared = prescanNames(tokens).declared;
    const occurrences = buildOccurrences([{ path: FILE, tokens }]);
    for (const occurrence of occurrences) {
      const where = `${label}: ${occurrence.kind} "${occurrence.name}" at ${occurrence.line}:${occurrence.column}`;
      if (CLAUSE_OPERATOR_WORDS.has(occurrence.name)) {
        // The corpus declares `minus` to prove the parser still wins: even a
        // declared operator word is never resolved to a name.
        assert.equal(occurrence.name, "minus", `clause word resolved: ${where}`);
        assert.equal(occurrence.kind, "definition", `operator word used: ${where}`);
      }
      if (occurrence.kind === "reference") {
        assert.ok(declared.has(occurrence.name), `undeclared reference: ${where}`);
      }
    }
  }
});

// ------------------------------------------------------------ lookups

test("findOccurrenceAt and occurrencesNamed", () => {
  const source = join("set score to 0", "change score to score plus 1", "say score");
  const tokens = Lexer.lex(FILE, source);
  const occurrences = buildOccurrences([{ path: FILE, tokens }]);

  const definition = findOccurrenceAt(occurrences, FILE, 1, 5);
  assert.equal(definition?.name, "score");
  assert.equal(definition?.kind, "definition");

  // A cursor in the middle of the word still resolves to the same site.
  const inside = findOccurrenceAt(occurrences, FILE, 1, 7);
  assert.equal(inside?.name, "score");
  assert.equal(inside?.kind, "definition");

  assert.equal(findOccurrenceAt(occurrences, FILE, 1, 1), undefined);

  // `change x to ...` redeclares its target, so the site is a definition.
  const changeTarget = findOccurrenceAt(occurrences, FILE, 2, 8);
  assert.equal(changeTarget?.name, "score");
  assert.equal(changeTarget?.kind, "definition");

  const changeValue = findOccurrenceAt(occurrences, FILE, 2, 17);
  assert.equal(changeValue?.name, "score");
  assert.equal(changeValue?.kind, "reference");

  const sayRef = findOccurrenceAt(occurrences, FILE, 3, 5);
  assert.equal(sayRef?.kind, "reference");

  const sites = occurrencesNamed(occurrences, "score");
  assert.ok(sites.length >= 4, `expected every site, got ${sites.length}`);
  assert.ok(sites.every((site) => site.name === "score"));
  assert.ok(sites.some((site) => site.kind === "definition"));
  assert.ok(sites.some((site) => site.kind === "reference"));
  assert.deepEqual(occurrencesNamed(occurrences, "nothing here"), []);
});

// -------------------------------------------------------------- cross-file

test("cross-file symbols resolve through use imports", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "engcode-symbols-"));
  try {
    const helperPath = path.join(folder, "helper.eng");
    const mainPath = path.join(folder, "main.eng");
    fs.writeFileSync(helperPath, join("define greet with name:", '    say "hi " plus name', "end"));
    fs.writeFileSync(
      mainPath,
      join('use "helper.eng"', "set total to 1", 'say greet "Ada"', "add 5 to total", "say total"),
    );

    const analysis = analyze(mainPath, fs.readFileSync(mainPath, "utf8"));
    const errors = analysis.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message);
    assert.deepEqual(errors, [], "cross-file sample must be error-free");

    const program = analysis.program;
    assert.ok(program, "cross-file sample must produce a program");

    const files: SymbolFile[] = [
      { path: mainPath, tokens: Lexer.lex(mainPath, fs.readFileSync(mainPath, "utf8")) },
      { path: helperPath, tokens: Lexer.lex(helperPath, fs.readFileSync(helperPath, "utf8")) },
    ];
    const fromAst = buildOccurrences(files, { program });
    const fromDegraded = buildOccurrences(files, { names: analysis.names! });
    assert.ok(fromAst.length > 0);
    assert.deepEqual(keys(fromDegraded), keys(fromAst), "cross-file builds disagree");

    // The call in main.eng resolves to the definition in helper.eng.
    const sites = occurrencesNamed(fromAst, "greet");
    const definition = sites.find(
      (site) => site.kind === "definition" && site.file === path.resolve(helperPath),
    );
    assert.ok(definition, "greet must be defined in helper.eng");
    assert.equal(findOccurrenceAt(fromAst, helperPath, 1, 8)?.kind, "definition");
    assert.equal(findOccurrenceAt(fromAst, helperPath, 1, 8)?.name, "greet");

    const call = sites.find((site) => site.kind === "reference" && site.file === path.resolve(mainPath));
    assert.ok(call, "greet must be called from main.eng");
    assert.equal(findOccurrenceAt(fromAst, mainPath, 3, 5)?.name, "greet");
    assert.equal(findOccurrenceAt(fromAst, mainPath, 3, 5)?.kind, "reference");
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- broken file

test("a file that fails to parse still resolves what it can", () => {
  const brokenPath = path.resolve("virtual-broken.eng");
  const source = join("set score to 0", "set name to", "say name");

  const analysis = analyze(brokenPath, source);
  assert.equal(analysis.program, undefined, "a parse error must suppress the program");
  assert.ok(analysis.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
  assert.ok(analysis.names, "the name table survives a parse error");

  const files: SymbolFile[] = [{ path: brokenPath, tokens: Lexer.lex(brokenPath, source) }];
  const withNames = buildOccurrences(files, { names: analysis.names! });
  const withFallback = buildOccurrences(files);
  assert.deepEqual(keys(withFallback), keys(withNames), "the prescan fallback must agree");

  // `set score to 0` keeps its declaration, `say name` keeps its reference.
  const score = findOccurrenceAt(withNames, brokenPath, 1, 5);
  assert.equal(score?.name, "score");
  assert.equal(score?.kind, "definition");

  const nameDeclaration = findOccurrenceAt(withNames, brokenPath, 2, 5);
  assert.equal(nameDeclaration?.name, "name");
  assert.equal(nameDeclaration?.kind, "definition");

  const nameReference = findOccurrenceAt(withNames, brokenPath, 3, 5);
  assert.equal(nameReference?.name, "name");
  assert.equal(nameReference?.kind, "reference");

  assert.equal(occurrencesNamed(withNames, "score").length, 1);
  assert.equal(occurrencesNamed(withNames, "name").length, 2);
});

// ------------------------------------------------------------ hostile input

test("empty and punctuation-only input never crash the symbol index", () => {
  const edgePath = path.resolve("virtual-edge.eng");
  const inputs = ["", "\n\n", "   ", "( )", "1, 2", ": :", '"unterminated', "it's"];

  for (const source of inputs) {
    // `analyze` swallows lexer errors by returning an empty token list.
    const analysis = analyze(edgePath, source);
    const occurrences = buildOccurrences([{ path: edgePath, tokens: analysis.tokens }], {
      names: analysis.names,
    });
    assert.ok(Array.isArray(occurrences), `input ${JSON.stringify(source)} must not crash`);
    for (const occurrence of occurrences) {
      assert.ok(occurrence.name.length > 0);
      assert.ok(occurrence.length >= 0);
      assert.ok(occurrence.line >= 1);
      assert.ok(occurrence.column >= 1);
    }
  }
});
