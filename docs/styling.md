# Styling guide

EngCode styles are written in English and compile to scoped CSS. You never write a selector or a raw CSS rule. That keeps a beginner's page safe and predictable: a style can only affect the elements it names.

```eng
style everything:
    font is modern
    background is #f8fafc
    text color is #1f2937
    padding is 32
end

style "save":
    background is #2563eb
    text color is white
    rounded corners of 12
    padding is 12
end
```

## Targets

| Target | Example | Applies to |
|---|---|---|
| Everything | `style everything:` | The page body |
| An id | `style "save":` | The block with `called "save"` |
| A block kind | `style buttons:` | Every button |

Block kinds are plural: `buttons`, `headings`, `paragraphs`, `rows`, `columns`, `grids`, `cards`, `inputs`, `lists`, `tables`, `links`, `sections`, `images`, `videos`, `navigation bar`.

Ids and kinds compile to scoped selectors. Raw CSS selectors are not accepted. Theme roles are values, not style targets: write `background is accent`, not `style accent:`.

## Properties

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

Values are written as `property is value`, or `property of value` for a few properties such as `rounded corners of 12`.

```eng
style cards:
    background is white
    text color is #1f2937
    border is 1 solid #e2e8f0
    border radius is 16
    padding is 24
    margin is 12
    gap is 16
    shadow is soft
    alignment is center
end
```

## Colours

Use an English name, a hex colour, or `rgb(...)`:

```eng
background is blue
background is dark blue
background is light gray
background is #0f766e
background is #fff
background is rgb(15, 118, 110)
```

Theme roles such as `background`, `surface`, `text`, `accent`, `muted`, `border`, `success`, `warning`, and `danger` are also valid values. A value with the same name as a theme property compiles to a CSS variable, so light and dark mode stay in sync.

## Sizes

A bare number means pixels:

```eng
padding is 24
width is 320
rounded corners is 12
```

Other forms:

```eng
width is 50 percent
width is full
width is half
width is auto
height is 100vh
font size is 1.25rem
```

`rounded corners of 8` and `rounded corners is 8` are both accepted. The formatter writes `is`.

## States

```eng
style "save":
    background is #2563eb
    transition is 0.2 seconds

    when mouse is over:
        background is #1d4ed8
        shadow is medium
    end

    when pressed:
        background is #1e40af
    end

    when focused:
        border is 2 solid #93c5fd
    end
end
```

States are `when mouse is over:`, `when pressed:`, and `when focused:`.

## Responsive rules

Add a screen qualifier after the target:

```eng
style "sidebar" on small screens:
    width is full
end

style "sidebar" on big screens:
    width is 320
end

style cards on phones:
    padding is 16
end
```

| Qualifier | Width |
|---|---|
| `on phones` | under 480 px |
| `on small screens` | under 640 px |
| `on tablets` | 480 to 1023 px |
| `on big screens` | 1024 px and up |

Dark-mode rules can be written directly:

```eng
style everything in dark mode:
    background is #0f172a
    text color is #e2e8f0
end
```

Prefer a theme for anything that is reused; it keeps the light and dark versions in one place.

## Themes

A theme names colours, fonts, and spacing once. Styles then refer to the names.

```eng
theme "Day":
    accent is #2563eb
    background is #f8fafc
    surface is white
    text is #1f2937
    muted is #64748b
    border is #e2e8f0
    success is #15803d
    warning is #b45309
    danger is #b91c1c
    font is modern
    heading font is display
    corner radius is 12
    shadow is soft
end

theme "Night" in dark mode:
    accent is #60a5fa
    background is #0f172a
    surface is #1e293b
    text is #e2e8f0
    muted is #94a3b8
    border is #334155
    success is #4ade80
    warning is #fbbf24
    danger is #f87171
    shadow is strong
end

style everything:
    background is background
    text color is text
    font is font
end

style cards:
    background is surface
    border is 1 solid border
    border radius is corner radius
    shadow is shadow
end
```

Light declarations become page defaults. `in dark mode` declarations follow the visitor's system preference, and the generated theme button switches between them. Standard roles are always seeded, even when a theme declares only a few.

