# EngCode — Design Document

**Slogan:** Build with Simple English  
**File extension:** `.eng`  
**Status:** Milestones 1–5 are implemented. The terminal language, web compiler, browser runtime, themes and media, live-reload server, six web app examples (including a Windows 11-styled desktop notebook), generated Electron desktop projects, formatter, linter, step debugger, 20-lesson tutorial, local playground, VS Code extension, and install/release scripts are complete and tested. Remaining M4 packaging limits are code signing, notarization, and a Node-free standalone binary.  
**Formal grammar:** [docs/grammar.md](grammar.md)

---

## 1. What we are building

One language, two worlds:

1. **Scripts** — small terminal programs: games, calculators, quizzes, text tools, data programs.
2. **Apps and websites** — a single `.eng` file containing structure (blocks), styling, and behavior, compiled to HTML + CSS + JavaScript and wrapped as a desktop app when needed.

The guiding test for every feature is simple: *can a beginner read the line out loud and understand it?* If not, the syntax is wrong.

This document fixes the language surface, the keyword set, the execution model, the app model, the CLI, the repository layout, the test strategy, and the milestones.

---

## 2. Decisions at a glance

| Area | Decision | Why |
|---|---|---|
| Implementation | TypeScript on Node.js (ESM) | One language for compiler, web runtime, CLI, tests, and the VS Code extension; excellent tooling; fast enough with a compiled-closure interpreter. |
| Parser | Hand-written recursive descent + a cheap name pre-scan | English-like ambiguity needs errors phrased in English, not parser-generator noise. The pre-scan collects multi-word names before expressions are parsed. |
| Script execution | Closure-compiled AST interpreter | Each AST node is compiled once to a JavaScript closure. This avoids a giant `switch` per node and comfortably meets the 1M-loop budget. A bytecode VM is the fallback if benchmarks demand it. |
| Web/app backend | AST → semantic HTML + CSS + a small JavaScript runtime | Output is readable, accessible, and dependency-free. No `eval` and no raw user HTML in generated apps. |
| Desktop | **Electron**, with a Tauri-ready packaging adapter | This machine has no Rust toolchain; Electron gives a Node-only pipeline and reliable `.exe`/`.dmg` packaging. The generated app is plain web assets, so a Tauri adapter can be added without touching the language. |
| Web output | Single-page app with hash routes (`#/home`) | One `index.html` + shared assets; state survives page changes; `go to page` is instant. |
| Standard library | English-named built-ins, always available | `use math` is accepted for readability, but beginners should not have to import arithmetic. |
| Dependencies | Node built-ins only for the compiler and CLI; `electron` only for desktop packaging and electron-packager for release folders; `happy-dom` for DOM tests | Offline install, small attack surface, no framework churn. |
| Tests | `node:test` + built-in coverage | Zero test-framework dependencies and first-class TypeScript/ESM support. |

---

## 3. Language

### 3.1 Source layout

- One statement per line. No semicolons.
- Blocks begin with `:` and end with `end`.
- Indentation is cosmetic: the parser uses `end`, not spaces. The formatter always indents by four spaces.
- Comments start with `note:` and run to the end of the line.
- Blank lines are ignored.
- Keywords are case-insensitive. Variable names, table keys, and function names are case-sensitive.
- Strings use double quotes. Escapes: `\"`, `\\`, `\n`, `\t`.

```eng
note: this is a comment
say "Hello"    note: trailing comments are allowed
```

### 3.2 Names, and how English ambiguity is handled

Names may contain spaces:

```eng
set player score to 0
set is happy to yes
set nothing here to nothing
```

`is happy` and `nothing here` are valid names even though `is` and `nothing` are keywords in other positions. Three rules make this work:

1. **Names cannot contain hard delimiters.** These words end a name while it is being declared: `to`, `from`, `with`, `as`, `in`, `and`, `or`, `called`, `showing`, `level`, `default`, `that`, plus `,` and `:`. So `player score` is fine; `player to score` is not.
2. **Declared names win, longest first.** Before parsing, EngCode scans the file for names introduced by `set`, `change`, `keep track of`, `for each`, `count ... as`, `define`, parameters, object fields, and methods. In an expression, the longest declared name that matches the next words is used. This is why `is happy is yes` works: `is happy` is one name, then `is`, then `yes`.
3. **No match means one word.** If no declared name matches, the parser takes one word and the checker reports an unknown name with a "did you mean" suggestion.

Corollary: avoid ending a name with an operator word (`score plus`, `age is`). It parses, but it reads badly. The linter warns about this.

**Built-in names** (`length`, `uppercase`, `random`, `value`, `data`, `item`, ...) are contextual: they are keywords only in their phrase (`length of`, `value of`). A built-in phrase wins over a same-named variable when the following words complete the phrase; otherwise the variable is used. User-defined functions may not reuse a built-in function name. `that` is a hard delimiter too, because it ends the parameter list of an anonymous function.

### 3.3 Values

| Type | English word | Literals |
|---|---|---|
| Number | `number` | `0`, `25`, `9.99`, `-4` |
| Text | `text` | `"Sam"`, `""` |
| True/false | `yes` / `no` | `yes`, `no` |
| Nothing | `nothing` | `nothing` |
| List | `list` | `a list of 1, 2, 3` or `an empty list` |
| Table | `table` | `a table with name "Sam", age 25` or `an empty table` |
| Function | `function` | `the function greet`, `a function ...` |
| Object | a kind name | `a new Dog with name "Rex"` |

`nothing` means "no value". Reading a missing table key or an out-of-range list position gives `nothing`; reading a missing object field is an error with a suggestion.

Numbers are IEEE-754 doubles. Output trims floating-point noise (twelve significant digits), so `0.1 plus 0.2` prints `0.3`, not `0.30000000000000004`.

### 3.4 Variables

```eng
set name to "Sam"          note: create or replace
set age to 25
change age to age plus 1   note: update; error if the name does not exist
add 5 to age               note: number target: numeric add
add "mango" to fruits      note: list target: append
add "!" to message         note: text target: append
remove "banana" from fruits
set person's age to 26
set person's "home address" to "12 Main Street"
```

- `set` creates or replaces. `change` only updates an existing name; this catches typos.
- Variables are dynamically typed and block-scoped. A function sees its own parameters, its locals, and the global scope (lexical closure).
- `add` and `remove` are type-aware. A beginner does not need different words for numbers, text, lists, and tables.
- A table key with spaces is quoted: `person's "home address"`. A single-word key is unquoted: `person's age`.

### 3.5 Expressions

Expressions read left to right, with the usual precedence but English words instead of symbols.

```eng
set total to 4 plus 5 times 2          note: 14
set half to total divided by 2
set remainder to 10 remainder 3
set shout to uppercase of "hello"
set size to length of name
set ok to age is at least 18 and age is less than 65
set nice to not name is empty
```

**Precedence, loosest to tightest:**

| Level | Operators | Notes |
|---|---|---|
| 1 | `or` | |
| 2 | `and` | |
| 3 | `not` | Prefix. `not x is empty` means `not (x is empty)`. |
| 4 | `is`, `is not`, `is greater than`, `is less than`, `is at least`, `is at most`, `is between A and B`, `contains`, `starts with`, `ends with`, `is empty`, `is not empty` | Comparisons do not chain; `a is b is c` is an error. |
| 5 | `plus`, `minus` | If either side is text, the result is text. |
| 6 | `times`, `divided by`, `remainder` | Numbers only. Division by zero is a catchable runtime error. |
| 7 | `minus` (prefix) | `-5` and `minus 5` are the same. |
| 8 | `'s` property access, function calls, built-in phrases | Tightest. |
| 9 | literals, names, parentheses | `(` and `)` group expressions. |

