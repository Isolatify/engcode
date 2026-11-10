# The 20-lesson tutorial

`engcode learn` is a guided tour of EngCode. Each lesson explains one idea, shows a small example, suggests a task, and gives a hint after two failed attempts. Progress is saved in `.engcode/learn.json`.

```text
engcode learn              list every lesson and your progress
engcode learn 4            read lesson 4
engcode learn 4 --run      run the lesson example
engcode learn 4 --file main.eng   run your own attempt
engcode learn 4 --done     mark it complete without running
engcode learn --reset      clear all progress
```

Lessons 1–16 are terminal programs. Lessons 17–20 build apps; `--run` builds the app and tells you to use `engcode serve`, rather than opening a window.

---

## 1. Hello

`say` prints one line. Text goes inside double quotes.

```eng
say "Hello, world!"
```

**Task:** change the greeting to your own name.
**Hint:** `say "Hello, Ada!"`

---

## 2. Names and values

`set` gives a name to a value. Use the name later.

```eng
set name to "Sam"
say "Hello, " plus name
```

**Task:** store your own name and print a greeting.
**Hint:** `plus` joins text.

---

## 3. Working with text

```eng
set word to "Eng"
say word plus "Code"
say uppercase of word
say length of word
```

Output:

```text
EngCode
ENG
3
```

**Task:** print the length of your own word.
**Hint:** spaces count as characters too.

---

## 4. Numbers and rounding

```eng
set price to 12
set tax to price times 0.2
say round of tax
say price plus 1
```

Output:

```text
2
13
```

**Task:** change the price and predict both answers before running.
**Hint:** `round of 2.6` is 3; `round of 2.4` is 2.

---

## 5. Asking for input

```eng
ask "What is your name?" and save it as name
say "Hello, " plus name
```

**Task:** ask for a favourite colour instead of a name.
**Hint:** `ask "Favourite colour?" and save it as colour`

For numbers, use `ask for a number "How old are you?" and save it as age`.

---

## 6. Conditions

```eng
set age to 20
if age is at least 18:
    say "You can vote."
otherwise:
    say "Not yet."
end
```

**Task:** set `age` to 12 and check that the other branch runs.
**Hint:** the colon opens the block; `end` closes it.

---

## 7. Comparisons

```eng
set score to 7
if score is greater than 5:
    say "high"
end
if "cat" starts with "c":
    say "starts"
end
if "a,b" contains ",":
    say "has comma"
end
```

Comparisons include `is`, `is not`, `is greater than`, `is less than`, `is at least`, `is at most`, `is between`, `contains`, `starts with`, `ends with`, `is empty`, and `is not empty`.

**Task:** add a test for `ends with`.
**Hint:** `if "hello" ends with "lo":`

---

## 8. Loops

```eng
repeat 3 times:
    say "Hello"
end

count from 1 to 3 as number:
    say number
end
```

**Task:** print the numbers 1 to 5.
**Hint:** change `3` to `5` in the count loop.

`stop` leaves the nearest loop. `skip` moves to the next turn.

---

## 9. Lists

```eng
set fruits to a list of "apple", "banana", "cherry"
say length of fruits
say item 1 of fruits
add "date" to fruits
sort fruits
say join fruits with ", "
```

Output:

```text
3
apple
apple, banana, cherry, date
```

**Task:** add another fruit and print the last item.
**Hint:** `last item of fruits`

Lists count from 1.

---

## 10. Tables

```eng
set person to a table with name "Sam", age 25
say person's name
change person's age to 26
set place to a table with city "Paris"
say place's city
```

**Task:** add a country to the table and print it.
**Hint:** `a table with city "Paris", country "France"`

Use `person's "home address"` when a key has spaces.

---

## 11. Functions

```eng
define greet with who:
    give back "Hello, " plus who
end

say greet "Sam"
```

**Task:** write a function that doubles a number.
**Hint:** define one parameter, then `give back number times 2`.

