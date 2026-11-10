# Getting Started with EngCode

This guide teaches EngCode from your first line to real programs with objects, modules, files, and the interactive prompt. You only need a terminal and Node.js 20 or newer.

EngCode is designed for beginners. You write English, one idea per line, and the computer runs it. There are no semicolons, braces, or type declarations.

---

## 1. Install and run

Open a terminal in the EngCode folder and build it once:

```text
npm install
npm run build
```

Then run a program:

```text
node dist/src/cli.js run examples/hello/main.eng
```

If you want the shorter `engcode` command everywhere, install the package:

```text
npm install -g .
engcode run examples/hello/main.eng
```

On Windows PowerShell, use `npm.cmd` if script running is disabled:

```text
npm.cmd run build
node dist/src/cli.js run examples/hello/main.eng
```

The rest of this guide writes `engcode`. If you have not installed it globally, replace `engcode` with `node dist/src/cli.js`.

---

## 2. Your first program

Create a file called `hello.eng`:

```eng
note: My first EngCode program
say "Hello, world!"
```

Run it:

```text
engcode run hello.eng
```

Output:

```text
Hello, world!
```

`note:` starts a comment. Everything after it on that line is ignored.

`say` prints a line. Text goes inside double quotes. You can use `\"`, `\\`, `\n`, and `\t` inside text.

Keywords are not case-sensitive, so `Say` and `say` both work. Names you create are case-sensitive, so `name` and `Name` are different.

---

## 3. Remember values

Use `set` to create or replace a name. Use `change` when the name must already exist.

```eng
set name to "Sam"
set age to 12
say name plus " is " plus age
change age to age plus 1
say "Next year: " plus age
```

Output:

```text
Sam is 12
Next year: 13
```

Names can contain spaces:

```eng
set favourite colour to "blue"
say favourite colour
```

Rules:

- `set` creates the name if it is new, and replaces it if it exists.
- `change` reports a friendly error when the name does not exist yet.
- Inside a block, `set` updates an outer name when one already exists.
- EngCode does not guess whether a value is true. Conditions must be `yes` or `no`.

---

## 4. Ask for input

```eng
ask "What is your name?" and save it as name
say "Hello, " plus name plus "!"
```

`ask` always saves text. For a number, use `ask for a number`:

```eng
ask for a number "How old are you?" and save it as age
say "Next year you will be " plus (age plus 1)
```

If the answer is not a number, EngCode explains the problem and where it happened.

When you pipe input into a program, put one answer on each line:

```text
"Sam" | engcode run hello.eng
```

---

## 5. Make choices

```eng
ask for a number "How old are you?" and save it as age

if age is less than 13:
    say "You are a young coder."
otherwise if age is less than 20:
    say "You are a teenager."
otherwise:
    say "You are an adult."
end
```

Comparisons:

```eng
if score is 10:
if score is not 10:
if score is greater than 10:
if score is less than 10:
if score is at least 10:
if score is at most 10:
if score is between 10 and 20:
if name contains "Sam":
if name starts with "S":
if name ends with "m":
if name is empty:
if answers is not empty:
```

Join conditions with `and`, `or`, and `not`. Use parentheses when you mix them:

```eng
if (age is at least 13 and age is at most 19) or has permission is yes:
    say "You may join."
end
```

Remember: inside a function call, `and` separates arguments. Use parentheses to pass one combined condition.

---

## 6. Repeat things

Four loop forms:

```eng
repeat 3 times:
    say "Hello"
end
```

```eng
count from 1 to 5 as number:
    say number
end
```

```eng
set countdown to 3
while countdown is greater than 0:
    say countdown
    change countdown to countdown minus 1
end
```

```eng
set fruits to a list of "apple", "banana", "cherry"
for each fruit in fruits:
    say fruit
end
```

Inside a loop:

- `stop` leaves the loop.
- `skip` jumps to the next turn.

---

## 7. Lists

Lists keep values in order. Positions start at 1.

```eng
set fruits to a list of "apple", "banana", "cherry"
say length of fruits
say item 1 of fruits
say last item of fruits
add "date" to fruits
remove "banana" from fruits
say fruits
```

An empty list:

```eng
set tasks to an empty list
```

Useful list operations:

```eng
say random item of fruits
sort fruits
sort fruits descending
reverse fruits
shuffle fruits
if fruits contains "apple":
    say "We have apples."
end
```

`split` turns text into a list, and `join` turns a list back into text:

