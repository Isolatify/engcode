# Standard library

Everything in the standard library is available in every program. You do not have to import it. `use math`, `use time`, `use random`, `use json`, `use files`, `use web`, and `use storage` are accepted as readable notes, but they change nothing.

Most functions are English phrases: `uppercase of name`, `item 2 of tasks`. A few are statements because they change something: `sort tasks`, `save tasks to the device`.

## Math

| Phrase | Result |
|---|---|
| `round of 2.6` | `3` |
| `floor of 2.9` | `2` |
| `ceiling of 2.1` | `3` |
| `absolute value of -4` | `4` |
| `square root of 81` | `9` |
| `minimum of 3 and 8` | `3` |
| `maximum of 3 and 8` | `8` |
| `power of 2 and 10` | `1024` |
| `sine of 0`, `cosine of 0`, `tangent of 0` | trigonometry in radians |
| `pi`, `e` | constants |
| `random decimal` | a number from 0 up to (not including) 1 |
| `random number from 1 to 6` | a whole number in the inclusive range |

```eng
set price to 12.5
say round of price
say maximum of 10 and 20
say random number from 1 to 100
```

`random number` requires whole-number limits. `square root` of a negative number is a catchable runtime error.

## Text

| Phrase | Result |
|---|---|
| `uppercase of text` | `HELLO` |
| `lowercase of text` | `hello` |
| `trim of text` | text without leading or trailing spaces |
| `length of text` | number of characters |
| `split text by separator` | a list of pieces |
| `join list with separator` | one piece of text |
| `replace find with replacement in text` | text with every match replaced |
| `position of find in text` | 1-based position, or `0` when absent |
| `item n of text` | one character |
| `last item of text` | the final character |
| `text of value` | the display form of any value |

```eng
set words to split "one,two,three" by ","
say join words with " | "
say uppercase of trim of "  hello  "
say position of "lo" in "hello"
```

`length of` counts characters, not bytes, so emoji and accented letters count once.

## Lists

Lists are 1-based. `item 0` and negative positions return `nothing`; they do not wrap around.

| Phrase or statement | Meaning |
|---|---|
| `a list of 1, 2, 3` | create a list |
| `an empty list` | create an empty list |
| `item n of list` | read one item |
| `last item of list` | read the final item |
| `length of list` | count the items |
| `add value to list` | append one item |
| `remove value from list` | remove the first matching item |
| `sort list` | sort ascending |
| `sort list descending` | sort descending |
| `reverse list` | reverse in place |
| `shuffle list` | random order in place |
| `random item of list` | pick one item |
| `for each item in list:` | visit each item |
| `list contains value` | comparison |
| `list is empty` | comparison |

```eng
set fruits to a list of "pear", "apple", "fig"
add "date" to fruits
sort fruits
say join fruits with ", "
remove "fig" from fruits
say length of fruits
```

`sort` compares numbers with numbers and text with text. Mixing kinds is a catchable error.

## Tables

Tables store values under names. Keys are single words or quoted text.

```eng
set person to a table with name "Sam", age 25
say person's name
change person's age to 26
set person's city to "Paris"
remove "city" from person

set profile to a table with "home address" "12 Mill Lane"
say profile's "home address"
```

| Phrase or statement | Meaning |
|---|---|
| `a table with key value, key value` | create a table |
| `an empty table` | create an empty table |
| `table's key` | read a value |
| `table's "key with spaces"` | read a quoted key |
| `set table's key to value` | create or replace a key |
| `change table's key to value` | update an existing key |
| `remove key from table` | remove a key |
| `length of table` | count the entries |
| `table contains key` | comparison |
| `table is empty` | comparison |

Reading a missing key returns `nothing`.

## Conversion and JSON

```eng
say number from "42"
say text of 42
say JSON of a table with name "Sam", age 25
set person to data from JSON "{\"name\":\"Sam\",\"age\":25}"
```

- `number from` trims the text and accepts a sign, decimals, and an exponent. Anything else is a catchable error.
- `JSON of` turns lists, tables, text, numbers, yes/no, and nothing into JSON text.
- `data from JSON` turns JSON text back into EngCode values. Invalid JSON is a catchable error.

