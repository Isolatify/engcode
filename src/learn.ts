import * as fs from "node:fs";
import * as path from "node:path";
import { compileWeb } from "./web/compiler.js";
import { renderDiagnostic } from "./diagnostics.js";
import { Interpreter, type InputSource } from "./interpreter.js";
import { analyze } from "./program.js";
import type { Program } from "./ast.js";

export interface Lesson {
  id: number;
  title: string;
  idea: string;
  example: string;
  task: string;
  hint: string;
  /** Extra files for lessons about modules. */
  files?: { name: string; content: string }[];
  /** Scripted answers for lessons that ask for input. */
  input?: string[];
  /** What the example should print (none for app lessons). */
  expected?: string;
  /** App lessons build a page instead of printing to the terminal. */
  app?: boolean;
}

export interface LearnProgress {
  completed: number[];
  attempts: Record<string, number>;
}

const LESSONS: Lesson[] = [
  {
    id: 1,
    title: "Hello",
    idea: "`say` prints one line of text. Text goes inside double quotes.",
    example: 'note: Lesson 1 - Hello.\nsay "Hello, world!"',
    task: "Change the greeting to your own name and run it.",
    hint: 'Try: say "Hello, Ada!"',
    expected: "Hello, world!",
  },
  {
    id: 2,
    title: "Names and values",
    idea: "`set` gives a name to a value. You can use that name later.",
    example: 'set name to "Sam"\nsay "Hello, " plus name',
    task: "Store your own name and print a greeting.",
    hint: 'The plus sign joins text together: "Hi, " plus name.',
    expected: "Hello, Sam",
  },
  {
    id: 3,
    title: "Working with text",
    idea: "`uppercase of`, `length of`, and `plus` work on text.",
    example: 'set word to "Eng"\nsay word plus "Code"\nsay uppercase of word\nsay length of word',
    task: "Print the length of your own word.",
    hint: "Spaces count as characters too.",
    expected: "EngCode\nENG\n3",
  },
  {
    id: 4,
    title: "Numbers and rounding",
    idea: "Numbers can be added, multiplied, and rounded in plain English.",
    example: "set price to 12\nset tax to price times 0.2\nsay round of tax\nsay price plus 1",
    task: "Change the price and predict the two answers before running.",
    hint: "`round of 2.4` is 2. `round of 2.6` is 3.",
    expected: "2\n13",
  },
  {
    id: 5,
    title: "Asking for input",
    idea: "`ask ... and save it as ...` reads one answer from the person using the program.",
    example: 'ask "What is your name?" and save it as name\nsay "Hello, " plus name',
    task: "Ask for a favourite colour instead of a name.",
    hint: 'Use: ask "Favourite colour?" and save it as colour',
    input: ["Ada"],
    expected: "Hello, Ada",
  },
  {
    id: 6,
    title: "Conditions",
    idea: "`if`, `otherwise if`, and `otherwise` choose which block runs.",
    example:
      'set age to 20\nif age is at least 18:\n    say "You can vote."\notherwise:\n    say "Not yet."\nend',
    task: "Set age to 12 and check that the other branch runs.",
    hint: "The colon opens the block and `end` closes it.",
    expected: "You can vote.",
  },
  {
    id: 7,
    title: "Comparisons",
    idea: "Compare values with `is`, `is not`, `is greater than`, `contains`, and `starts with`.",
    example:
      'set score to 7\nif score is greater than 5:\n    say "high"\nend\nif "cat" starts with "c":\n    say "starts"\nend\nif "a,b" contains ",":\n    say "has comma"\nend',
    task: "Add a test for `ends with`.",
    hint: 'Try: if "hello" ends with "lo":',
    expected: "high\nstarts\nhas comma",
  },
  {
    id: 8,
    title: "Loops",
    idea: "`repeat` runs a block a fixed number of times. `count from ... to ... as ...` gives you a number each turn.",
    example:
      'repeat 3 times:\n    say "Hello"\nend\ncount from 1 to 3 as number:\n    say number\nend',
    task: "Print the numbers from 1 to 5.",
    hint: "Change 3 to 5 in the count loop.",
    expected: "Hello\nHello\nHello\n1\n2\n3",
  },
  {
    id: 9,
    title: "Lists",
    idea: "A list keeps values in order. Positions start at 1.",
    example:
      'set fruits to a list of "apple", "banana", "cherry"\nsay length of fruits\nsay item 1 of fruits\nadd "date" to fruits\nsort fruits\nsay join fruits with ", "',
    task: "Add another fruit and print the last item.",
    hint: "`last item of fruits` reads the final value.",
    expected: "3\napple\napple, banana, cherry, date",
  },
  {
    id: 10,
    title: "Tables",
    idea: "A table stores values under names. Read one with `'s`.",
    example:
      'set person to a table with name "Sam", age 25\nsay person\'s name\nchange person\'s age to 26\nset place to a table with city "Paris"\nsay place\'s city',
    task: "Add a country to the table and print it.",
    hint: 'A table looks like: a table with city "Paris", country "France"',
    expected: "Sam\nParis",
  },
  {
    id: 11,
    title: "Functions",
    idea: "`define` makes a reusable block. `give back` returns a value.",
    example: 'define greet with who:\n    give back "Hello, " plus who\nend\nsay greet "Sam"',
    task: "Write a function that doubles a number.",
    hint: "Define it with one parameter, then give back `number times 2`.",
    expected: "Hello, Sam",
  },
  {
    id: 12,
    title: "Functions that call themselves",
    idea: "A function can call itself. This is called recursion.",
    example:
      "define factorial with n:\n    if n is at most 1:\n        give back 1\n    end\n    give back n times (call factorial with n minus 1)\nend\nsay factorial 5",
    task: "Try factorial 6 and predict the answer first.",
    hint: "5 factorial is 120. 6 factorial is 720.",
    expected: "120",
  },
  {
    id: 13,
    title: "Default values",
    idea: "A parameter can have a default, so callers may leave it out.",
    example:
      'define greet with who default "friend":\n    say "Hello, " plus who\nend\ngreet\ngreet "Sam"',
    task: "Add a second default parameter for a greeting.",
    hint: "Separate parameters with a comma.",
    expected: "Hello, friend\nHello, Sam",
  },
  {
    id: 14,
    title: "Friendly errors",
    idea: "`try` runs risky steps. `if it fails:` runs when something goes wrong, and `the error` explains what happened.",
    example:
      'try:\n    say 10 divided by 0\nif it fails:\n    say "I caught an error."\nend',
    task: 'Print `the error` inside the failure block.',
    hint: 'Try: say "Caught: " plus the error',
    expected: "I caught an error.",
  },
  {
    id: 15,
    title: "Files",
    idea: "Programs may write and read files inside the project folder.",
    example:
      'write "first line" to file "lesson-note.txt"\nappend "second line" to file "lesson-note.txt"\nread file "lesson-note.txt" and save it as notes\nsay notes\ndelete file "lesson-note.txt"',
    task: "Write three lines, read them back, then delete the file.",
    hint: "Each `write` or `append` adds a newline after the text.",
    expected: "first line\nsecond line",
  },
  {
    id: 16,
    title: "Modules",
    idea: "Put shared definitions in another file and load them with `use`.",
    example: 'use "helpers.eng"\nsay greet "Sam"',
    files: [
      {
        name: "helpers.eng",
        content: 'define greet with who:\n    give back "Hello, " plus who\nend\n',
      },
    ],
    task: "Move a function into helpers.eng and use it from main.eng.",
    hint: "Paths in `use` are relative to the file that imports them.",
    expected: "Hello, Sam",
  },
  {
    id: 17,
    title: "Your first page",
    idea: "An app has pages. Each page contains UI blocks such as `heading` and `text`.",
    example:
      'app "Hello Page":\n    page "Home":\n        heading "Hello, page"\n        text "This text is part of the page."\n    end\nend',
    task: "Add a second page and a button.",
    hint: 'A page starts with page "Name": and ends with end.',
    app: true,
  },
  {
    id: 18,
    title: "Styling",
    idea: "`style everything:` changes the whole page. Themes and colours are English names too.",
    example:
      'app "Styled Page":\n    page "Home":\n        heading "Styled"\n        text "Colour and space come from style blocks."\n    end\nend\n\nstyle everything:\n    font is modern\n    background is #0f172a\n    text color is #f8fafc\n    padding is 32\nend',
    task: "Change the background colour and corner radius.",
    hint: "Colours look like #0f172a. Radius is written `rounded corners is 12`.",
    app: true,
  },
  {
    id: 19,
    title: "Events",
    idea: "`when ... is clicked:` runs steps after the visitor acts.",
    example:
      'app "Click Counter":\n    page "Home":\n        heading "Click the button"\n        button "Count" called "count"\n        text "0" called "result"\n    end\nend\n\nwhen "count" is clicked:\n    change text of "result" to "You clicked me!"\nend',
    task: "Change the text instead of showing a popup.",
    hint: 'Use: change text of "result" to "Clicked!"',
    app: true,
  },
  {
    id: 20,
    title: "State and storage",
    idea: "`keep track` refreshes the screen when a value changes. `save ... to the device` remembers it next time.",
    example:
      'app "Remember Me":\n    page "Home":\n        heading "Remember Me"\n        input called "name" with label "Your name"\n        button "Save" called "save"\n        text "" called "message"\n    end\nend\n\nkeep track of saved name as ""\n\nwhen "save" is clicked:\n    change saved name to value of "name"\n    save saved name to the device as "name"\n    change text of "message" to "Saved " plus saved name\nend',
    task: "Load the saved name when the page starts.",
    hint: "You can load a value with `load from the device` and set the state.",
    app: true,
  },
];