**Function calls.** Three forms:

```eng
greet "Sam"                                  note: statement call, known function
set result to add 2 and 3                    note: call in an expression
say call formatter with "hi", 3              note: explicit call; useful for function values
```

- Arguments are separated by `and` or `,`.
- Inside an argument list, `and` always separates arguments. `check a and b` means `check(a, b)`. To pass one combined condition, use parentheses: `check (a and b)`. This rule is stated in the error message whenever it bites.
- A bare known function name in expression position is a **function value** if it has parameters; to call it, use `call name with ...`. A zero-parameter function used bare is called. `the function name` explicitly gets the value.
- `call f with ...` works for any value that is a function, including anonymous functions.
- Default values: a missing argument uses the parameter default. Missing non-default arguments are an error that names the parameter.
- Functions capture their defining scope (closures) and may call themselves (recursion).

**Built-in phrases (expressions):**

```eng
uppercase of "hello"       lowercase of "HI"        trim of "  hi  "
length of name             item 2 of fruits          last item of fruits
square root of 9           absolute value of -4      round of 3.6
minimum of 2 and 8         maximum of 2 and 8        power of 2 and 8
random number from 1 to 10 random item of fruits     random decimal
split "a,b,c" by ","       join fruits with ", "     replace "a" with "b" in text
text of 42                 number from "42"          position of "b" in "abc"
JSON of person             data from JSON text       now                 today
value of "new task"        key "w" is pressed
```

**Literals.**

```eng
set fruits to a list of "apple", "banana", "cherry"
set mixed to a list of 1 and "two" and yes
set nothing yet to an empty list
set person to a table with name "Sam", age 25
set empty table to an empty table
set double to a function with x that gives back x times 2
set greet to a function with name that does:
    say "Hello, " plus name
end
```

List items are separated by `and` or `,`. Table entries use commas and a single-word key (quote a multi-word key). Values stop before `and`, so a list of tables separates its items with `and`:

```eng
set people to a list of a table with name "Sam", age 25 and a table with name "Ada", age 36
```

Parentheses may always be used to make grouping explicit. When in doubt, add them; the formatter keeps them.

### 3.6 Full keyword list

Keywords are recognized case-insensitively. Most are **contextual**: they are keywords only in the construct where they appear, which is what allows names such as `is happy` and `nothing here`. The only words that may never appear inside a name are the hard delimiters listed in 3.2.

**Statements and blocks**

`note`, `set`, `to`, `change`, `add`, `remove`, `from`, `say`, `ask`, `for`, `save`, `as`, `it`, `if`, `otherwise`, `end`, `repeat`, `times`, `each`, `in`, `count`, `while`, `stop`, `the`, `loop`, `skip`, `next`, `one`, `define`, `with`, `give`, `gives`, `back`, `that`, `does`, `try`, `fails`, `use`, `read`, `write`, `file`, `files`, `append`, `delete`, `get`, `send`, `data`, `play`, `sound`, `show`, `hide`, `clear`, `go`, `page`, `open`, `close`, `keep`, `track`, `sort`, `reverse`, `shuffle`, `descending`, `wait`, `seconds`, `draw`, `canvas`

**Operators and comparison words**

`plus`, `minus`, `times`, `divided`, `by`, `remainder`, `and`, `or`, `not`, `is`, `greater`, `than`, `less`, `at`, `least`, `most`, `between`, `contains`, `starts`, `ends`, `empty`, `of`

**Literal and structural words**

`yes`, `no`, `nothing`, `a`, `an`, `the`, `new`, `kind`, `thing`, `has`, `can`, `it`, `its`, `called`, `showing`, `level`, `default`, `on`

**Values and conversion**

`text`, `number`, `list`, `table`, `function`, `value`, `item`, `last`, `length`, `JSON`, `error`

**Standard-library words**

`uppercase`, `lowercase`, `trim`, `split`, `join`, `replace`, `position`, `round`, `floor`, `ceiling`, `square`, `root`, `absolute`, `minimum`, `maximum`, `power`, `pi`, `sine`, `cosine`, `tangent`, `random`, `shuffle`, `now`, `today`, `format`, `year`, `month`, `day`, `hour`, `minute`, `second`, `wait`, `exists`, `read`, `write`, `append`, `delete`, `get`, `send`, `device`, `load`, `save`, `sound`, `play`, `data`, `from`, `to`, `by`, `with`, `in`, `files`

**UI block words**

`app`, `page`, `section`, `row`, `column`, `grid`, `heading`, `paragraph`, `text`, `button`, `input`, `area`, `text area`, `checkbox`, `dropdown`, `radio`, `choice`, `slider`, `switch`, `image`, `video`, `audio`, `list`, `table`, `card`, `menu`, `navigation`, `bar`, `footer`, `form`, `link`, `icon`, `divider`, `popup`, `tabs`, `tab`, `canvas`

**UI attributes and actions**

`called`, `label`, `hint`, `choices`, `showing`, `level`, `description`, `poster`, `submits`, `required`, `loops`, `starting`, `minimum`, `maximum`, `columns`, `width`, `height`, `gap`, `min`, `max`, `go`, `open`, `close`, `show`, `hide`, `clear`, `change`, `text`, `value`, `background`, `text color`, `font`, `size`, `padding`, `margin`, `rounded`, `corners`, `border`, `shadow`, `alignment`, `layout`, `direction`, `wrap`, `opacity`, `transition`, `animation`, `animate`, `over`, `pressed`, `focused`, `dark`, `mode`, `theme`, `light`, `full`, `half`, `auto`, `percent`, `small`, `big`, `screens`, `phones`, `tablets`

**Events**

`when`, `clicked`, `changes`, `changed`, `typed`, `hovered`, `opens`, `resized`, `every`, `seconds`, `frame`, `the`, `page`, `window`, `user`, `types`, `in`, `presses`, `key`, `mouse`, `enters`, `leaves`, `submitted`, `checked`

The canonical event phrase is the one used in this document; aliases are not added unless they cost nothing. One obvious way is better than five.

**Not keywords:** color names (`blue`, `light gray`), font names, file paths, table keys, and property names after `'s` are values, not keywords. They are parsed in their own contexts.

### 3.7 Output and input

```eng
say "Hello, " plus name
ask "What is your name?" and save it as name
ask for a number "How old are you?" and save it as age
```

- `say` prints a line in scripts. In a web app it shows a short toast (and logs to the console).
- `ask` always returns text, trimmed. `ask for a number` keeps asking until the text is a valid number, with a friendly retry message.
- `ask` is terminal-only. `engcode check` warns if a `.eng` file that also declares an app uses `ask`; use an `input` block in apps.

### 3.8 Conditions

```eng
if age is greater than 17:
    say "Adult"
otherwise if age is 17:
    say "Almost there"
otherwise:
    say "Minor"
end
```

Supported comparisons:

```eng
x is y                  x is not y
x is greater than y     x is less than y
x is at least y         x is at most y
x is between 13 and 19  note: inclusive
text contains "ell"     list contains item      table contains "key"
text starts with "He"   text ends with "!"
x is empty              x is not empty
```

- `is` compares by value. Lists and tables compare deeply.
- Ordering comparisons need two numbers or two texts. Mixing types is an error with a suggestion, not a silent `no`.
- Conditions must be `yes`/`no` (or a comparison). Truthiness is intentionally absent: `if count:` is an error; write `if count is greater than 0:`.
- `and` and `or` short-circuit. Parentheses group.
- `otherwise if` and `otherwise` belong to the nearest open `if`.