### Theme roles

`accent`, `background`, `surface`, `text`, `muted`, `border`, `success`, `warning`, `danger`, `font`, `heading font`, `corner radius`, `shadow`.

Each becomes a CSS custom property (`accent` → `--eng-accent`, `background` → `--eng-bg`, `text` → `--eng-fg`, and so on).

## Fonts

Friendly names expand to readable stacks:

| Name | Feeling |
|---|---|
| `system` | The operating system's default |
| `modern` | A clean interface font |
| `sans` | A simple sans-serif |
| `serif` | A book-like serif |
| `classic` | A traditional serif |
| `mono` | Fixed-width, for code |
| `code` | A programming font |
| `rounded` | Soft, friendly shapes |
| `friendly` | A warm display face |
| `windows` | Segoe UI Variable Text, for Windows 11 |
| `windows display` | Segoe UI Variable Display, for headings |
| `display` | A large heading face |
| `handwriting` | A handwritten feel |

You can also name a font directly: `font is "Georgia"`.

The `windows` and `windows display` stacks fall back to Segoe UI and then to a system font, so a Windows 11-styled desktop app still looks sensible on other systems.

## Shadows, borders, and motion

```eng
style "card":
    shadow is soft
    border is 1 solid #e2e8f0
    border radius is 16
    transition is 0.25 seconds
end

style cards:
    animation is slide up over 0.5 seconds
    animation delay is 0.1 seconds
    when mouse is over:
        animation is float over 2 seconds forever
    end
end
```

Shadows: `soft`, `medium`, `strong`, `glow`.

Animations: `fade in`, `fade out`, `slide in`, `slide up`, `slide down`, `slide left`, `slide right`, `pop`, `float`, `pulse`, `spin`, `bounce`, `shake`, `glow`. Add `forever` to repeat one.

Transitions and animations respect `prefers-reduced-motion`, so visitors who ask their system for less motion do not get non-essential animation.

## Images, video, and audio

Media is a page block, not a style rule:

```eng
image "sam.png" with description "A photo of Sam" and width 220 and height 220
video "tour.mp4" with description "A studio tour" and poster "cover.jpg" and loops and width 640
audio "hello.mp3" with description "A spoken greeting" and loops
```

Style the surrounding element by id or kind:

```eng
style images:
    border radius is 12
    object fit is cover
end

style "cover":
    width is full
    height is 320
end
```

`with description` becomes the `alt` text or accessible name. Always describe meaningful images, video, and audio.

## Accessibility

The compiler and `engcode check` help with:

- **Contrast.** The compiler warns at build time when text and background are too close, names both colours, and suggests a darker or lighter choice.
- **Focus.** Interactive elements keep a visible focus outline. Do not remove it with custom styles; if you change colours, check the focus state.
- **Motion.** `prefers-reduced-motion` turns off non-essential animation.
- **Structure.** One level-1 heading per page, and no skipped heading levels.
- **Media.** Missing descriptions are warnings.

Warnings do not fail `check` or a build. Add `--strict` in CI to make them errors.

## A complete theme example

```eng
app "Studio":
    page "Home":
        heading "A small studio"
        text "We make calm, useful software."
        button "Say hello" called "hello"
    end
end

theme "Day":
    accent is #0f766e
    background is #f8fafc
    surface is white
    text is #172036
    muted is #5b6478
    border is #d8deea
    font is modern
    heading font is display
    corner radius is 14
    shadow is soft
end

theme "Night" in dark mode:
    accent is #5eead4
    background is #0d1220
    surface is #151c2e
    text is #e9edf7
    muted is #a9b4c9
    border is #2a3550
end

style everything:
    background is background
    text color is text
    font is font
    padding is 48
end

style headings:
    font is heading font
    letter spacing is -0.02em
end

style "hello":
    background is accent
    text color is background
    border radius is corner radius
    padding is 12
    transition is 0.2 seconds

    when mouse is over:
        shadow is medium
    end
end
```

See [apps.md](apps.md) for page blocks, events, state, and building.
