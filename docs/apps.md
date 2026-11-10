# Build apps and websites

An EngCode app puts structure, styles, and behavior in one `.eng` file. The same file runs in a browser with `engcode serve`, builds to a static site with `engcode build web`, and opens in a native window with `engcode app`.

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

The `app` block is the container. A `page` is a route. Leaf blocks such as `heading` and `button` are one line; containers end with `end`. Give anything you want to style or control a `called "id"`.

## Pages and routes

```eng
app "Two pages":
    page "Home":
        heading "Home"
        button "Read more" called "more"
    end

    page "About":
        heading "About"
        text "Made with EngCode."
    end
end

when "more" is clicked:
    go to page "About"
end
```

Pages become hash routes (`#/home`, `#/about`). The first page is shown by default. Page names must be unique. A page may also be opened with `when page "About" opens:`.

## Blocks

### Layout

| Block | Example |
|---|---|
| Section | `section "Projects" called "projects":` … `end` |
| Card | `card "Profile" called "profile":` … `end` |
| Row | `row called "toolbar":` … `end` |
| Column | `column:` … `end` |
| Grid | `grid called "gallery":` … `end` |
| Menu | `menu:` … `end` |
| Navigation bar | `navigation bar:` … `end` |
| Footer | `footer:` … `end` |
| Form | `form called "signup":` … `end` |
| Popup | `popup called "confirm":` … `end` |
| Tabs | `tabs:` with `tab "One":` … `end` |

Containers hold only other blocks. Put behavior in `when` handlers.

### Text and actions

```eng
heading "Welcome" level 1
paragraph "A longer sentence that introduces the page."
text "Ready" called "status"
button "Save" called "save"
button "Send" called "send" submits
link "Read the docs" to "https://example.com"
icon "star"
divider
```

`heading` defaults to level 1 and accepts `level 1` through `level 6`. Use one level-1 heading per page, and do not skip levels.

### Inputs

```eng
input called "name" with label "Your name" and hint "Ada"
text area called "notes" with label "Notes" and hint "Write something"
checkbox "I agree" called "agree" with starting no
switch "Dark mode" called "dark"
dropdown called "size" with choices "Small", "Medium", "Large"
radio choice "Small" called "small"
slider called "volume" with minimum 0 and maximum 100 and starting 40
```

`called` is the id used by events and `value of`. `with label` is the visible and accessible label. `with hint` becomes the placeholder and the screen-reader description. Add `required` to an `input` or `text area` when the form must not be empty.

### Lists and tables

```eng
list called "tasks" showing tasks
table called "scores" showing rows
table called "scores" with columns "Name", "Score"
```

`showing` must be a list — or a list of tables for a table. When a list contains tables, an item with a `title` field displays that title, which keeps note lists readable; otherwise `name` is used, and then the whole value.

When a list has a matching click handler, its items become focusable buttons:

```eng
list called "notes" showing notes

when "notes" is clicked:
    set selected note to value of "notes"
    change text of "editor" to selected note's body
end
```

`value of "notes"` is the selected item, including a whole table when the list shows tables. `change value of "notes" to note` selects and highlights an item from code.

### Media

```eng
image "sam.png" with description "A photo of Sam" and width 220 and height 220
video "tour.mp4" with description "A tour" and poster "cover.jpg" and loops
audio "hello.mp3" with description "A spoken greeting" and loops
```

`with description` becomes the image `alt` text, the media accessible name, and the fallback text. Relative paths resolve next to the `.eng` file and are copied into the build. Keep assets inside the project folder, or use an HTTPS address.

### Canvas

```eng
canvas called "board" with width 800 and height 500

every frame:
    clear canvas "board" to #111827
    draw circle on "board" at x 400 and y 250 with size 20 in white
end
```

Canvas ids work with `clear canvas`, `draw rectangle`, `draw circle`, `draw line`, `draw text`, and `draw image`. Add a short instruction line and a text fallback so keyboard and screen-reader visitors know what the game does.

## Reactive state