### 3.9 Loops

```eng
repeat 5 times:
    say "Hello"
end

for each fruit in fruits:
    say fruit
end

count from 1 to 10:
    say counter
end

count from 1 to 10 as number:
    say number
end

while lives is greater than 0:
    change lives to lives minus 1
end

for each item in items:
    if item is empty:
        skip to the next one
    end
    if item is "stop":
        stop the loop
    end
end
```

- `count` includes both ends: `count from 1 to 3` runs three times.
- The implicit count variable is `counter`; `as name` renames it.
- `stop the loop` and `skip to the next one` affect the innermost loop. Inside `every ... seconds` or `every frame`, they stop or skip that timer tick.
- All loops are bounded by their condition; there is no hidden iteration cap. The REPL warns after a long-running loop so beginners are not stuck.

### 3.10 Lists and tables

```eng
set fruits to a list of "apple", "banana", "cherry"
add "mango" to fruits
remove "banana" from fruits
say item 1 of fruits          note: apple
say last item of fruits
say length of fruits
sort fruits
reverse fruits

set person to a table with name "Sam", age 25
say person's name
set person's age to 26
set person to a table with "home address" "12 Main Street"
say person's "home address"

for each fruit in fruits:
    say fruit
end

for each person in people:
    say person's name plus " is " plus person's age
end
```

- Positions are **1-based**. `item 1` is the first item. Out-of-range reads return `nothing`; the linter flags literal out-of-range positions.
- `add` appends to a list, adds a number, or appends text. `remove` removes the first equal item from a list, or a key from a table.
- `sort` sorts numbers numerically and text alphabetically, in place. `reverse` reverses a list or text.
- `length of` works on text (characters), lists (items), and tables (keys).
- A missing table key reads as `nothing`. `table contains "key"` checks for it.
- `a table with name "Sam", age 25` uses single-word keys. Quote keys with spaces.
- Tables preserve insertion order when printed.

### 3.11 Functions

```eng
define greet with name:
    say "Hello, " plus name
end

define add with a and b:
    give back a plus b
end

define welcome with name and greeting default "Hello":
    say greeting plus ", " plus name
end

greet "Sam"
welcome "Sam"
set result to add 2 and 3
say result
```

- Parameters are separated by `and` or `,`. A default follows the parameter: `greeting default "Hello"`.
- `give back` returns a value. Reaching the end returns `nothing`.
- Functions may be recursive. The interpreter uses a normal call stack and reports deep recursion as a friendly "too many nested calls" error.
- Functions are values:

```eng
set double to a function with x that gives back x times 2
set greeter to a function with name that does:
    say "Hello, " plus name
end

set formatter to a function with text that gives back uppercase of text
say call double with 21
say call formatter with "hi"
```

- A one-line anonymous function uses `that gives back`. A multi-line one uses `that does:` and ends with `end`.
- Closures capture the scope where they are defined, so the returned function keeps access to its variables.
- Calling an unknown function, or passing the wrong number of arguments, is a compile-time error whenever the target is known. Wrong types are runtime errors with the line, the call trail, and a fix.
- `give back` outside a function is an error.

### 3.12 Errors

```eng
try:
    set x to 10 divided by 0
if it fails:
    say "Something went wrong: " plus the error
end
```

- Only runtime errors are catchable. Syntax and semantic errors are reported before the program runs, so a typo cannot be hidden inside `try`.
- `the error` is the error message as text, without a stack trace.
- The CLI prints a short English call trail: `in calculate (line 4)`, `in the top level (line 12)`. `--debug` adds details for contributors.
- Error messages always contain: a friendly sentence, the file and line, the source line, a caret span, and a suggested fix when one can be inferred.

Example:

```text
Oops — line 4 of budget.eng

  4 | set total to "ten" minus 2
      ^^^^^^^^^^^^^^^^^^^^^^^^
I can't subtract from text.

Try this:
  set total to 10 minus 2
```

### 3.13 Modules and files

```eng
use "helpers.eng"
use math
use time
use theme "dark"

read file "notes.txt" and save it as notes
write "hello" to file "out.txt"
append "more" to file "out.txt"
if file "out.txt" exists:
    say "found it"
end
```

- `use "path.eng"` imports a module. Its top-level definitions become available; its top-level statements run once, on first import. Names may not collide. Import cycles produce a friendly error with the chain of files.
- Paths are relative to the importing file. Imports must stay inside the project root; the path check normalises the path and rejects escapes. It does not resolve symlinks, so a project should not link outside its own folder.
- `use math`, `use time`, `use random`, `use json`, `use files`, `use web`, and `use storage` are accepted and document intent. The standard library is always available; the `use` line is never required.
- `use theme "dark"` is a UI declaration, not an import. It sets the initial color theme.

**Capabilities are visible.** EngCode declares and prints what a program can touch:

| Capability | Default | Control |
|---|---|---|
| Read/write project files | Allowed inside the project root only | Absolute paths and `..` escapes rejected |
| Network (`get data`, `send data`) | Denied in terminal scripts | Host must be listed in `engcode.json` under `allow.network`, or pass `--allow-network` for a one-off run; HTTPS only |
| Device storage (`save ... to the device`) | Allowed, namespaced per project | Stored in `.engcode/storage.json` for scripts, `localStorage` for web |
| Desktop window | Same rules as scripts | Sandboxed Electron window served from loopback; no Node.js in the page |

`engcode lint` reports capability use as advice before any code runs:

```text
This program can use project files.
This program can contact the network.
This program can use device storage.
```

`engcode check --lint` includes the same notes alongside its diagnostics.

`engcode.json` is created by `engcode new` and is intentionally short:

```json
{
  "name": "weather-app",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

### 3.14 Objects

```eng
define a kind of thing called Dog:
    it has name and age
    it can bark:
        say name plus " says woof"
    end
    it can celebrate:
        change age to age plus 1
    end
end

set rex to a new Dog with name "Rex", age 3
rex bark
rex celebrate
say rex's age
```

- `it has` declares fields. `it can` declares methods; methods may take parameters and `give back` a value. Field names are single words (or a quoted string); method names are single words, which keeps `rex celebrate` unambiguous.
- Inside a method, fields are available by name, and `it` refers to the current object:
  `set it's age to 4` is not valid syntax; write `set age to 4` or `set rex's age to 4`.
- `rex's bark` is a bound function value, so `call rex's bark with 3` works when a return value is needed.
- Constructor fields are comma-separated single-word keys. A constructor with missing fields is an error that names them.
- Object fields are private to the object's methods and explicit property access; they are not globals.

### 3.15 Standard library

All functions are English phrases, available in scripts and apps.

| Area | Phrases |
|---|---|
| Math | `random number from A to B`, `random decimal`, `round of X`, `floor of X`, `ceiling of X`, `square root of X`, `absolute value of X`, `minimum of A and B`, `maximum of A and B`, `power of A and B`, `pi`, `sine of X`, `cosine of X`, `tangent of X` |
| Text | `uppercase of X`, `lowercase of X`, `trim of X`, `length of X`, `split X by S`, `join L with S`, `replace A with B in X`, `position of A in B`, `text of X` |
| Conversion | `number from X`, `JSON of X`, `data from JSON X` |
| Random | `random number from A to B`, `random decimal`, `random item of L`, `shuffle L` |
| Time | `now` (table: year, month, day, hour, minute, second), `today`, `year of T`, `month of T`, `day of T`, `hour of T`, `minute of T`, `second of T`, `format of TIME with PATTERN`, `wait N seconds` |
| Lists/tables | `item N of L`, `last item of L`, `length of L`, `add`, `remove`, `sort`, `reverse`, `join` |
| Files | `read file P`, `write ... to file P`, `append ... to file P`, `delete file P`, `file P exists`, `list files in P` |
| Web | `get data from URL`, `send data X to URL` (both save into a named variable) |
| Device | `save X to the device as K`, `load K from the device`, `delete K from the device` |
| UI | `value of "id"`, `key "w" is pressed`, `canvas` drawing statements, `show`, `hide`, `change text/value/background of`, `go to page`, `open/close popup`, `play sound` |

`format of` patterns support `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`, and month/day names. Unknown letters are copied literally, so beginners can write `"YYYY-MM-DD"` without learning a new language.

---

## 4. Apps and websites

### 4.1 Blocks

A `.eng` file can contain all three layers at once: blocks, styles, and behavior. Script statements can live in the same file and are used by event handlers and functions.

```eng
app "Todo List":
    page "Home":
        heading "My Tasks"
        row:
            input called "new task" with hint "Add a task"
            button "Add" called "add button"
        end
        list called "task list" showing tasks
        divider
        image "logo.png" with description "The Todo logo"
        link "Learn more" to "https://example.com"
    end