```eng
set parts to split "one,two,three" by ","
say join parts with " | "
```

---

## 8. Tables

A table stores named values.

```eng
set person to a table with name "Sam", age 25
say person's name
say person's age
set person's age to 26
```

Tables are useful for records and JSON:

```eng
set people to a list of a table with name "Sam", age 25 and a table with name "Ada", age 36
for each person in people:
    say person's name
end
```

Turn data into JSON and back:

```eng
set text to JSON of person
set copy to data from JSON text
say copy's name
```

---

## 9. Functions

Define a reusable block with `define`. `give back` returns a value.

```eng
define greet with who:
    give back "Hello, " plus who
end

say greet "Sam"
```

Several arguments are separated by commas or `and`:

```eng
define add with first, second:
    give back first plus second
end

say add 3, 4
```

Default values:

```eng
define greet with who default "friend":
    say "Hello, " plus who
end

greet
greet "Sam"
```

A function can call itself:

```eng
define factorial with n:
    if n is at most 1:
        give back 1
    end
    give back n times (call factorial with n minus 1)
end

say factorial 5
```

Anonymous functions use `that gives back` or `that does:`:

```eng
set double to a function with x that gives back x times 2
say call double with 21
```

---

## 10. Objects

A kind describes fields and methods. `it has` declares fields. `it can` declares methods.

```eng
define a kind of thing called Dog:
    it has name and age

    it can bark:
        say name plus " says woof"
    end

    it can celebrate:
        change age to age plus 1
    end

    it can years with amount:
        give back age plus amount
    end
end

set rex to a new Dog with name "Rex", age 3
rex bark
rex celebrate
say rex's age
say call rex's years with 10
```

Output:

```text
Rex says woof
4
14
```

Notes:

- `a new Dog with ...` needs every declared field, and rejects unknown fields.
- Inside a method, fields are available by name. `it` refers to the current object.
- `rex bark` calls a method for its side effects.
- `call rex's years with 10` calls a method for its return value.
- `rex's age` reads a field.

---

## 11. Modules

Put shared definitions in another file and import them:

`helpers.eng`

```eng
define greet with who:
    give back "Hello, " plus who
end
```

`main.eng`

```eng
use "helpers.eng"
use math

say greet "Sam"
```

Rules:

- Paths are relative to the importing file.
- Imported top-level statements run once, the first time the file is imported.
- Names cannot collide across imported files. EngCode names both files in the error.
- Import loops are reported with the full chain.
- Imports must stay inside the project folder.
- `use math`, `use time`, `use random`, `use json`, `use files`, `use web`, and `use storage` are accepted for readability. The standard library is always available, so these lines are never required.

Run a program the same way:

```text
engcode run main.eng
```

---

## 12. Files

Programs may read and write files inside their project folder.

```eng
write "first line" to file "notes.txt"
append "second line" to file "notes.txt"

read file "notes.txt" and save it as notes
say notes

if file "notes.txt" exists:
    say "The file is here."
end

list files in "." and save it as names
say names

delete file "notes.txt"
```

Notes:

- `write` replaces the file. `append` adds to the end.
- Each `write` or `append` adds a newline after the value.
- `read file` keeps the whole file as text.
- Paths that try to leave the project folder are refused.
- If a file cannot be read, the error explains which file and why.

---

## 13. Remember data on the device

Device storage keeps values between runs. The data lives in `.engcode/storage.json` inside the project.

```eng
save "blue" to the device as "favourite colour"
load "favourite colour" from the device and save it as colour
say colour
delete "favourite colour" from the device
```

Loading a key that does not exist gives `nothing`.

---

## 14. Web requests

Network access is off by default. Ask for it only when you trust the address:

```text
engcode run weather.eng --allow-network
```

```eng
get data from "https://example.com/data.json" and save it as reply
say reply
```

Send data with `send data`:

```eng
send data "hello" to "https://example.com/api" and save it as reply
say reply
```

Rules:

- Addresses must start with `https://`.
- Without `--allow-network`, the program stops with a clear message.
- Requests use `curl`; if `curl` is missing, the error says so.

---

## 15. Waiting

```eng
wait 2 seconds
```

`wait` accepts zero or a positive number.

---

## 16. Friendly errors

EngCode shows the file, line, source, a caret, and a suggestion.

```eng
set total to "ten" minus 2
```

```text
Oops — line 1 of hello.eng

  1 | set total to "ten" minus 2
      ^^^^^^^^^^^^^^^^^^^^^^^^
I can't subtract from text.

Try this:
  set total to 10 minus 2
```

