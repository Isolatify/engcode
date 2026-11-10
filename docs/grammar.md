# EngCode Grammar (EBNF)

This is the formal grammar for EngCode 1.0. It is deliberately written in a form that can be implemented by a hand-written recursive-descent parser; the notes after each section describe the contextual rules that pure EBNF cannot express.

## Notation

```ebnf
=       definition
|       alternative
[ x ]   optional
{ x }   zero or more
( x )   grouping
"x"     literal keyword or punctuation (case-insensitive for words)
```

- `NEWLINE` is significant. One statement per line.
- Indentation and blank lines are ignored.
- `EOF` is end of file.
- Words in the grammar are matched case-insensitively. Names and keys are case-sensitive.
- `/* ... */` in this document is a grammar comment, not source syntax.

---

## 1. Lexical grammar

```ebnf
letter          = "A".."Z" | "a".."z" | "_" ;
digit           = "0".."9" ;
word            = letter { letter | digit } ;
number          = [ "-" ] digit { digit } [ "." digit { digit } ] ;
hex             = "#" hexdigit hexdigit hexdigit [ hexdigit hexdigit hexdigit ] ;
string          = '"' { string_char | escape } '"' ;
string_char     = any character except '"' , "\" , NEWLINE ;
escape          = "\" ( '"' | "\" | "n" | "t" ) ;
comment         = "note" ":" { any character except NEWLINE } ;
property_op     = "'s" ;

NEWLINE         = "\n" | "\r\n" ;
punctuation     = ":" | "," | "(" | ")" | "'s" | hex ;
```

Lexer notes:

1. Spaces and tabs are skipped. A newline ends the current statement.
2. `note:` starts a comment wherever it appears outside a string, including after a statement.
3. `#` begins a hex color only inside a style or drawing value. Outside those contexts it is a lexical error: `I don't understand "#". Colors belong in a style block.`
4. A negative number may be written `-5` or `minus 5`; both produce the same value.
5. Strings do not interpolate. Use `plus` to join text.
6. `'s` is one token, produced only when an apostrophe is immediately followed by `s` and preceded by a word. It is the property operator.
7. Every token carries its source file, line, column, and length. Diagnostics use that span.

---

## 2. Names

```ebnf
name            = word { word } ;
key             = word | string ;
function_name   = name ;
```

A `name` is not lexed as a unit. The parser resolves it with a **name pre-scan**:

1. Before parsing expressions, scan the token stream for names introduced by:
   `set`, `change`, `add`/`remove` targets, `keep track of`, `for each`, `count ... as`,
   `define`, function parameters, `it has` fields, `it can` methods, and
   `ask ... as` / `load ... as`.
2. Sort the collected names by word count, longest first.
3. At a name position, consume the longest collected name that matches the next words.
4. If nothing matches, consume one word; the checker reports an unknown name.

**Hard delimiters** end a declared name and may not appear inside one:

```text
to  from  with  as  in  and  or  called  showing  level  default  that  ,  :
```

Everything else is a **contextual keyword**. It is a keyword only in the construct where the grammar uses it. This is why these are valid:

```eng
set is happy to yes
set nothing here to nothing
if is happy is yes:
    say "still happy"
end
```

`is happy` is matched before `is`; `nothing here` is matched before the literal `nothing`.

**Built-in names and user names.** Built-in phrases (`length of`, `value of`, `random number`, ...) are recognized by their phrase, not by reserving a word. When the following words complete a built-in phrase, the built-in wins over a same-named variable (`set length to 3` is fine; `length of name` is still the built-in). A user function may not reuse a built-in function name; the checker says which name collided.

---

## 3. Programs and statements