end
```

- `app` and `page` are containers. Pages are routes inside a single-page app, addressed as `#/home`.
- Container blocks end with `end`; leaf blocks are one line. This keeps the common case short.
- Every interactive element may have `called "id"`. Ids are the names used by styles and events. They are unique per page; duplicates are an error.
- Visible text can be a literal or an expression, so state can drive the screen:

```eng
text "Count: " plus count called "count label"
heading greeting
```

- `list called "task list" showing tasks` binds a list to state or to a list variable. When the list changes, the screen updates.
- `table called "scores" showing rows` renders a list of tables. `with columns "Name", "Score"` renders an empty headed table instead.
- Inputs get a `<label>` from `with label "..."`, or from the id when no label is given. `with hint` becomes the placeholder and the description read by screen readers.

**Complete block set**

| Purpose | Syntax |
|---|---|
| App / page | `app "Name":` ... `end`, `page "Home":` ... `end` |
| Layout | `section [label] [called "id"]:`, `row:`, `column:`, `grid:`, `card [label]:` |
| Text | `heading "Title" [level 2] [called "id"]`, `paragraph "..."`, `text "..." [called "id"]` |
| Actions | `button "Add" called "add button" [submits]` |
| Inputs | `input called "id" [with label "..."] [with hint "..."] [with starting "..."] [required]`, `text area called "id" [with hint "..."]`, `checkbox "Done" called "id" [with starting yes]`, `switch "Dark mode" called "id"`, `dropdown called "id" with choices "A", "B"`, `radio choice "A" called "id"`, `slider called "id" with minimum 0 and maximum 100 and starting 50` |
| Media | `image "logo.png" [with description "..."] [and width 200 and height 200]`, `video "intro.mp4" [with description "..." and poster "cover.jpg" and loops]`, `audio "music.mp3" [and loops]` |
| Data | `list called "id" [showing items]` (items become focusable buttons when the list has a click handler), `table called "id" (showing rows | with columns "A", "B")` |
| Navigation | `menu:`, `navigation bar:`, `footer:`, `link "Learn more" to "https://..."` |
| Grouping | `form called "id":`, `popup called "id":`, `tabs:` with `tab "One":` ... `end` |
| Decoration | `icon "star"`, `divider` |
| Game canvas | `canvas called "board" with width 800 and height 500` |

Container blocks contain only other blocks. Behavior belongs in `when` handlers. This separation keeps the screen description declarative and makes generated HTML predictable.

### 4.2 Styling

```eng
style "add button":
    background is blue
    text color is white
    rounded corners of 8
    padding is 12
    when mouse is over:
        background is dark blue
    end
end

style everything:
    font is "Helvetica"
    background is light gray
end

style "task list" on small screens:
    width is full
end

style everything in dark mode:
    background is #111827
    text color is #f9fafb
end
```

- Targets: `everything`, a quoted id (`"add button"`), or a block kind (`buttons`, `headings`, `rows`, `cards`, `images`, `videos`, `navigation bar`).
- Properties: `background`, `text color`, `font`, `font size`, `font weight`, `font style`, `line height`, `letter spacing`, `text decoration`, `text transform`, `text shadow`, `width`, `height`, `min width`, `max width`, `min height`, `max height`, `padding`, `margin`, `gap`, `rounded corners`, `border`, `border width`, `border color`, `border style`, `shadow`, `alignment`, `layout`, `direction`, `wrap`, `align items`, `justify content`, `flex grow`, `flex shrink`, `grid columns`, `object fit`, `object position`, `background size`, `background position`, `background repeat`, `overflow`, `position`, `top`, `right`, `bottom`, `left`, `z index`, `cursor`, `opacity`, `transition`, `animation`, `animation delay`.
- Colors: English names (`blue`, `dark blue`, `light gray`, ...), hex (`#0f766e`, `#fff`), or `rgb(15, 118, 110)`.
- Sizes: a bare number means pixels (`padding is 12`); also `50 percent`, `full`, `half`, `auto`.
- `rounded corners of 8` and `rounded corners is 8` are both accepted; the formatter writes `is`.
- States: `when mouse is over:`, `when pressed:`, `when focused:`.
- Responsive: `on small screens` (under 640), `on big screens` (1024 and up), `on phones` (under 480), `on tablets` (480 to 1023).
- Themes: `theme "Day":` defines light values; `theme "Night" in dark mode:` defines dark overrides. Each declaration becomes a CSS variable (`accent` → `--eng-accent`, `background` → `--eng-bg`, `text` → `--eng-fg`, `surface`, `muted`, `border`, `font`, `corner radius`, `shadow`). Style values that match a theme role compile to `var(...)`. Generated apps include a visible theme toggle and respect the operating system setting.
- Fonts: `system`, `modern`, `sans`, `serif`, `classic`, `mono`, `code`, `rounded`, `friendly`, `display`, and `handwriting` expand to readable stacks; a quoted font name is used directly.
- Motion: `transition is 0.2 seconds`, `animation is fade in over 0.4 seconds`, and `animation is pulse over 1.5 seconds forever`. Names include `fade in`, `fade out`, `slide in/up/down/left/right`, `pop`, `float`, `pulse`, `spin`, `bounce`, `shake`, and `glow`. Reduced-motion preferences disable non-essential animation.
- Media: `image`, `video`, and `audio` accept `with description`, `width`, `height`, and `loops`; video also accepts `with poster "cover.jpg"`. Relative media paths are copied into the build.
- A contrast checker warns when text and background are too close. The warning names both colors and suggests a darker or lighter alternative.

The compiler turns styles into scoped CSS. There is no raw CSS escape hatch in v1: beginners cannot accidentally break the page, and generated output stays safe. An advanced `custom css` block can be added later behind a capability flag.

### 4.3 Behavior

```eng
when "add button" is clicked:
    set task to value of "new task"
    if task is not empty:
        add task to tasks
        clear "new task"
    end
end

when the page opens:
    say "App started"
end

when the user presses key "Enter":
    say "You pressed Enter"
end

every 5 seconds:
    change seconds open to seconds open plus 5
end
```

**Events**