JSON is the easiest way to save or send structured data.

## Time

| Phrase | Result |
|---|---|
| `now` | a table with `year`, `month`, `day`, `hour`, `minute`, `second` |
| `today` | text such as `2026-11-10` |
| `year of now` | the year |
| `month of now`, `day of now` | the month or day |
| `hour of now`, `minute of now`, `second of now` | the time |
| `format of now with "YYYY-MM-DD HH:mm"` | formatted text |

Pattern letters are `YYYY`, `MM`, `DD`, `HH`, `mm`, and `ss`. Other characters are copied literally.

```eng
say "It is " plus format of now with "HH:mm"
say "Today is " plus today
```

`wait 2 seconds` pauses a script. In an app it makes the current handler asynchronous. `wait 0 seconds` is allowed.

## Files

Files are always limited to the project folder. A path that escapes it is a catchable error.

```eng
write "first line" to file "notes.txt"
append "second line" to file "notes.txt"
read file "notes.txt" and save it as notes
list files in "." and save it as names
delete file "notes.txt"
```

| Statement | Meaning |
|---|---|
| `read file "path" and save it as name` | read the whole file as text |
| `write value to file "path"` | replace the file, adding a newline |
| `append value to file "path"` | add one line to the end |
| `delete file "path"` | remove the file if it exists |
| `list files in "folder" and save it as name` | read the entry names |

`file "path" exists` is a yes/no expression.

```eng
if file "notes.txt" exists:
    read file "notes.txt" and save it as notes
    say notes
end
```

Missing folders are created for `write` and `append`. `read`, `list`, and `delete` report a friendly error when the path is wrong.

## Device storage

Device storage remembers values between runs.

```eng
save "blue" to the device as "colour"
load "colour" from the device and save it as colour
delete "colour" from the device
```

- In a terminal script, storage is kept in `.engcode/storage.json` inside the project folder.
- In a web app, storage is kept in browser `localStorage`, namespaced by app name.
- Lists and tables are stored as JSON and come back as the same shape.
- Loading a key that was never saved gives `nothing`, so check for it or provide a default.

```eng
load "high score" from the device and save it as high score
if high score is nothing:
    set high score to 0
end
```

## Web requests

```eng
get data from "https://example.com/data.json" and save it as reply
send data "hello" to "https://example.com/api" and save it as reply
```

Both save the response text into a name. Use `data from JSON` to turn a JSON response into a table or list.

```eng
try:
    get data from "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m" and save it as weather
    say weather's current's temperature_2m
if it fails:
    say "The request failed: " plus the error
end
```

Rules:

- The address must start with `https://`.
- In a terminal script, add `--allow-network` to the command.
- In a web app, add hosts to `allow.network` in `engcode.json` before publishing. The runtime refuses other hosts.
- Responses are size-limited. A failed request is a catchable error.

## UI phrases

These only work inside an app:

```eng
value of "name"
key "w" is pressed
change text of "status" to "Saved"
show "details"
hide "details"
clear "search"
go to page "About"
open popup "confirm"
close popup "confirm"
play sound "ding.mp3"
```

`value of "id"` reads the current value of an input, dropdown, checkbox, slider, or the selected item of an interactive list.

Canvas drawing is also a set of statements:

```eng
clear canvas "board" to #111827
draw rectangle on "board" at x 10 and y 10 with width 20 and height 20 in white
draw circle on "board" at x 50 and y 50 with size 8 in white
draw line on "board" from x 0 and y 0 to x 100 and y 100 in white
draw text "Score" on "board" at x 12 and y 24 in white
draw image "ball.png" on "board" at x 50 and y 50 with size 24
```

## Sorting, reversing, and shuffling

These are statements because they change the list in place:

```eng
sort tasks
sort scores descending
reverse history
shuffle deck
```

To keep the original, copy it first:

```eng
set copy to an empty list
for each item in original:
    add item to copy
end
sort copy
```

## Errors

Every failure in this guide is a catchable runtime error, not a syntax error:

```eng
try:
    say 10 divided by 0
if it fails:
    say "Caught: " plus the error
end
```

Syntax and checker errors are found by `engcode check` before the program runs, so they cannot be caught.