```ebnf
program         = { NEWLINE } { top_decl NEWLINE } EOF ;

top_decl        = statement
                | app_decl
                | style_decl
                | event_decl
                | state_decl
                | use_decl
                | theme_decl
                | kind_decl ;

statement       = comment
                | assignment
                | change_stmt
                | add_stmt
                | remove_stmt
                | say_stmt
                | ask_stmt
                | ask_number_stmt
                | if_stmt
                | repeat_stmt
                | foreach_stmt
                | count_stmt
                | while_stmt
                | stop_stmt
                | skip_stmt
                | define_stmt
                | give_back_stmt
                | try_stmt
                | use_decl
                | read_stmt
                | write_stmt
                | append_stmt
                | delete_stmt
                | list_files_stmt
                | get_stmt
                | send_stmt
                | save_device_stmt
                | load_device_stmt
                | delete_device_stmt
                | play_stmt
                | wait_stmt
                | sort_stmt
                | reverse_stmt
                | shuffle_stmt
                | call_stmt
                | call_value_stmt
                | method_stmt
                | state_decl
                | show_stmt
                | hide_stmt
                | clear_stmt
                | clear_canvas_stmt
                | change_ui_stmt
                | go_stmt
                | popup_stmt
                | draw_stmt ;

block           = NEWLINE { statement NEWLINE } ;
```

A block ends at the `end` matching its header, or at the clause that belongs to the enclosing construct (`otherwise`, `if it fails`). Indentation never closes a block.

Some statements end an expression at a fixed English clause. The parser uses lookahead for the clause, not a greedy expression: `ask "Name?" and save it as name`, `read file path and save it as contents`, `get data from url and save it as reply`, `save value to the device as "key"`, and `wait 2 seconds`. If the expression itself needs the same words, put it in parentheses.

### 3.1 Variables and properties

```ebnf
assignment      = "set" target "to" expression ;
change_stmt     = "change" target "to" expression ;
add_stmt        = "add" expression "to" target ;
remove_stmt     = "remove" expression "from" target ;

target          = name [ property ] | string ;
property        = "'s" key ;
```

Examples:

```eng
set age to 25
change age to age plus 1
add 5 to age
remove "banana" from fruits
set person's age to 26
set person's "home address" to "12 Main Street"
set tasks to an empty list
```

- `set` creates or replaces; `change` errors if the name does not exist.
- A string `target` is allowed only for `add`/`remove` on a UI list id.
- `person's age` reads a table key or object field. A single-word key is bare; a multi-word key is quoted.
- Assigning to a missing table key creates it. Assigning to a missing object field is an error.

### 3.2 Output and input

```ebnf
say_stmt        = "say" expression ;
ask_stmt        = "ask" expression "and" "save" "it" "as" name ;
ask_number_stmt = "ask" "for" "a" "number" expression "and" "save" "it" "as" name ;
```

### 3.3 Conditions

```ebnf
if_stmt         = "if" expression ":" block
                  { "otherwise" "if" expression ":" block }
                  [ "otherwise" ":" block ]
                  "end" ;
```

`otherwise if` and `otherwise` attach to the nearest open `if`. Conditions must be `yes`/`no`; there is no truthiness.

### 3.4 Loops

```ebnf
repeat_stmt     = "repeat" expression "times" ":" block "end" ;
foreach_stmt    = "for" "each" name "in" expression ":" block "end" ;
count_stmt      = "count" "from" expression "to" expression
                  [ "as" name ] ":" block "end" ;
while_stmt      = "while" expression ":" block "end" ;
stop_stmt       = "stop" "the" "loop" ;
skip_stmt       = "skip" "to" "the" "next" "one" ;
```

`count` is inclusive at both ends. Its default variable is `counter`. `stop` and `skip` affect the innermost loop. Inside an `every` timer, they stop or skip that tick.

The expression after `repeat` ends at the `times` delimiter: `repeat 5 times:` and `repeat count times:` both work. If the count itself needs multiplication, parenthesize it: `repeat (2 times 3) times:`.

### 3.5 Functions

```ebnf
define_stmt     = "define" name [ "with" params ] ":" block "end" ;
params          = param { ( "," | "and" ) param } ;
param           = name [ "default" comparison ] ;
give_back_stmt  = "give" "back" [ expression ] ;
```

A parameter name is parsed until `default`, `,`, `and`, or `:`. `give back` without a value returns `nothing`. `give back` outside a function is a checker error.

### 3.6 Calls

```ebnf
call_stmt       = name [ argument_list ] ;
call_value_stmt = "call" expression "with" argument_list ;
method_stmt     = name word [ argument_list ] ;
argument_list   = argument { ( "," | "and" ) argument } ;
argument        = comparison ;

call_expr       = "call" expression [ "with" argument_list ] ;
function_value  = "the" "function" name ;
```