| Event | Syntax |
|---|---|
| Click | `when "id" is clicked:` |
| Change | `when "id" changes:` (input, dropdown, checkbox, slider) |
| Typing | `when the user types in "id":` |
| Hover | `when "id" is hovered:`, `when the mouse enters "id":`, `when the mouse leaves "id":` |
| Key | `when the user presses key "Enter":` |
| Page open | `when the page opens:` (every page), `when page "Home" opens:` (one page) |
| Resize | `when the window is resized:` |
| Submit | `when "form id" is submitted:` |
| Timer | `every 5 seconds:`, `every frame:` (about 60 times per second) |

**Reactive state**

```eng
keep track of count as 0
keep track of tasks as an empty list
```

Changing a tracked name updates every screen expression and `showing` list that depends on it, after the current handler finishes. Mutating a tracked list or table also refreshes the screen. The compiler records dependencies statically, so unrelated parts of the page are not re-rendered.

**Changing the screen**

```eng
show "help panel"          hide "help panel"          clear "new task"
change text of "count label" to "Count: " plus count
change value of "new task" to ""
change background of "status" to green
go to page "Settings"
open popup "help"          close popup "help"
play sound "ding.mp3"
say "Saved!"               note: toast in an app
```

`change ... of` supports only a fixed, safe list: `text`, `value`, `background`, `text color`, `font size`, `width`, `height`, `rounded corners`, `padding`, `margin`, `border`, `opacity`, `alignment`. On a list, `change value of "id" to item` selects and highlights that item; the selection is kept even when the list has not rendered its rows yet, and the next render applies it.

**Device storage, web data, and games**

```eng
save tasks to the device as "tasks"
load "tasks" from the device and save it as saved tasks
delete "tasks" from the device

get data from "https://api.open-meteo.com/v1/forecast?..." and save it as weather
send data report to "https://example.com/api" and save it as reply

clear canvas "board" to #111827
draw rectangle on "board" at x 20 and y paddle with width 12 and height 80 in white
draw circle on "board" at x ball x and y ball y with size 12 in white
draw text "Hits: " plus hits on "board" at x 640 and y 20 in white
draw line on "board" from x 0 and y 0 to x 100 and y 100 in white
draw image "ball.png" on "board" at x ball x and y ball y with size 24
```

Network requests are `await`ed inside generated event handlers, so the statements after `get data` run in order. Failures are catchable with `try` / `if it fails` and never leave a silent blank screen: the runtime shows a friendly error card in development and a short message in production.

### 4.4 How app code is compiled