Check a file without running it:

```text
engcode check hello.eng
```

Ask for machine-readable diagnostics:

```text
engcode check --json hello.eng
```

---

## 17. The REPL

Start the interactive prompt:

```text
engcode repl
```

Type one or more lines. If a block is open, the prompt changes to `...` until you type its `end`.

```text
> set my name to "Sam"
> say "Hello, " plus my name
Hello, Sam
> define double with n:
...     give back n times 2
... end
> say double 21
42
```

REPL commands:

```text
:help      show the commands
:clear     forget every name
:load file run a file in this session
:quit      leave the REPL
```

The REPL keeps names between lines, so you can build a program step by step. `:clear` starts fresh.

---

## 18. Complete example: calculator

```eng
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

Try it:

```text
engcode run examples/calculator/main.eng
```

More examples in [`examples`](../examples):

- `hello` — printing and input
- `guess` — random numbers and `while`
- `calculator` — functions and branches
- `quiz` — lists, tables, and scores
- `rock-paper-scissors` — random choice and combined conditions

---

## 19. Build a web app

A terminal script prints into the terminal. An app draws a page in the browser. Put an `app` block at the top of the file, and put one or more `page` blocks inside it:

```eng
app "Counter":
    page "Home":
        heading "Counter"
        text "0" called "count"
        button "Add one" called "add"
    end
end

keep track of total as 0

when "add" is clicked:
    change total to total plus 1
    change text of "count" to total
end
```

`called "count"` gives a block an id so your code can find it later. `change text of "count" to total` updates the page without reloading it.

`keep track of` creates reactive state. It is the app version of a variable that should survive clicks and redraws.

### Styles

Style blocks use the same colours and numbers as the rest of EngCode:

```eng
style everything:
    font is "Helvetica"
    background is #f8fafc
    text color is #1f2937
end

style "add":
    background is blue
    text color is white
    rounded corners of 10
    padding is 12
    when mouse is over:
        background is dark blue
    end
end
```

You can target `everything`, a block kind such as `button`, or an id in quotes. Add `on small screens` or `in dark mode` for responsive and theme-aware rules.

### Themes, fonts, and colours

A theme names your colours and fonts once. Styles then refer to the names, so light and dark mode stay in sync:

```eng
theme "Day":
    accent is #2563eb
    background is #f8fafc
    surface is white
    text is #1f2937
    border is #e2e8f0
    font is modern
    corner radius is 12
    shadow is soft
end

theme "Night" in dark mode:
    accent is #2dd4bf
    background is #0f172a
    surface is #1e293b
    text is #e2e8f0
    border is #334155
end

style everything:
    background is background
    text color is text
    font is font
end

style cards:
    background is surface
    border is border
    rounded corners of 12
    shadow is soft
end
```

Theme roles include `accent`, `background`, `surface`, `text`, `muted`, `border`, `success`, `warning`, `danger`, `font`, `heading font`, `corner radius`, and `shadow`. Light values become page defaults; `in dark mode` values follow the visitor's system preference and the built-in theme button.

Friendly font names expand to readable stacks: `system`, `modern`, `sans`, `serif`, `classic`, `mono`, `rounded`, `display`, and `handwriting`. You can also name a font directly, such as `font is "Georgia"`.

### Motion

Add a smooth transition or one of the built-in animations. They use plain English and respect reduced-motion settings:

```eng
style "save":
    background is accent
    transition is 0.3 seconds
    when mouse is over:
        shadow is medium
    end
end

style cards:
    animation is slide up over 0.5 seconds
    when mouse is over:
        animation is float over 2 seconds forever
    end
end
```

Animation names are `fade in`, `fade out`, `slide in`, `slide up`, `slide down`, `slide left`, `slide right`, `pop`, `float`, `pulse`, `spin`, `bounce`, `shake`, and `glow`. Add `forever` to repeat one. `animation delay is 0.2 seconds` staggers a group.

### Images, video, and audio

```eng
image "sam.png" with description "A photo of Sam" and width 220 and height 220

video "tour.mp4" with description "A tour of the studio" and poster "cover.jpg" and loops and width 640

audio "hello.mp3" with description "A spoken greeting" and loops
```

`with description` becomes the image `alt` text, the video/audio accessible name, and the fallback text. `width` and `height` keep the layout stable while media loads. Video gets `controls` and a poster; both media blocks can `loops`. Images lazy-load automatically. Keep files inside the app folder, or use an HTTPS URL.

### Events and timers

```eng
when "save" is clicked:
    say "Saved!"