Resolution at statement level:

- If the first name is a declared function, the statement is a call.
- If the first name is a declared object variable, the second name is a method.
- `call ... with ...` is always an explicit value call.
- `add` and `remove` are mutations when the line contains the required `to`/`from`; otherwise they fall back to function calls if declared. The error message for a missing `to` shows the mutation form.

Inside an argument list, `and` separates arguments. `check a and b` is `check(a, b)`. Parentheses group a logical expression: `check (a and b)`.

### 3.7 Errors

```ebnf
try_stmt        = "try" ":" block
                  "if" "it" "fails" ":" block
                  "end" ;
```

The `try` block ends at `if it fails` at the same nesting depth. `the error` is bound to the caught message as text inside the failure block. Only runtime errors are catchable.

### 3.8 Modules, files, web, storage

```ebnf
use_decl        = "use" ( string | module_name ) ;
theme_decl      = "use" "theme" string ;
module_name     = name ;

read_stmt       = "read" "file" expression "and" "save" "it" "as" name ;
write_stmt      = "write" expression "to" "file" expression ;
append_stmt     = "append" expression "to" "file" expression ;
delete_stmt     = "delete" "file" expression ;
list_files_stmt = "list" "files" "in" expression "and" "save" "it" "as" name ;

get_stmt        = "get" "data" "from" expression "and" "save" "it" "as" name ;
send_stmt       = "send" "data" expression "to" expression
                  "and" "save" "it" "as" name ;

save_device_stmt   = "save" expression "to" "the" "device" "as" expression ;
load_device_stmt   = "load" expression "from" "the" "device"
                     "and" "save" "it" "as" name ;
delete_device_stmt = "delete" expression "from" "the" "device" ;

play_stmt       = "play" "sound" expression ;
wait_stmt       = "wait" expression "seconds" ;
```

`use math`, `use time`, `use random`, `use json`, `use files`, `use web`, and `use storage` are accepted and have no runtime effect. A path import must end in `.eng` and stay inside the project root. `use theme "dark"` sets the initial UI theme.

### 3.9 State, screen actions, sorting, waiting

```ebnf
state_decl      = "keep" "track" "of" name "as" expression ;

show_stmt       = "show" string
                | "show" expression "in" string ;
hide_stmt       = "hide" string ;
clear_stmt      = "clear" string ;

change_ui_stmt  = "change" ui_property "of" string "to" expression ;
ui_property     = "text"
                | "value"
                | "background"
                | "text" "color"
                | "font" "size"
                | "width" | "height"
                | "rounded" "corners"
                | "padding" | "margin" | "border"
                | "opacity" | "alignment" ;

go_stmt         = "go" "to" "page" expression ;
popup_stmt      = ( "open" | "close" ) "popup" string ;

sort_stmt       = "sort" expression [ "descending" ] ;
reverse_stmt    = "reverse" expression ;
shuffle_stmt    = "shuffle" expression ;
```

For `change background of ... to ...`, `change text color of ... to ...`, and `change border ...`, a bare color name (`green`, `light blue`) is accepted in addition to a string or expression; the checker resolves it against the color palette.

### 3.10 Canvas drawing

```ebnf
clear_canvas_stmt =
    "clear" "canvas" expression "to" color ;

draw_stmt =
    "draw" "rectangle" "on" comparison
        "at" "x" comparison "and" "y" comparison
        "with" "width" comparison "and" "height" comparison
        "in" color
  | "draw" "circle" "on" comparison
        "at" "x" comparison "and" "y" comparison
        "with" "size" comparison
        "in" color
  | "draw" "text" expression "on" comparison
        "at" "x" comparison "and" "y" comparison
        "in" color
  | "draw" "line" "on" comparison
        "from" "x" comparison "and" "y" comparison
        "to" "x" comparison "and" "y" comparison
        "in" color
  | "draw" "image" expression "on" comparison
        "at" "x" comparison "and" "y" comparison
        "with" "size" comparison ;

color           = color_name | hex | "rgb" "(" number "," number "," number ")" ;
color_name      = name ;   /* resolved from the English color palette */
```

