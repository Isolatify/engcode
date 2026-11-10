# EngCode cheat sheet

**Build with Simple English.** One statement per line. Blocks start with `:` and finish with `end`. Keywords are case-insensitive; names are case-sensitive. Comments start with `note:`.

```eng
note: A complete little program.
set name to "Sam"
say "Hello, " plus name
```

## Values

| Kind | Examples |
|---|---|
| Text | `"hello"`, `"two words"`, `"a \"quote\""` |
| Number | `0`, `42`, `-3`, `2.5` |
| Yes / no | `yes`, `no` |
| Nothing | `nothing` |
| List | `a list of 1, 2, 3`, `an empty list` |
| Table | `a table with name "Sam", age 25`, `an empty table` |
| Colour | `#0f766e`, `#fff` (in styles) |

## Names

```eng
set favourite colour to "blue"     note: multi-word names are allowed
say favourite colour
change favourite colour to "green"
```

`set` creates or replaces. `change` updates an existing name and reports a friendly error when the name does not exist yet. Inside a block, `set` updates an outer name when one already exists.

## Text and numbers

```eng
say "a" plus "b"                  note: ab
say 7 minus 2                     note: 5
say 3 times 4                     note: 12
say 10 divided by 4               note: 2.5
say 10 remainder 3                note: 1
say length of "hello"             note: 5
say uppercase of "hello"          note: HELLO
say round of 2.6                  note: 3
say square root of 81             note: 9
```

## Asking

```eng
ask "What is your name?" and save it as name
ask for a number "How old are you?" and save it as age
```

## Conditions

```eng
if age is at least 18:
    say "Adult"
otherwise if age is at least 13:
    say "Teenager"
otherwise:
    say "Child"
end
```

| Comparison | Meaning |
|---|---|
| `a is b` / `a is not b` | equal / not equal |
| `a is greater than b` | `>` |
| `a is less than b` | `<` |
| `a is at least b` | `>=` |
| `a is at most b` | `<=` |
| `a is between b and c` | inclusive range |
| `a contains b` | list or text |
| `a starts with b` / `a ends with b` | text |
| `a is empty` / `a is not empty` | list, table, text |
| `not condition` | opposite |

Join conditions with `and` / `or`. Parentheses group a logical expression: `if (a and b) or c:`. Always compare; there is no truthiness.

## Loops

```eng
repeat 3 times:
    say "Hello"
end

for each fruit in fruits:
    say fruit
end

count from 1 to 5 as number:
    say number
end

while total is less than 10:
    change total to total plus 1
end
```

`stop` leaves the nearest loop. `skip` jumps to the next turn.

## Lists

```eng
set fruits to a list of "apple", "banana", "cherry"
say item 1 of fruits              note: positions start at 1
say last item of fruits
add "date" to fruits
remove "banana" from fruits
sort fruits
sort fruits descending
reverse fruits
shuffle fruits
say join fruits with ", "
set parts to split "a,b,c" by ","
```

## Tables

```eng
set person to a table with name "Sam", age 25
say person's name
change person's age to 26
set person's city to "Paris"
remove "city" from person
say JSON of person
set copy to data from JSON text
```

## Functions

```eng
define greet with who:
    give back "Hello, " plus who
end

define add with first, second default 0:
    give back first plus second
end

say greet "Sam"
say add 2, 3
say call greet with "Ada"
```

Anonymous functions:

```eng
set double to a function with x that gives back x times 2
say call double with 21
```

## Objects

```eng
define a kind of thing called Dog:
    it has name and age

    it can bark:
        say name plus " says woof"
    end

    it can years with amount:
        give back age plus amount
    end
end

set rex to a new Dog with name "Rex", age 3
rex bark
say rex's age
say call rex's years with 10
```

## Errors

```eng
try:
    say 10 divided by 0
if it fails:
    say "Caught: " plus the error
end
```

Only runtime errors are caught.

## Files, network, storage

```eng
write "hello" to file "notes.txt"
append "another line" to file "notes.txt"
read file "notes.txt" and save it as notes
list files in "." and save it as names
delete file "notes.txt"

save "blue" to the device as "colour"
load "colour" from the device and save it as colour
delete "colour" from the device
```

Network access is off unless you add `--allow-network`, and addresses must start with `https://`:

```eng
get data from "https://example.com/data.json" and save it as reply
send data "hello" to "https://example.com/api" and save it as reply
```

## Modules

`helpers.eng`:

```eng
define greet with who:
    give back "Hello, " plus who
end
```

`main.eng`:

```eng
use "helpers.eng"
use math
say greet "Sam"
```

## Apps

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

Useful UI blocks:

| Block | Example |
|---|---|
| Heading / paragraph | `heading "Title"`, `paragraph "Text"` |
| Text with id | `text "0" called "count"` |
| Button | `button "Save" called "save"` |
| Input | `input called "name" with label "Your name"` |
| Text area | `text area called "body" with label "Body"` |
| Checkbox | `checkbox "Done" called "done"` |
| Dropdown | `dropdown called "size" with choices "S", "M", "L"` |
| Image | `image "sam.png" with description "A photo of Sam"` |
| Video | `video "tour.mp4" with description "A tour" and poster "cover.jpg" and loops` |
| Link | `link "Docs" to "https://example.com"` |
| List | `list called "tasks"` |
| Canvas | `canvas called "board" with width 640 and height 360` |
| Popup | `popup called "confirm":` … `end` |
| Container | `rows:`, `columns:`, `grids:`, `cards:`, `sections:`, `navigation bar:` |

Other pages and navigation:

```eng
page "About":
    heading "About"
end

when "about link" is clicked:
    go to page "About"
end
```

Show, hide, clear, and change:

```eng
show "details"
hide "details"
clear "tasks"
change text of "message" to "Saved"
change value of "notes" to selected entry
open popup "confirm"
close popup "confirm"
popup "Saved"                   note: a short toast
```

Timers:

```eng
every 2 seconds:
    change text of "clock" to now
end

every frame:
    draw rectangle on "board" at x 10 and y 10 with width 20 and height 20 in #fff
end
```

## Styles and themes

```eng
theme "Day":
    accent is #2563eb
    background is #f8fafc
    text is #1f2937
    font is modern
    corner radius is 12
end

theme "Night" in dark mode:
    background is #0f172a
    text is #e2e8f0
end

style everything:
    background is background
    text color is text
    font is font
    padding is 24
end

style cards:
    background is white
    rounded corners is 16
    animation is slide up over 0.5 seconds
    when mouse is over:
        animation is float over 2 seconds forever
    end
end
```

Style targets: `everything`, a colour/theme role, a page element id, or a block kind such as `buttons`, `cards`, `inputs`. Units can be written as `24`, `24 px`, `50 percent`, `100vh`.

## CLI

```text
engcode new my-project --type script|website|app|desktop
engcode run main.eng
engcode run main.eng --explain
engcode run main.eng --step
engcode check main.eng
engcode check --json --lint main.eng
engcode lint main.eng
engcode format main.eng
engcode format --check main.eng
engcode serve .
engcode app .
engcode build web . --out dist
engcode build windows . --out dist/windows
engcode build mac . --out dist/mac
engcode repl
engcode learn
engcode learn 3 --run
engcode playground
engcode help
```

Options: `--allow-network`, `--strict`, `--json`, `--port`, `--open`, `--out`, `--minify`.