1. The parser builds an **app model**: pages, blocks, ids, styles, events, timers, tracked state, and handlers.
2. The checker validates ids, event targets, style targets, duplicate pages, heading order, labels, `showing` types, and capabilities. It also records which state each screen expression depends on.
3. The web backend emits:
   - **HTML** with semantic elements (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`, `<label>`, `<button>`), one `<section data-page>` per page, and accessible names.
   - **CSS** with custom properties for the theme, scoped selectors generated from ids and kinds, media queries for responsive rules, and `prefers-color-scheme` / `prefers-reduced-motion` support.
   - **JavaScript** that imports a small EngCode runtime (state, events, routing, storage, fetch, canvas, toasts) plus generated handler functions. Generated code never uses `eval` or `innerHTML` with user text.
4. `engcode serve` serves the build from memory, watches `.eng` files, rebuilds on change, and reloads the browser over Server-Sent Events. Build errors appear in a readable browser overlay that mirrors the terminal diagnostic.
5. `engcode app` runs the same output inside an Electron window. `engcode build web` writes a self-contained `dist/` (HTML, CSS, JS, assets, no CDN).

Generated runtime size target: under 25 KB minified and under 8 KB compressed. The runtime is plain TypeScript compiled to an IIFE/ES module, with no framework.

**Asset handling.** Relative paths in `image`, `video`, `audio`, and `play sound` resolve next to the `.eng` file. Builds copy referenced assets into `dist/assets/`; missing assets are a compile error naming the exact path.

### 4.5 Accessibility and safety in generated output

**Accessibility**

- Inputs always have a label: `with label`, the `called` id, or a generated label from the hint. Missing labels are a build warning; `--strict` turns them into errors.
- Images use `with description` as `alt`. A missing description produces `alt=""` plus a warning, which is correct for decorative images and visible in review.
- Buttons and links are native elements, so keyboard and screen reader behavior comes for free. Custom popups trap focus, restore focus on close, and close on Escape.
- Headings warn when a level is skipped (h1 → h3) or when a page has no heading.
- `row` and `column` are layout `<div>`s, never tables. Data tables use `<table>`, `<th scope>`, and `<caption>`.
- A "skip to content" link is generated for every page.
- The contrast checker runs at build time.
- Animations respect `prefers-reduced-motion`; transitions are short by default.
- Canvas games must include a short instruction line in the page (the example does), and the canvas has an `aria-label` and a text fallback.

**Safety**

- Text is escaped. There is no raw HTML or raw CSS syntax in v1.
- Links allow `http:`, `https:`, `mailto:`, `tel:`, and same-page `#...`; `javascript:` is rejected at check time.
- Network access is limited to declared HTTPS hosts. Redirects to other hosts are rejected. Responses are size-limited.
- Storage keys are namespaced by app name; apps cannot read another app's keys.
- Generated pages use a Content Security Policy that forbids inline scripts and `eval`.
- Electron uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. It blocks navigation to untrusted origins, and external links open in the system browser. There is no preload bridge.
- File access is locked to the project root after path normalization. The check rejects `..` and absolute paths; it does not resolve symlinks, so projects should not link outside their own folder.

---

## 5. Architecture

### 5.1 Pipeline

```text
.eng source
   │
   ├─ lexer ──────────────► tokens (line, column, source span)
   ├─ name pre-scan ──────► declared names, function names, kinds
   ├─ parser ─────────────► AST (statements, expressions, UI, styles, events)
   ├─ checker ────────────► resolved AST + diagnostics + capabilities
   │
   ├─ script backend ─────► closure-compiled interpreter (Node)
   └─ web backend ────────► HTML + CSS + JS + assets (browser/Electron)
```

The checker resolves:
- every variable/function reference to a scope slot,
- every UI id and style target,
- every event handler and state dependency,
- every built-in phrase to a runtime function,
- every capability (file, network, storage).

Both backends consume the resolved AST, so script and app semantics stay aligned. Shared tests run the same AST through both where meaningful.

### 5.2 Repository layout

```text
src/
  lexer.ts              tokens, strings, numbers, comments, spans
  names.ts              pre-scan and longest-name matching
  ast.ts                AST types
  parser.ts             recursive-descent parser
  checker.ts            scopes, UI validation, accessibility, capabilities
  diagnostics.ts        friendly error rendering and suggestions
  values.ts             runtime values, deep equality, pretty printing
  interpreter.ts        closure compiler and statement executor
  program.ts            file loading, imports, shared analysis
  formatter.ts          deterministic source formatter
  lint.ts               advisory linter
  explain.ts            English statement descriptions for --explain
  templates.ts          `engcode new` project scaffolds
  learn.ts              20 tutorial lessons and progress
  playground.ts         local playground server and preview
  web/compiler.ts       app model, HTML/CSS/JS generation, dev server
  desktop/shell.ts      Electron window and generated desktop projects
  cli.ts                command dispatch
runtime/
  web-runtime.ts        browser runtime: state, events, routing, fetch, storage, canvas
examples/               10 runnable projects plus the desktop notebook
docs/                   design, grammar, guides, reference, tutorial, FAQ
tests/                  unit, compiler, example, e2e, performance
editor/vscode/          extension: grammar, snippets, diagnostics, commands
playground/             local playground page and assets
scripts/                install and release helpers
```

### 5.3 Script interpreter

- Expressions compile to closures `(env) => value`; statements compile to functions `(env, ctx) => control`.
- Variables are resolved to integer slots in scope frames (arrays), not string-key maps. This is the main performance lever.
- Globals live in one frame; function calls create a linked frame; closures capture frames by reference.
- Values are a tagged union: `{ type: "number", value }`, etc. Lists are arrays, tables are `Map<string, Value>`.
- Loops are compiled once, not re-parsed. `stop`/`skip` use a lightweight control signal.
- `try` catches a runtime error value and binds `the error`.
- Reactive `keep track` names are ordinary values in scripts (no screen to refresh).

Performance gate: this loop must finish in under 2 seconds on the reference machine. Startup is measured separately; the loop body is what counts. The benchmark runs in CI.

```eng
set total to 0
repeat 1000000 times:
    change total to total plus 1
end
```

If the closure backend misses the gate, the resolved AST can be lowered to a small stack VM behind the same value/runtime API without changing the language.

### 5.4 Web runtime and desktop

- The browser runtime is framework-free. `startApp` builds the screen from a serialized app definition and internally handles state, rendering, events, routing, storage, HTTPS fetch, canvas, and toasts.
- Handlers are compiled to async functions when they contain `get data`, `send data`, or `wait`; otherwise they stay synchronous.
- Desktop packaging uses Electron. `engcode app` opens a secure BrowserWindow pointed at a private loopback server. `engcode build windows` and `engcode build mac` write a runnable Electron project with `main.cjs`, the web build, a launcher, and Electron Packager scripts. Code signing and installers are publishing steps layered on top of the packaged release; macOS releases must be built on macOS.
- A future `--tauri` packaging adapter can reuse the same generated web assets. No language change is needed.

---

## 6. Command line

```text
engcode new my-project        scaffold a script, website, app, or desktop project
engcode run file.eng          run a script in the terminal
engcode serve folder          run an app/website in the browser with live reload
engcode app folder            run the app in a native desktop window
engcode build web folder      produce a static website (HTML + CSS + JS)
engcode build windows folder  produce a Windows desktop project
engcode build mac folder      produce a macOS desktop project
engcode build linux folder    produce a Linux desktop project
engcode check file.eng        find mistakes without running
engcode format file.eng       auto-format code
engcode lint file.eng         report style and capability advice
engcode repl                  interactive prompt
engcode learn                 the 20-lesson tutorial
engcode playground            open the local playground
```

Common options:

```text
--explain            explain each executed statement in English
--step               like --explain, paused between statements
--strict             treat accessibility/lint warnings as errors
--json               machine-readable diagnostics (used by the editor)
--lint               include linter advice in `check`
--allow-network      allow HTTPS requests for this run only
--port 3000          dev server or playground port
--open               open the browser after serve
--out dist           build output folder
--minify             minify web output
--check              formatter: exit 1 if the file would change
--stdout             formatter: print the result instead of writing it
--type script|website|app|desktop   project kind for `new`
--run / --file / --done / --reset   tutorial controls
```

- `engcode run` accepts a `.eng` file or a project folder (uses `engcode.json`'s `entry`). Running a file that only declares an app prints: `This is an app. Try "engcode serve" or "engcode app".` File access is always limited to the project folder; there is no separate file-permission flag.
- `engcode new` prompts for a type when `--type` is omitted. It creates `main.eng`, `engcode.json`, `.gitignore`, and a short README. It never overwrites an existing folder.
- `engcode serve` watches every `.eng` file in the project and rebuilds in memory. Browser reload is driven by SSE; if the port is busy it tries the next one and prints the URL.
- `engcode app` builds, starts the local server, and opens Electron. Closing the window stops the server. Electron must be installed first.
- `engcode build windows`, `build mac`, and `build linux` generate a self-contained Electron project and report its absolute path. `npm run package` inside that project produces a release folder with Electron Packager. macOS builds must run on macOS.
- `engcode repl` keeps state between lines, supports multi-line blocks (the prompt changes to `...` until `end`), and offers `:help`, `:clear`, `:load file.eng`, `:quit`.
- `engcode format` is deterministic and idempotent; `--check` is for CI and `--stdout` is for editors.
- `engcode lint` warns only, and `--strict` makes warnings exit with code 1.
- `engcode learn` stores progress in `.engcode/learn.json`; `engcode learn 4` starts at lesson 4.
- `engcode playground` serves a local editor with a 200,000-statement limit and a sandboxed app preview.
- Exit codes: `0` success, `1` user error (syntax/semantic/runtime), `2` internal error.

**Installation.** `npm install -g engcode` is the one-line install when the package is published. From a checkout or release folder, `scripts/install.ps1 -From .` and `scripts/install.sh --from .` check for Node.js 20 or newer, install globally, and verify the command. `scripts/package-release.mjs` builds an npm tarball, a portable folder with launchers, local installers, and SHA-256 checksums. The current release still requires Node.js: a Node-free standalone binary and signed `.exe`/`.pkg` installers are future packaging work, not shipped features.

---

## 7. Developer experience

**VS Code extension** (`editor/vscode`)
- TextMate grammar for `.eng`: keywords, names, strings, numbers, comments, block headers, style properties, event phrases.
- Snippets for `say`, `ask`, `if`, `repeat`, `for each`, `define`, `try`, `app`, `page`, `style`, `when`, `keep track`.
- Completion for keywords and built-in phrases; hover documentation for keywords, built-ins, and app blocks.
- Diagnostics via `engcode check --json --lint`, refreshed on open, save, and shortly after typing stopped. The message includes the friendly hint and suggestion.
- Document formatting via `engcode format --stdout`, plus commands to run, serve, explain, and check the current file.
- No language server is required for v1; the extension shells out to the CLI. The `--json` protocol is stable so an LSP can be added later.

**Web playground** (`playground/`)
- A local server started by `engcode playground`, with a plain accessible textarea editor, example loader, Run button, output pane, and diagnostics pane.
- Scripts execute on the local server through `/api/run` with a 200,000-statement limit; requests over 256 KB are rejected. There is no browser worker and no server-side sandbox.
- Apps compile through the same web compiler as a build and preview in a sandboxed iframe served from `/preview/<id>/`, so the preview uses the real runtime and security policy.
- The page is a local development tool: do not expose it to the internet or run untrusted code in it.

**Formatter and linter**
- The formatter is deterministic and idempotent: four-space indentation, one statement per line, lower-cased statement-leading keywords, tidy punctuation, collapsed blank lines, no trailing spaces, and a final newline. It preserves strings, comments, and the names the programmer chose.
- `engcode format` writes files; `--check` exits 1 when a file would change; `--stdout` prints the result.
- The linter warns only, and `--strict` turns warnings into exit code 1. Rules: ambiguous names that end in operator words, names that shadow built-ins, declarations that are never used, tabs, long lines, `TODO`/`FIXME` notes, empty blocks, and capability use for files, network, or device storage.

**Debugger**
- `engcode run file.eng --explain` prints, for each statement, the step number, line, source text, and an English description to stderr. Program output stays on stdout.
- `--step` pauses on a terminal: Enter continues, `v` lists names and values, `q` quits. When input is piped it continues automatically.
- Explanations stop after 200 steps, so a loop cannot flood the terminal.

**Tutorial**
- 20 lessons: hello, names, text, numbers, asking, conditions, comparisons, loops, lists, tables, functions, recursion, defaults, errors, files, modules, first page, styling, events, state and storage.
- Each lesson explains one idea, shows a small example, suggests a task, and gives a hint after two failed attempts. `--run` runs the example, `--file` runs the learner's attempt, and `--done` marks progress. Progress is saved in `.engcode/learn.json`.

**Documentation** (`docs/`)
- Getting Started, Language Reference, App Building Guide, Styling Guide, Standard Library, CLI, Tutorial, Security & Permissions, Install, FAQ, and a one-page cheat sheet named `cheatsheet.md`.
- Every guide links to the others, and the README links the full set.

---

## 8. Testing, performance, and quality

**Automated tests**

| Layer | What is tested |
|---|---|
| Lexer | strings/escapes, numbers, comments, `note:`, `'s`, hex colors, line/column spans, CRLF and LF |
| Names | multi-word names, longest-match, `is happy`, `nothing here`, hard-delimiter errors |
| Parser | every statement and expression form, precedence, ambiguity rules, one test per diagnostic |
| Checker | scopes, arity, defaults, duplicate ids/names, break/continue placement, capabilities, a11y warnings |
| Interpreter | values, coercion, deep equality, closures, recursion, objects, `try`, modules, stdlib |
| Compiler | HTML/CSS/JS golden snapshots, escaping, ids, routes, accessibility attributes, contrast warnings |
| Examples | every example runs; every app builds; scripted stdin/output for terminal examples |
| CLI | `new`, `check`, `format`, `lint`, `build web`, `run`, `learn`, `repl` (spawned as a child process) |
| Web runtime | events, state refresh, storage, fetch (mocked), canvas via `happy-dom` |
| Performance | 1M-iteration loop under 2 seconds |
| Security | path traversal, disallowed host, `javascript:` link, CSP presence |

**Coverage target:** the enforced gates are 90% lines, 80% branches, and 90% functions across `src/` and `runtime/`, excluding `src/cli.ts` and `src/playground.ts`. Coverage is measured with Node's built-in coverage and fails CI below the thresholds. The current run reports **302 tests, 95.2% lines, 87.8% branches, and 94.1% functions**. Individual runtime and web-compiler branch percentages fall below 80, but the global gate passes.

**Example tests** are not just "it parses": terminal examples are run with scripted input and assert exact output; apps are built and driven through `happy-dom` smoke tests that click controls, read rendered text, and check storage. The notes-desktop example covers search, pinning, selection, and both themes.

---

## 9. Ten sample programs

These are written against the grammar above and will become the first entries in `/examples`, each with an automated test.

### 9.1 Hello and name greeter

```eng
note: examples/hello/main.eng
say "Hello, world!"
ask "What is your name?" and save it as name
say "Hello, " plus name plus "! Welcome to EngCode."
```

### 9.2 Number guessing game

```eng
note: examples/guess/main.eng
set secret to random number from 1 to 100
set guesses to 0
set found to no

while found is no:
    ask for a number "Guess a number from 1 to 100" and save it as guess
    change guesses to guesses plus 1
    if guess is less than secret:
        say "Higher!"
    otherwise if guess is greater than secret:
        say "Lower!"
    otherwise:
        say "You got it in " plus guesses plus " guesses!"
        set found to yes
    end
end
```

### 9.3 Calculator

```eng
note: examples/calculator/main.eng
define calculate with first, operation and second:
    if operation is "plus":
        give back first plus second
    otherwise if operation is "minus":
        give back first minus second
    otherwise if operation is "times":
        give back first times second
    otherwise if operation is "divided by":
        if second is 0:
            give back "You cannot divide by zero."
        end
        give back first divided by second
    otherwise:
        give back "I do not know that operation."
    end
end

ask for a number "First number" and save it as first
ask "Operation (plus, minus, times, divided by)" and save it as operation
ask for a number "Second number" and save it as second
set answer to calculate first, operation, second
say "Result: " plus answer
```

### 9.4 Quiz game with scores

```eng
note: examples/quiz/main.eng
set score to 0
set questions to a list of a table with question "What is 2 plus 2?", answer "4" and a table with question "What is the capital of France?", answer "Paris" and a table with question "What is 5 times 3?", answer "15"

for each question in questions:
    say question's question
    ask "Your answer" and save it as reply
    if reply is question's answer:
        say "Correct!"
        add 1 to score
    otherwise:
        say "Not quite. The answer is " plus question's answer
    end
end

say "You scored " plus score plus " out of " plus length of questions
```

### 9.5 Rock paper scissors

```eng
note: examples/rock-paper-scissors/main.eng
set moves to a list of "rock", "paper", "scissors"
ask "Choose rock, paper, or scissors" and save it as player
set computer to random item of moves
say "Computer chose " plus computer

if player is computer:
    say "It is a tie."
otherwise if (player is "rock" and computer is "scissors") or (player is "paper" and computer is "rock") or (player is "scissors" and computer is "paper"):
    say "You win!"
otherwise:
    say "Computer wins!"
end
```

### 9.6 To-do list app (desktop window)

```eng
note: examples/todo/main.eng
app "Todo List":
    page "Home":
        heading "My Tasks"
        row:
            input called "new task" with label "New task" and hint "Add a task"
            button "Add" called "add button"
        end
        list called "task list" showing tasks
        divider
        row:
            button "Clear all" called "clear button"
            text "Saved on this device."
        end
    end
end

keep track of tasks as an empty list

style everything:
    font is "Helvetica"
    background is light gray
    text color is dark gray
end

style "add button":
    background is blue
    text color is white
    rounded corners of 8
    padding is 12
    when mouse is over:
        background is dark blue
    end
end

style "task list" on small screens:
    width is full
end

when "add button" is clicked:
    set task to value of "new task"
    if task is not empty:
        add task to tasks
        clear "new task"
        save tasks to the device as "tasks"
    end
end

when "clear button" is clicked:
    set tasks to an empty list
    save tasks to the device as "tasks"
end

when the page opens:
    load "tasks" from the device and save it as saved tasks
    if saved tasks is not nothing:
        set tasks to saved tasks
    end
end
```

### 9.7 Personal portfolio website

```eng
note: examples/portfolio/main.eng
app "Sam's Portfolio":
    page "Home":
        navigation bar:
            link "Home" to "#top"
            link "Projects" to "#projects"
            link "Contact" to "#contact"
        end
        section:
            heading "Sam Carter"
            paragraph "I build small, friendly websites and games."
            image "sam.png" with description "A photo of Sam Carter"
            button "Say hello" called "hello button"
        end
        section called "projects":
            heading "Projects" level 2
            grid:
                card:
                    heading "Weather Now" level 3
                    paragraph "A tiny weather app built with EngCode."
                end
                card:
                    heading "Task List" level 3
                    paragraph "A calm to-do list for busy days."
                end
            end
        end
        section called "contact":
            heading "Contact" level 2
            paragraph "hello@example.com"
        end
        footer:
            text "Made with EngCode."
        end
    end
end

style everything:
    font is "Georgia"
    background is white
    text color is #1f2937
end

style "hello button":
    background is #0f766e
    text color is white
    rounded corners of 20
    padding is 14
    when mouse is over:
        background is #115e59
    end
end

when "hello button" is clicked:
    say "Thanks for stopping by!"
end
```

### 9.8 Weather app using a web API

```eng
note: examples/weather/main.eng
app "Weather Now":
    page "Home":
        heading "Weather Now"
        row:
            input called "latitude" with label "Latitude" and hint "For example 52.52"
            input called "longitude" with label "Longitude" and hint "For example 13.41"
            button "Check" called "check button"
        end
        card:
            heading "Current weather" level 2
            text "Press Check to begin." called "result"
        end
    end
end

style everything:
    font is "Helvetica"
    background is #eef2ff
end

when "check button" is clicked:
    set latitude to value of "latitude"
    set longitude to value of "longitude"
    set address to "https://api.open-meteo.com/v1/forecast?latitude=" plus latitude plus "&longitude=" plus longitude plus "&current=temperature_2m,wind_speed_10m"
    try:
        get data from address and save it as weather
        change text of "result" to "It is " plus weather's current's temperature_2m plus " degrees Celsius, with wind at " plus weather's current's wind_speed_10m plus " km/h."
    if it fails:
        change text of "result" to "Sorry, I could not read the weather. " plus the error
    end
end
```

`engcode.json` for this project:

```json
{
  "name": "weather",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

### 9.9 Notes app that saves on the device

```eng
note: examples/notes/main.eng
app "Notes":
    page "Home":
        heading "My Notes"
        text area called "note" with label "Note" and hint "Write something..."
        row:
            button "Save note" called "save button"
            button "Clear all" called "clear button"
        end
        list called "notes" showing saved notes
    end
end

keep track of saved notes as an empty list

style everything:
    font is "Helvetica"
    background is #f8fafc
end

when the page opens:
    load "notes" from the device and save it as loaded
    if loaded is not nothing:
        set saved notes to loaded
    end
end

when "save button" is clicked:
    set note to value of "note"
    if note is not empty:
        add note to saved notes
        save saved notes to the device as "notes"
        clear "note"
    end
end

when "clear button" is clicked:
    set saved notes to an empty list
    save saved notes to the device as "notes"
end
```

### 9.10 Simple 2D game (Pong) with keyboard controls

```eng
note: examples/pong/main.eng
app "Pong":
    page "Play":
        heading "Pong"
        canvas called "board" with width 800 and height 500
        text "Use W and S to move. Keep the ball in play." called "status"
    end
end

keep track of paddle as 200
keep track of ball x as 400
keep track of ball y as 250
keep track of ball speed x as 4
keep track of ball speed y as 3
keep track of hits as 0

style everything:
    font is "Helvetica"
    background is #111827
    text color is white
end

every frame:
    if key "w" is pressed:
        change paddle to paddle minus 6
    end
    if key "s" is pressed:
        change paddle to paddle plus 6
    end
    set paddle to maximum of 0 and minimum of 420 and paddle

    change ball x to ball x plus ball speed x
    change ball y to ball y plus ball speed y

    if ball y is less than 0 or ball y is greater than 488:
        change ball speed y to 0 minus ball speed y
    end

    if ball x is less than 40 and ball y is at least paddle and ball y is at most paddle plus 80:
        set ball x to 40
        change ball speed x to 0 minus ball speed x
        add 1 to hits
    end

    if ball x is greater than 800:
        set ball x to 400
        set ball y to 250
    end

    clear canvas "board" to #111827
    draw rectangle on "board" at x 20 and y paddle with width 12 and height 80 in white
    draw circle on "board" at x ball x and y ball y with size 12 in white
    draw text "Hits: " plus hits on "board" at x 640 and y 20 in white
end
```

---

## 10. Milestones

Each milestone ends with a green test run, coverage summary, and a demo. I will not mark a milestone done while an example in its scope fails.

**M1 — Core language** — **done**
Lexer, name pre-scan, parser, checker, closure interpreter: variables, `say`, `ask`, conditions, `repeat`/`for each`/`count`/`while`, `stop`/`skip`, friendly diagnostics. Tests for every form; the hello example and a fixed-secret guessing script run end to end.

**M2 — Real programs** — **done**
Lists, tables, functions (defaults, closures, anonymous), objects, `try`, modules, the full standard library, REPL. The 1M-loop benchmark passes. All five terminal examples run (hello, guessing, calculator, quiz, rock-paper-scissors). Coverage ≥ 90% on the core.

**M3 — Web and apps** — **done**
App model, all blocks, styles, events, reactive state, routing, storage, fetch, canvas, accessibility checks, static build, `engcode serve` with live reload. Todo, portfolio, weather, notes, notes-desktop, and Pong build and pass DOM smoke tests. The notes-desktop example adds interactive list selection, Fluent fonts, light/dark themes, layered surfaces, and Windows 11-style motion.

**M4 — Desktop and packaging** — **desktop shell done; signed installers and standalone binary pending**
Electron shell, `engcode app`, `build web`, `build windows`, `build mac`, `build linux`, asset copying, and desktop project generation are implemented. Generated projects use a private loopback server, context isolation, no Node.js integration, and a sandbox. Each project includes Electron Packager scripts, and `scripts/package-release.mjs` produces an npm tarball, a portable release folder with launchers, and SHA-256 checksums. Code signing, notarization, signed `.exe`/`.pkg` installers, and a Node-free standalone binary need platform credentials and an additional packaging toolchain, so they remain pending rather than claimed as complete.

**M5 — Developer experience** — **done**
VS Code extension, local playground, formatter, linter, `--explain`/`--step`, 20-lesson tutorial, install scripts, complete docs and cheat sheet all ship. 302 tests pass; the enforced coverage gates (90% lines, 80% branches, 90% functions) and the 1M-loop performance gate pass.

**M6 — Hardening**
Fuzz the parser with malformed English input, audit capability escapes, test Windows and macOS path handling, measure generated web output, and fix the top usability issues found by running the tutorial from a clean start.

---

## 11. Risks and deliberate choices

**Where the spec left a choice, I chose the simplest beginner option:**

| Choice | Reason (one sentence) |
|---|---|
| `and` separates call arguments; parentheses group a logical expression | It makes `add 2 and 3` read exactly like the spec while keeping one escape hatch. |
| Lists are 1-based | Beginners count from one. |
| Table keys are single words or quoted | It removes the "where does the key end?" ambiguity without hiding it from learners. |
| No truthiness | `if count:` is a common bug; requiring a comparison keeps conditions honest. |
| `otherwise` instead of `else` | It matches the English style and avoids a second keyword for the same idea. |
| `set` creates, `change` updates | The distinction catches typos while keeping both sentences natural. |
| All built-ins available without imports | A beginner should not learn module plumbing to call `random`. |
| Single-page web output with hash routes | It keeps state and navigation working in websites, desktop apps, and the playground with one build. |
| Electron instead of Tauri | It works with the available Node-only toolchain; the generated web assets keep a Tauri adapter possible. |
| `canvas` block added to the required block list | The spec asks for a 2D keyboard game, and a game needs a drawing surface. |
| Methods return values via `rex's bark` | It avoids a second call syntax while still allowing `give back` inside methods. |

**Known risks**

- **English ambiguity.** Multi-word names plus operator words can still surprise. Mitigation: the longest-name rule, a linter warning for names ending in operators, and a dedicated test for every ambiguity in the grammar.
- **Performance.** A closure interpreter should pass 1M iterations, but if the machine is slow the gate may fail. Mitigation: slot-resolved frames and a bytecode fallback behind the same runtime.
- **macOS packaging** cannot be produced from Windows. Mitigation: a documented macOS CI job and a script that is tested on macOS before claiming support.
- **Network examples** depend on a public API and CORS. Mitigation: Open-Meteo supports browser CORS and needs no key; tests mock the response.
- **Scope.** The app layer is large. Mitigation: blocks are table-driven; the compiler has one element mapping per block kind, not bespoke code per example.
- **Release packaging.** Installation goes through the npm registry (`npm install -g engcode`); there are no install URLs to host. Signed installers plus a Node-free binary need platform credentials and tooling. Mitigation: `npm pack`, the release packager, and both local installers work now; signing, and a standalone binary are wired at release time.

---

## 12. Approval

This document records the implemented design through Milestone 5. The language surface, app model, CLI, layout, tests, and milestones now describe the shipped code rather than a plan.