Drawing is available only inside an app file. `clear canvas` and `draw` outside an app are checker errors with a link to the app guide.

---

## 4. Expressions

```ebnf
expression      = or_expr ;

or_expr         = and_expr { "or" and_expr } ;
and_expr        = not_expr { "and" not_expr } ;
not_expr        = "not" not_expr | comparison ;

comparison      = additive [ comparison_tail ] ;

comparison_tail =
    "is" [ "not" ] ( additive
                   | "greater" "than" additive
                   | "less" "than" additive
                   | "at" "least" additive
                   | "at" "most" additive
                   | "between" additive "and" additive
                   | "empty" )
  | "contains" additive
  | "starts" "with" additive
  | "ends" "with" additive ;

additive        = multiplicative { ( "plus" | "minus" ) multiplicative } ;
multiplicative  = unary { ( "times" | "divided" "by" | "remainder" ) unary } ;
unary           = "minus" unary | postfix ;
postfix         = primary { "'s" key } ;
```

Notes:

- Comparisons are non-associative. `a is b is c` is a syntax error with a suggestion to use `and`.
- `is between A and B` consumes the `and` that belongs to `between`. The outer `and` still works: `age is between 13 and 19 and is happy is yes`.
- `not` binds looser than comparisons but tighter than `and`. `not x is empty` means `not (x is empty)`.
- `and` in an argument list is an argument separator; inside parentheses it is logical `and`.
- `plus` concatenates when either side is text. `minus`, `times`, `divided by`, and `remainder` require numbers.
- `divided by` is one operator spelled with two words.

### 4.1 Primary expressions

```ebnf
primary =
    number | string | "yes" | "no" | "nothing"
  | "(" expression ")"
  | list_literal
  | table_literal
  | function_literal
  | new_literal
  | builtin_expr
  | call_expr
  | function_value
  | error_ref
  | user_call
  | name ;

error_ref       = "the" "error" ;

user_call       = name [ argument_list ] ;

list_literal    = "a" "list" "of" list_item { ( "," | "and" ) list_item }
                | "an" "empty" "list" ;
list_item       = comparison ;

table_literal   = "a" "table" "with" table_entry { "," table_entry }
                | "an" "empty" "table" ;
table_entry     = key comparison ;

function_literal =
    "a" "function" [ "with" params ]
    ( "that" "gives" "back" expression
    | "that" "does" ":" block "end" ) ;

new_literal     = "a" "new" name [ "with" table_entry { "," table_entry } ] ;
```

Semantics of calls in expression position:

- If the longest matched name is a declared function and arguments follow, parse `user_call`.
- If the longest matched name is a variable, it is a variable reference.
- If a function name appears with no arguments, it is a **function value** when the function has parameters, and a zero-argument call when it has none. Use `the function name` when the intent must be explicit.
- `call expression with args` is the unambiguous form for function values.

Table keys are single words or quoted strings. Table values parse at `comparison` precedence, so a top-level `and` ends the entry and lets a surrounding list use `and` as its item separator.

### 4.2 Built-in phrases

```ebnf
builtin_expr =
    unary_phrase
  | item_phrase
  | random_phrase
  | minmax_phrase
  | split_phrase
  | join_phrase
  | replace_phrase
  | position_phrase
  | format_phrase
  | date_part_phrase
  | json_phrase
  | convert_phrase
  | value_phrase
  | key_phrase
  | file_exists
  | nullary_phrase ;

unary_phrase    = ( "uppercase" | "lowercase" | "trim" | "length"
                  | "round" | "floor" | "ceiling" ) "of" comparison
                | "absolute" "value" "of" comparison
                | "square" "root" "of" comparison
                | ( "sine" | "cosine" | "tangent" ) "of" comparison
                | "text" "of" comparison ;

item_phrase     = "item" comparison "of" comparison
                | "last" "item" "of" comparison ;
random_phrase   = "random" "number" "from" additive "to" additive
                | "random" "item" "of" comparison
                | "random" "decimal" ;
minmax_phrase   = ( "minimum" | "maximum" ) "of" additive "and" additive
                | "power" "of" additive "and" additive ;
split_phrase    = "split" comparison "by" comparison ;
join_phrase     = "join" comparison "with" comparison ;
replace_phrase  = "replace" comparison "with" comparison "in" comparison ;
position_phrase = "position" "of" comparison "in" comparison ;
format_phrase   = "format" "of" comparison "with" comparison ;
date_part_phrase = ( "year" | "month" | "day" | "hour" | "minute" | "second" )
                   "of" comparison ;
json_phrase     = "JSON" "of" comparison
                | "data" "from" "JSON" comparison ;
convert_phrase  = "number" "from" comparison ;
value_phrase    = "value" "of" comparison ;
key_phrase      = "key" string "is" "pressed" ;
file_exists     = "file" comparison "exists" ;
nullary_phrase  = "now" | "today" | "pi" ;
```