export function allLessons(): Lesson[] {
  return LESSONS;
}

export function findLesson(id: number): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

export function progressFile(folder = process.cwd()): string {
  return path.join(folder, ".engcode", "learn.json");
}

export function loadProgress(folder = process.cwd()): LearnProgress {
  try {
    const parsed = JSON.parse(fs.readFileSync(progressFile(folder), "utf8")) as Partial<LearnProgress>;
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id) => typeof id === "number") : [],
      attempts: parsed.attempts && typeof parsed.attempts === "object" ? parsed.attempts : {},
    };
  } catch {
    return { completed: [], attempts: {} };
  }
}

export function saveProgress(progress: LearnProgress, folder = process.cwd()): void {
  const file = progressFile(folder);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        completed: [...new Set(progress.completed)].sort((a, b) => a - b),
        attempts: progress.attempts,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

class LessonInput implements InputSource {
  private index = 0;
  constructor(private readonly answers: string[]) {}
  readLine(): string {
    if (this.index >= this.answers.length) {
      throw new Error("This lesson needs another answer.");
    }
    return this.answers[this.index++]!;
  }
}

export interface LessonRun {
  ok: boolean;
  output: string;
  diagnostics: string[];
}

/** Runs one lesson example, used by the CLI and by the tutorial tests. */
export function runLessonExample(lesson: Lesson, folder = process.cwd()): LessonRun {
  if (lesson.files && lesson.files.length > 0) {
    return {
      ok: true,
      output:
        "This lesson uses more than one file. Create helpers.eng next to main.eng, then run `engcode run main.eng`.\n",
      diagnostics: [],
    };
  }

  const analysis = analyze(path.join(folder, `lesson-${lesson.id}.eng`), lesson.example, {
    root: folder,
    modules: false,
    allowApps: true,
  });
  const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning");
  if (errors.length > 0 || !analysis.program) {
    return { ok: false, output: "", diagnostics: errors.map(renderDiagnostic) };
  }

  if (lesson.app) {
    const build = compileWeb(analysis.program, {
      root: folder,
      allowedHosts: [],
    });
    if (build.diagnostics.length > 0) {
      return { ok: false, output: "", diagnostics: build.diagnostics.map(renderDiagnostic) };
    }
    return {
      ok: true,
      output: `Built "${build.appName}" with ${build.definition.pages.length} page${
        build.definition.pages.length === 1 ? "" : "s"
      }. Use \`engcode serve\` to open it in a browser.\n`,
      diagnostics: [],
    };
  }

  let output = "";
  try {
    const interpreter = new Interpreter({
      write: (chunk) => {
        output += chunk;
      },
      input: new LessonInput(lesson.input ?? []),
      fileRoot: folder,
      maxSteps: 100_000,
    });
    interpreter.run(analysis.program as Program);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output, diagnostics: [message] };
  }
  return { ok: true, output, diagnostics: [] };
}

export function lessonIsCorrect(lesson: Lesson, output: string): boolean {
  if (!lesson.expected) return true;
  return normalize(output) === normalize(lesson.expected);
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