end

when the page opens:
    say "Welcome"
end

every 5 seconds:
    say "Still here"
end
```

Use `every frame:` for smooth games. `show`, `hide`, `clear`, `go to page`, `open popup`, `play sound`, and canvas `draw` statements all work inside event handlers.

### More than one page

```eng
app "Two pages":
    page "Home":
        heading "Home"
        button "Next" called "next"
    end
    page "About":
        heading "About"
        text "Made with EngCode."
    end
end

when "next" is clicked:
    go to page "About"
end
```

Page names become `#/home` and `#/about` routes. The first page is shown by default.

### Run and build it

Start a development server that watches your files:

```text
node dist/src/cli.js serve examples/todo
```

Open the address it prints. Edit `main.eng` and save; the browser reloads. If there is a mistake, an overlay shows the friendly error while the terminal keeps the details.

Make a static website when you are ready to share it:

```text
node dist/src/cli.js build web examples/todo --out site
```

The `site` folder contains `index.html`, `styles.css`, `app.js`, `runtime.js`, and any images or sounds you used. It works on any static host.

Web requests need HTTPS and, optionally, an allow list in `engcode.json`:

```json
{
  "name": "weather",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

### Accessibility

The compiler adds a skip link, page headings, form labels, image descriptions, focus styles, and a dark-mode button. It also checks your app:

```text
node dist/src/cli.js check examples/todo/main.eng
```

Notes such as a missing image description are warnings, so they do not stop your build. Fix them when you can: they make the app easier for everyone to use.

Try the app examples:

- [`todo`](../examples/todo/main.eng) — lists, storage, and hovers
- [`portfolio`](../examples/portfolio/main.eng) — navigation and cards
- [`weather`](../examples/weather/main.eng) — HTTPS data and `try`
- [`notes`](../examples/notes/main.eng) — text areas and saved notes
- [`pong`](../examples/pong/main.eng) — canvas and keyboard input

---

## 20. Build a desktop app

The same app can open in a desktop window. Install Electron once in your project:

```text
npm install --save-dev electron
```

Then open the app:

```text
node dist/src/cli.js app examples/todo
```

EngCode writes a desktop project to `.engcode/desktop`, starts a private local server, and opens the app in an Electron window. The window has no Node.js access, uses context isolation, and runs in a sandbox.

If you do not want to install Electron yet, you can still generate the project:

```text
node dist/src/cli.js build windows examples/todo --out dist/windows
node dist/src/cli.js build mac examples/notes --out dist/mac
```

Each folder contains the website in `app/`, `main.cjs`, `package.json`, a README, and a launcher (`run.cmd` on Windows, `run.sh` elsewhere). Run it with:

```text
cd dist/windows
npm install
npm start
```

`npm run package` makes a release folder with Electron Packager. Make macOS releases on a Mac. Code signing and notarization are separate steps for publishing.

---

## 21. Practice

1. Ask for two numbers and print their average.
2. Print every even number from 2 to 20.
3. Make a list of three favourite foods, add one, and print them each on a line.
4. Write a function `shout` that returns uppercase text with `!` at the end.
5. Make a kind called `Book` with a title and pages, then print each book's title.
6. Save a high score to the device, then load it on the next run.
7. Move a helper function into `helpers.eng` and import it.
8. Turn the counter app above into a score keeper with a reset button.
9. Add a second page to your app and a link that moves between the pages.

---

## 22. Troubleshooting

**`engcode` is not recognised.** Use `node dist/src/cli.js ...`, or install with `npm install -g .`.

**PowerShell blocks `npm`.** Use `npm.cmd run build`.

**It says the file is an app.** Terminal scripts start with commands. Apps start with `app "..."` and need `engcode serve` or `engcode build web`.

**A name is unknown.** Check spelling and capitalization. Use `set` before you read a name.

**A condition is rejected.** EngCode needs `yes` or `no`, so write a comparison such as `if age is greater than 17:`.

**A file is refused.** Files must stay inside the folder that holds the program.

**A web request is refused.** Run with `--allow-network` and use an `https://` address.

**The desktop window does not open.** Install Electron with `npm install --save-dev electron`, then run `engcode app` again. Generated projects also need `npm install` before `npm start`.

**A block is not finished.** Every block that starts with `:` ends with `end`.

Happy building — with simple English.