`shuffle` and `sort` are statements, not expressions, because they change their argument. `random decimal` is a nullary expression. `pi` and `e` are constants.

---

## 5. Apps, pages, and UI blocks

```ebnf
app_decl        = "app" expression ":" app_block "end" ;
app_block       = NEWLINE { app_item NEWLINE } ;
app_item        = page_decl | style_decl | theme_decl | state_decl | event_decl | use_decl ;

page_decl       = "page" expression ":" page_block "end" ;
page_block      = NEWLINE { ui_block NEWLINE } ;

ui_block        = container_block | leaf_block ;
```

Pages are routes in a single-page build. Their names must be unique. The first page is the default. `go to page "Name"` switches pages and updates `#/name`.

### 5.1 Containers

```ebnf
container_block =
    ( "section" | "card" ) [ expression ] [ "called" string ]
        ":" page_block "end"
  | ( "row" | "column" | "grid" ) [ "called" string ]
        ":" page_block "end"
  | "menu" [ "called" string ] ":" page_block "end"
  | "navigation" "bar" [ "called" string ] ":" page_block "end"
  | "footer" [ "called" string ] ":" page_block "end"
  | "form" "called" string ":" page_block "end"
  | "popup" "called" string ":" page_block "end"
  | "tabs" ":" { tab_block } "end" ;

tab_block       = "tab" expression ":" page_block "end" ;
```

`section` and `card` may take a visible label or just an id: `section called "projects":`. A container contains only UI blocks, never behavior statements.

### 5.2 Leaves

```ebnf
leaf_block =
    "heading" expression [ "level" number ] [ "called" string ]
  | "paragraph" expression [ "called" string ]
  | "text" expression [ "called" string ]
  | "button" expression [ "called" string ] [ "submits" ]
  | "input" "called" string ui_attrs [ "required" ]
  | "text" "area" "called" string ui_attrs [ "required" ]
  | "checkbox" expression "called" string ui_attrs
  | "dropdown" "called" string "with" "choices" expr_list
  | "radio" "choice" expression "called" string
  | "slider" "called" string
        "with" "minimum" comparison "and" "maximum" comparison
        [ "and" "starting" comparison ]
  | "switch" expression "called" string ui_attrs
  | "image" expression ui_attrs
  | "video" expression ui_attrs [ "loops" ]
  | "audio" expression ui_attrs [ "loops" ]
  | "list" "called" string [ "showing" expression ]
  | "table" "called" string
        ( "showing" expression | "with" "columns" expr_list )
  | "link" expression "to" expression [ "called" string ]
  | "icon" expression [ "called" string ]
  | "divider"
  | "canvas" "called" string
        "with" "width" comparison "and" "height" comparison ;

ui_attrs        = { "with" attr ui_value { "and" attr ui_value } } ;
attr            = "label" | "hint" | "starting" | "minimum"
                | "maximum" | "width" | "height" | "description"
                | "poster" | "choices" | "columns" ;
/* `label` is accepted on labels and accessible names. */
ui_value        = comparison ;
expr_list       = comparison { "," comparison } ;
```

Leaf blocks are one line. `called` ids are unique per page. `input` and `text area` receive an accessible label from `with label`, or from the id when no label is supplied. `image` uses `with description` as `alt`; `video` and `audio` use it as `aria-label` and fallback text. `video` accepts `with poster "image.png"` and `loops`; `audio` accepts `loops`. `width` and `height` on an image or video become HTML size attributes.