```eng
keep track of count as 0
keep track of tasks as an empty list
keep track of saved name as ""
```

`keep track` is app state. Changing a tracked name (or mutating a tracked list or table) refreshes every screen expression and `showing` list that depends on it, after the current handler finishes. Plain `set` names still work inside handlers but do not trigger a redraw.

## Events and timers

| Event | Syntax |
|---|---|
| Click | `when "id" is clicked:` |
| Change | `when "id" changes:` |
| Typing | `when the user types in "id":` |
| Hover | `when "id" is hovered:` |
| Mouse enter / leave | `when the mouse enters "id":` / `when the mouse leaves "id":` |
| Checked | `when "id" is checked:` |
| Submit | `when "id" is submitted:` |
| Key | `when the user presses key "Enter":` |
| Page open | `when the page opens:` or `when page "Home" opens:` |
| Resize | `when the window is resized:` |
| Timer | `every 5 seconds:` |
| Animation frame | `every frame:` |

`every frame` runs about 60 times per second. Inside a timer, `stop the loop` stops it and `skip to the next one` skips the rest of the tick. `wait 2 seconds` pauses an app handler; the generated handler becomes asynchronous automatically.

## Changing the screen

```eng
show "details"
hide "details"
clear "search"
change text of "status" to "Saved"
change value of "search" to ""
change background of "status" to green
change text color of "status" to white
change font size of "status" to 18
change width of "panel" to 320
change opacity of "panel" to 0.5
open popup "confirm"
close popup "confirm"
play sound "ding.mp3"
go to page "Settings"
say "Saved!"            note: shows a short toast in an app
```

`change ... of` supports a fixed list of safe properties: `text`, `value`, `background`, `text color`, `font size`, `width`, `height`, `rounded corners`, `padding`, `margin`, `border`, `opacity`, and `alignment`.

## Device storage

```eng
save tasks to the device as "tasks"
load "tasks" from the device and save it as saved tasks
delete "tasks" from the device
```

Web apps keep storage in browser `localStorage`, namespaced by app name. Scripts keep it in `.engcode/storage.json` inside the project. Apps cannot read another app's keys. Stored values may be text, numbers, yes/no, lists, and tables; they are serialised as JSON.

Use `try` around loaded data when the shape might have changed between versions.

## Web data

```eng
try:
    get data from "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m" and save it as weather
    change text of "result" to weather's current's temperature_2m
if it fails:
    change text of "result" to "I could not read the weather."
end
```

Browser apps may call HTTPS addresses. When `engcode.json` declares an allow list, the compiler embeds it and the runtime refuses every other host:

```json
{
  "name": "weather",
  "type": "app",
  "entry": "main.eng",
  "allow": { "network": ["api.open-meteo.com"] }
}
```

Without an allow list, a browser app can call any HTTPS host, so add one before publishing. Terminal scripts require `--allow-network`, and desktop builds follow the browser rules.

## Accessibility built in

EngCode generates semantic HTML, a skip link, labels for form fields, focus styles, and a theme button. `engcode check` also reports:

- missing image, video, or audio descriptions
- inputs without a label or id
- skipped heading levels or a page with no heading
- duplicate ids or pages
- event and style targets that do not exist
- unsafe links such as `javascript:`

Building or serving a site adds one more warning: low colour contrast between text and background. All of these are warnings, so they do not stop a build. Fix them when you can. `engcode check --strict` treats warnings as failures for CI.

## Run, build, and ship

```text
engcode serve .                 note: live-reload development server
engcode serve . --port 3000 --open
engcode build web . --out site
engcode app .                   note: native window via Electron
engcode build windows . --out dist/windows
engcode build mac . --out dist/mac
engcode build linux . --out dist/linux
```

`build web` writes `index.html`, `styles.css`, `app.js`, `runtime.js`, and copied assets. The output is a self-contained static site with a content security policy and no external framework. Upload it to any static host, or open `index.html` directly.

See [styling.md](styling.md) for colour, type, motion, and responsive rules, and [security.md](security.md) for the capability model.