---

## 12. Recursion

A function can call itself.

```eng
define factorial with n:
    if n is at most 1:
        give back 1
    end
    give back n times (call factorial with n minus 1)
end

say factorial 5
```

Output: `120`.

**Task:** try `factorial 6` and predict the answer first.
**Hint:** 6 factorial is 720.

---

## 13. Default values

```eng
define greet with who default "friend":
    say "Hello, " plus who
end

greet
greet "Sam"
```

Output:

```text
Hello, friend
Hello, Sam
```

**Task:** add a second default parameter for a greeting.
**Hint:** separate parameters with a comma.

---

## 14. Friendly errors

```eng
try:
    say 10 divided by 0
if it fails:
    say "I caught an error."
end
```

**Task:** print `the error` inside the failure block.
**Hint:** `say "Caught: " plus the error`

Only runtime errors are caught. Syntax errors are found by `engcode check`.

---

## 15. Files

```eng
write "first line" to file "lesson-note.txt"
append "second line" to file "lesson-note.txt"
read file "lesson-note.txt" and save it as notes
say notes
delete file "lesson-note.txt"
```

Output:

```text
first line
second line
```

**Task:** write three lines, read them back, then delete the file.
**Hint:** each `write` or `append` adds a newline after the text.

Files stay inside the project folder.

---

## 16. Modules

`helpers.eng`:

```eng
define greet with who:
    give back "Hello, " plus who
end
```

`main.eng`:

```eng
use "helpers.eng"
say greet "Sam"
```

**Task:** move a function into `helpers.eng` and use it from `main.eng`.
**Hint:** paths in `use` are relative to the importing file.

This lesson uses two files, so `--run` explains the setup instead of executing a single example.

---

## 17. Your first page

```eng
app "Hello Page":
    page "Home":
        heading "Hello, page"
        text "This text is part of the page."
    end
end
```

**Task:** add a second page and a button.
**Hint:** a page starts with `page "Name":` and ends with `end`.

Run it:

```text
engcode serve .
```

---

## 18. Styling

```eng
app "Styled Page":
    page "Home":
        heading "Styled"
        text "Colour and space come from style blocks."
    end
end

style everything:
    font is modern
    background is #0f172a
    text color is #f8fafc
    padding is 32
end
```

**Task:** change the background colour and the corner radius.
**Hint:** colours look like `#0f172a`; radius is `rounded corners is 12`.

---

## 19. Events

```eng
app "Click Counter":
    page "Home":
        heading "Click the button"
        button "Count" called "count"
        text "0" called "result"
    end
end

when "count" is clicked:
    change text of "result" to "You clicked me!"
end
```

**Task:** change the text instead of showing a popup.
**Hint:** `change text of "result" to "Clicked!"`

---

## 20. State and storage

```eng
app "Remember Me":
    page "Home":
        heading "Remember Me"
        input called "name" with label "Your name"
        button "Save" called "save"
        text "" called "message"
    end
end

keep track of saved name as ""

when "save" is clicked:
    change saved name to value of "name"
    save saved name to the device as "name"
    change text of "message" to "Saved " plus saved name
end
```

**Task:** load the saved name when the page opens.
**Hint:** load from the device and set the state in `when the page opens:`.

```eng
when the page opens:
    load "name" from the device and save it as saved name
end
```

---

## After the tutorial

- Read the [cheat sheet](cheatsheet.md) for a one-page reference.
- Read the [app guide](apps.md) and [styling guide](styling.md) to build something real.
- Try the [examples](../examples), starting with `todo`, `notes`, and `pong`.
- Run `engcode format` and `engcode lint` on your own program.
- Use `engcode run main.eng --explain` when a program surprises you.

If a lesson will not pass, run `engcode check main.eng` and read the line and caret. The hint appears after two attempts, and `engcode learn 4 --run` shows the example output again.