A list with a matching `when "id" is clicked` handler becomes interactive. Each item is focusable and can be opened with a click, `Enter`, or `Space`. `value of "id"` returns the selected item, including a whole table when the list shows tables. `change value of "id" to item` selects and highlights an item in code, so opening a note can light up its row. A table with a `title` field is shown by its title, which keeps note-like lists readable.

---

## 6. Styles

```ebnf
style_decl      = "style" style_target { style_qualifier }
                  ":" style_block "end" ;

theme_decl      = "theme" string [ "in" "dark" "mode" ]
                  ":" style_block "end" ;

style_target    = "everything" | string | block_kind ;
style_qualifier = "on" screen_size | "in" "dark" "mode" ;
screen_size     = ( "small" | "big" ) "screens" | "phones" | "tablets" ;

style_block     = NEWLINE { style_stmt NEWLINE } ;
style_stmt      = property ( "is" | "of" ) style_value
                | state_style ;

state_style     = "when" ( "mouse" "is" "over"
                         | "pressed"
                         | "focused" )
                  ":" style_block "end" ;

property        = word { word } ;   /* validated against the property table */
style_value     = color | size | string | number | "yes" | "no"
                | "row" | "column" | "grid"
                | "center" | "left" | "right"
                | "full" | "half" | "auto"
                | name ;

border_value    = "border" "is" number ( "solid" | "dashed" ) color ;
shadow_value    = "shadow" "is" ( "soft" | "medium" | "strong" | "glow" ) ;
transition_value= "transition" "is" duration [ property_name ] ;
animation_value = "animation" "is" animation_name "over" duration [ "forever" ] ;

size            = number [ "percent" ] ;
duration        = number ( "seconds" | "milliseconds" ) ;
animation_name  = "fade" ( "in" | "out" )
                | "slide" ( "in" | "up" | "down" | "left" | "right" )
                | "pop" | "float" | "pulse" | "spin"
                | "bounce" | "shake" | "glow" ;
block_kind      = "buttons" | "headings" | "paragraphs" | "rows"
                | "columns" | "grids" | "cards" | "inputs"
                | "lists" | "tables" | "links" | "sections"
                | "images" | "videos" | "navigation bar" ;
```

Property names are matched against the fixed table:

```text
background, text color, font, font size, font weight, font style,
line height, letter spacing, text decoration, text transform,
text shadow, width, height, min width, max width, min height,
max height, padding, margin, gap, rounded corners, border radius,
border, border width, border color, border style, shadow, alignment,
layout, direction, wrap, align items, justify content, flex grow,
flex shrink, grid columns, object fit, object position,
background size, background position, background repeat,
overflow, position, top, right, bottom, left, z index, cursor,
opacity, transition, animation, animation delay
```

`style_target` may be a UI kind. Ids and kinds are compiled to scoped selectors; raw CSS selectors are not accepted.

### Themes

A `theme` block defines named colors, fonts, and spacing once, then styles refer to those names:

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
```

Every theme property becomes a CSS custom property: `accent` → `--eng-accent`, `background` → `--eng-bg`, `text` → `--eng-fg`, `surface` → `--eng-surface`, `muted` → `--eng-muted`, `border` → `--eng-border`, `font` → `--eng-font`, `corner radius` → `--eng-radius`, `shadow` → `--eng-shadow`. A style value with the same name as a theme property compiles to `var(...)`. Light declarations go into `:root`; `in dark mode` declarations apply with `[data-theme="dark"]` and automatically follow the visitor's system preference. The runtime theme toggle switches between them.

Friendly font names are expanded to readable stacks: `system`, `modern`, `sans`, `serif`, `classic`, `mono`, `code`, `rounded`, `friendly`, `windows`, `windows display`, `display`, and `handwriting`. `windows` uses Segoe UI Variable Text and falls back to Segoe UI, so a desktop app keeps the native Windows 11 feeling while still working on other systems. Named shadows are `soft`, `medium`, `strong`, and `glow`.

Animations and transitions are plain English: `transition is 0.3 seconds`, `animation is fade in over 0.8 seconds`, and `animation is pulse over 1.5 seconds forever`. Reduced-motion preferences turn animations off automatically.

---

## 7. Events and timers

```ebnf
event_decl      = when_decl | every_decl ;

when_decl       = "when" event ":" block "end" ;
event           =
    string "is" ( "clicked" | "hovered" | "checked" )
  | string "changes"
  | string "is" "submitted"
  | "the" "user" "types" "in" string
  | "the" "user" "presses" "key" string
  | "the" "page" "opens"
  | "page" string "opens"
  | "the" "window" "is" "resized"
  | "the" "mouse" ( "enters" | "leaves" ) string ;

every_decl      = "every" ( "frame" | expression "seconds" )
                  ":" block "end" ;
```

`every frame` targets roughly 60 frames per second and is intended for canvas games. `stop the loop` stops a timer; `skip to the next one` skips the rest of the current tick.

---

## 8. Objects

```ebnf
kind_decl       = "define" "a" "kind" "of" "thing" "called" name ":"
                  { kind_member NEWLINE } "end" ;

kind_member     = "it" "has" key { "and" key }
                | "it" "can" word [ "with" params ] ":" block "end" ;
```

A kind is constructed with `a new Name with key value, key value`. Field names are single words or quoted strings; method names are single words, which keeps `rex celebrate` unambiguous. Methods are called as statements (`rex bark`) or accessed as bound function values (`rex's bark`). Inside a method, fields are in scope and `it` refers to the receiver.

---

## 9. Static semantics

These rules are enforced by the checker before execution.

1. **Scopes.** Globals, function locals, parameters, loop variables, and object fields are separate namespaces. A local may shadow a global; the linter warns.
2. **Definitions.** `set` may create or replace. `change`, `add`, and `remove` require an existing target. Two functions with the same name are an error. A function and a variable may not share a name.
3. **Arity.** Calls check the number of arguments against parameters and defaults. A missing required parameter names the parameter and the call line.
4. **Types.** `minus`, `times`, `divided by`, `remainder`, and ordering comparisons require numbers (or two texts for ordering). `plus` accepts text on either side.
5. **Conditions.** `if`, `while`, `every`-timer conditions, and `not` require `yes`/`no`.
6. **Loops.** `stop` and `skip` must be inside a loop or timer.
7. **Returns.** `give back` must be inside a function or method. A method's return value is available through `object's method`.
8. **UI.** Every `called` id is unique per page. Every event and style id resolves to a block. Every `showing` expression is a list (and a table's `showing` is a list of tables). Every page name is unique.
9. **Capabilities.** Network hosts must be declared; file paths must stay inside the project root; storage keys are strings.
10. **Accessibility.** Missing labels and alt text are warnings; low contrast is a warning. `--strict` promotes them to errors.

---

## 10. Runtime semantics

- **Evaluation order.** Left to right, except short-circuit `and`/`or`.
- **Equality.** `is` is deep value equality. `nothing is nothing` is `yes`. A number never equals text.
- **Truth.** Only `yes` and `no` are conditions. `1`, `""`, and `nothing` are not truthy.
- **Numbers.** IEEE-754 doubles. Printing uses at most twelve significant digits and trims trailing zeros.
- **Text conversion.** `plus` with text converts the other side using the same display rules as `say`. `text of` is the explicit form.
- **Lists.** 1-based; `item 0` and negative positions return `nothing`. `length of` is the count.
- **Tables.** Insertion-ordered maps. A missing key reads `nothing`.
- **Division by zero.** Catchable runtime error: `You can't divide by zero.`
- **Errors.** `try` catches runtime errors from its body, including calls. `the error` is text. Syntax and checker errors are never caught.
- **Modules.** Imported once, cached by resolved path. Top-level statements run on first import. Import cycles are an error that lists the cycle.
- **Async.** `get data`, `send data`, and `wait` make the enclosing handler asynchronous in apps. In scripts they run synchronously (HTTP uses the platform `curl` client) and report failures as catchable errors.
- **State.** `keep track` values trigger a screen refresh after the current handler. Nested list/table mutations count as changes.
- **Routing.** `go to page` changes the hash route and shows one page section at a time. `#anchor` hashes scroll within the current page.
- **Interactive lists.** When a list has a click handler, its items become buttons. `value of` on the list returns the selected item. Keyboard activation uses `Enter` or `Space`.

