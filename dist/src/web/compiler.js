import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Diagnostic } from "../diagnostics.js";
const ELEMENT_CLASS = {
    row: "eng-row",
    column: "eng-column",
    grid: "eng-grid",
    card: "eng-card",
    section: "eng-section",
    text: "eng-text",
    menu: "eng-menu",
    "navigation bar": "eng-navbar",
    footer: "eng-footer",
    form: "eng-form",
    popup: "eng-popup",
    tabs: "eng-tabs",
    tab: "eng-tab",
    icon: "eng-icon",
    list: "eng-list",
    table: "eng-table",
    canvas: "eng-canvas",
    button: "eng-button",
    link: "eng-link",
    divider: "eng-divider",
};
const KIND_SELECTORS = {
    everything: "body",
    button: "button",
    buttons: "button",
    heading: "h1, h2, h3, h4, h5, h6",
    headings: "h1, h2, h3, h4, h5, h6",
    text: ".eng-text",
    texts: ".eng-text",
    paragraph: "p",
    paragraphs: "p",
    row: ".eng-row",
    rows: ".eng-row",
    column: ".eng-column",
    columns: ".eng-column",
    grid: ".eng-grid",
    grids: ".eng-grid",
    card: ".eng-card",
    cards: ".eng-card",
    section: ".eng-section",
    sections: ".eng-section",
    input: "input, textarea, select",
    inputs: "input, textarea, select",
    "text area": "textarea",
    dropdown: "select",
    checkbox: 'input[type="checkbox"]',
    switch: 'input[role="switch"]',
    "radio choice": 'input[type="radio"]',
    slider: 'input[type="range"]',
    link: "a",
    links: "a",
    list: "ul, ol",
    lists: "ul, ol",
    table: "table",
    tables: "table",
    canvas: "canvas",
    image: "img",
    images: "img",
    video: "video",
    videos: "video",
    audio: "audio",
    popup: "dialog",
    form: ".eng-form",
    tabs: ".eng-tabs",
    tab: ".eng-tab",
    icon: ".eng-icon",
    divider: ".eng-divider",
    "navigation bar": ".eng-navbar",
    "navigation": ".eng-navbar",
    menu: ".eng-menu",
    footer: ".eng-footer",
};
const COLOR_NAMES = {
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    silver: "#c0c0c0",
    red: "#ff0000",
    maroon: "#800000",
    orange: "#ffa500",
    amber: "#ffbf00",
    yellow: "#ffff00",
    olive: "#808000",
    lime: "#00ff00",
    green: "#008000",
    teal: "#008080",
    blue: "#0000ff",
    navy: "#000080",
    purple: "#800080",
    violet: "#ee82ee",
    indigo: "#4b0082",
    pink: "#ffc0cb",
    brown: "#a52a2a",
    gold: "#ffd700",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    turquoise: "#40e0d0",
    salmon: "#fa8072",
    coral: "#ff7f50",
    beige: "#f5f5dc",
    ivory: "#fffff0",
    khaki: "#f0e68c",
    lavender: "#e6e6fa",
    plum: "#dda0dd",
    crimson: "#dc143c",
    aqua: "#00ffff",
    "light gray": "#d3d3d3",
    "light grey": "#d3d3d3",
    "dark gray": "#a9a9a9",
    "dark grey": "#a9a9a9",
    "dark blue": "#00008b",
    "light blue": "#add8e6",
    "dark green": "#006400",
    "light green": "#90ee90",
    "dark red": "#8b0000",
    "dark orange": "#ff8c00",
    "sky blue": "#87ceeb",
    "royal blue": "#4169e1",
    "forest green": "#228b22",
    "midnight blue": "#191970",
    "hot pink": "#ff69b4",
    "rebeccapurple": "#663399",
    "alice blue": "#f0f8ff",
    "antique white": "#faebd7",
    "aquamarine": "#7fffd4",
    "azure": "#f0ffff",
    "blue violet": "#8a2be2",
    "burly wood": "#deb887",
    "cadet blue": "#5f9ea0",
    "chartreuse": "#7fff00",
    "chocolate": "#d2691e",
    "cornflower blue": "#6495ed",
    "cornsilk": "#fff8dc",
    "dark cyan": "#008b8b",
    "dark magenta": "#8b008b",
    "dark orchid": "#9932cc",
    "dark salmon": "#e9967a",
    "dark slate gray": "#2f4f4f",
    "dark turquoise": "#00ced1",
    "dark violet": "#9400d3",
    "deep pink": "#ff1493",
    "deep sky blue": "#00bfff",
    "dim gray": "#696969",
    "dodger blue": "#1e90ff",
    "fire brick": "#b22222",
    "floral white": "#fffaf0",
    "gainsboro": "#dcdcdc",
    "ghost white": "#f8f8ff",
    "goldenrod": "#daa520",
    "green yellow": "#adff2f",
    "honeydew": "#f0fff0",
    "indian red": "#cd5c5c",
    "lavender blush": "#fff0f5",
    "lawn green": "#7cfc00",
    "lemon chiffon": "#fffacd",
    "light coral": "#f08080",
    "light cyan": "#e0ffff",
    "light goldenrod": "#fafad2",
    "light pink": "#ffb6c1",
    "light salmon": "#ffa07a",
    "light sea green": "#20b2aa",
    "light sky blue": "#87cefa",
    "light slate gray": "#778899",
    "light steel blue": "#b0c4de",
    "light yellow": "#ffffe0",
    "lime green": "#32cd32",
    "linen": "#faf0e6",
    "medium blue": "#0000cd",
    "medium orchid": "#ba55d3",
    "medium purple": "#9370db",
    "medium sea green": "#3cb371",
    "medium slate blue": "#7b68ee",
    "medium spring green": "#00fa9a",
    "medium turquoise": "#48d1cc",
    "medium violet red": "#c71585",
    "mint cream": "#f5fffa",
    "misty rose": "#ffe4e1",
    "moccasin": "#ffe4b5",
    "navajo white": "#ffdead",
    "old lace": "#fdf5e6",
    "olive drab": "#6b8e23",
    "orange red": "#ff4500",
    "orchid": "#da70d6",
    "pale goldenrod": "#eee8aa",
    "pale green": "#98fb98",
    "pale turquoise": "#afeeee",
    "pale violet red": "#db7093",
    "papaya whip": "#ffefd5",
    "peach puff": "#ffdab9",
    "peru": "#cd853f",
    "powder blue": "#b0e0e6",
    "rosy brown": "#bc8f8f",
    "saddle brown": "#8b4513",
    "sandy brown": "#f4a460",
    "sea green": "#2e8b57",
    "seashell": "#fff5ee",
    "sienna": "#a0522d",
    "slate blue": "#6a5acd",
    "slate gray": "#708090",
    "snow": "#fffafa",
    "spring green": "#00ff7f",
    "steel blue": "#4682b4",
    "tan": "#d2b48c",
    "thistle": "#d8bfd8",
    "tomato": "#ff6347",
    "wheat": "#f5deb3",
    "white smoke": "#f5f5f5",
    "yellow green": "#9acd32",
};
/** Friendly font names that expand to readable stacks. */
const FONT_STACKS = {
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    modern: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    sans: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    classic: 'Georgia, "Times New Roman", Times, serif',
    mono: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
    code: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
    rounded: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    friendly: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    windows: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif',
    "windows display": '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
    display: 'Impact, "Arial Black", "Segoe UI Black", sans-serif',
    handwriting: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive',
};
/** Common shadow names, so "shadow is soft" stays readable English. */
const SHADOWS = {
    soft: "0 2px 8px rgba(15, 23, 42, 0.08)",
    medium: "0 8px 24px rgba(15, 23, 42, 0.16)",
    strong: "0 18px 50px rgba(15, 23, 42, 0.28)",
    glow: "0 0 24px rgba(37, 99, 235, 0.45)",
};
/** Theme role names that always map to a CSS custom property. */
const THEME_VARIABLES = {
    background: "--eng-bg",
    text: "--eng-fg",
    "text color": "--eng-fg",
    accent: "--eng-accent",
    surface: "--eng-surface",
    muted: "--eng-muted",
    "muted text": "--eng-muted",
    border: "--eng-border",
    success: "--eng-success",
    warning: "--eng-warning",
    danger: "--eng-danger",
    font: "--eng-font",
    "body font": "--eng-font",
    "heading font": "--eng-heading-font",
    "corner radius": "--eng-radius",
    "rounded corners": "--eng-radius",
    shadow: "--eng-shadow",
};
function themeVariable(role) {
    return THEME_VARIABLES[role] ?? `--eng-${slug(role)}`;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function escapeAttribute(text) {
    return escapeHtml(text).replace(/`/g, "&#96;");
}
function literal(expression) {
    if (!expression)
        return undefined;
    switch (expression.kind) {
        case "text":
        case "number":
            return String(expression.value);
        case "boolean":
            return expression.value ? "yes" : "no";
        case "nothing":
            return "nothing";
        default:
            return undefined;
    }
}
function literalNumber(expression, fallback) {
    if (expression?.kind === "number")
        return expression.value;
    const text = literal(expression);
    if (text !== undefined && text.trim() !== "" && !Number.isNaN(Number(text)))
        return Number(text);
    return fallback;
}
function slug(name) {
    return (name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "home");
}
function findApp(program) {
    return program.body.find((statement) => statement.kind === "app");
}
function collectStyles(program) {
    return program.body.filter((statement) => statement.kind === "style");
}
function collectThemes(program) {
    return program.body.filter((statement) => statement.kind === "theme");
}
function assignUids(pages) {
    let counter = 0;
    const visit = (nodes) => {
        for (const node of nodes) {
            counter += 1;
            node.uid = `eng-${counter}`;
            visit(node.children);
        }
    };
    for (const page of pages)
        visit(page.body);
}
function collectAssets(app, program, root, diagnostics) {
    const copies = [];
    const seen = new Set();
    const resolve = (expression) => {
        if (expression.kind !== "text")
            return;
        const source = String(expression.value);
        if (source.length === 0)
            return;
        if (/^(https?:|data:|blob:)/i.test(source))
            return;
        const absolute = path.resolve(root, source);
        const relative = path.relative(root, absolute);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            diagnostics.push(new Diagnostic(`The asset "${source}" is outside the project folder.`, undefined, "Keep images, sounds, and videos inside the folder that holds the app."));
            return;
        }
        if (!fs.existsSync(absolute)) {
            diagnostics.push(new Diagnostic(`I could not find the asset "${source}".`, undefined, `Put "${source}" next to the app file, or change the path.`));
            return;
        }
        const target = `assets/${path.basename(source).replace(/[^A-Za-z0-9._-]/g, "-")}`;
        if (!seen.has(target)) {
            seen.add(target);
            copies.push({ from: absolute, to: target });
        }
        expression.value = target;
    };
    const visit = (nodes) => {
        for (const node of nodes) {
            if ((node.element === "image" || node.element === "video" || node.element === "audio") &&
                node.label) {
                resolve(node.label);
            }
            if (node.element === "video" && node.poster)
                resolve(node.poster);
            visit(node.children);
        }
    };
    for (const page of app.pages)
        visit(page.body);
    const scanStatements = (statements) => {
        for (const statement of statements) {
            const item = statement;
            if (item.kind === "play-sound" && item.path)
                resolve(item.path);
            if (item.kind === "draw" && item.shape === "image" && item.path)
                resolve(item.path);
            if ((item.kind === "when" || item.kind === "every") && item.body)
                scanStatements(item.body);
            if (item.kind === "if") {
                for (const part of item.branches ?? [])
                    scanStatements(part.body);
                if (item.otherwise)
                    scanStatements(item.otherwise);
            }
            if (item.kind === "try" && item.body) {
                scanStatements(item.body);
                if (item.handler)
                    scanStatements(item.handler);
            }
        }
    };
    scanStatements(program.body);
    return copies;
}
export function compileWeb(program, options) {
    const diagnostics = [];
    const warnings = [];
    const app = findApp(program);
    if (!app) {
        diagnostics.push(new Diagnostic('This file has no app. Add app "My App": with a page inside.', undefined, "Websites and apps start with an app block."));
        return {
            html: "",
            css: "",
            js: "",
            runtime: "",
            assets: [],
            appName: "",
            definition: { name: "", body: [], pages: [] },
            diagnostics,
            warnings,
        };
    }
    assignUids(app.pages);
    const styles = collectStyles(program);
    const themes = collectThemes(program);
    const assets = collectAssets(app, program, options.root, diagnostics);
    const css = renderCss(styles, themes, warnings, options.minify ?? false);
    const body = renderPages(app);
    const title = escapeHtml(app.name);
    const liveReload = options.liveReload
        ? '<script type="module" src="__engcode/livereload.js"></script>'
        : "";
    const html = [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data: https:; media-src \'self\' https:; connect-src \'self\' https:;">',
        `<title>${title}</title>`,
        '<link rel="stylesheet" href="styles.css">',
        "</head>",
        "<body>",
        '<a class="eng-skip" href="#eng-main">Skip to content</a>',
        '<div id="eng-app">',
        '<main id="eng-main">',
        body,
        "</main>",
        "</div>",
        '<script type="module" src="app.js"></script>',
        liveReload,
        "</body>",
        "</html>",
        "",
    ].join("\n");
    const definition = {
        name: app.name,
        body: program.body,
        pages: app.pages,
    };
    const serialized = JSON.stringify(definition, (key, value) => {
        if (key === "token" || key === "span" || key === "file")
            return undefined;
        return value;
    });
    const allowedHosts = (options.allowedHosts ?? []).map((host) => host.toLowerCase());
    const js = [
        'import { startApp } from "./runtime.js";',
        `const definition = ${serialized};`,
        `startApp(definition, { allowedHosts: ${JSON.stringify(allowedHosts)} });`,
        "",
    ].join("\n");
    const runtimePath = fileURLToPath(new URL("../../runtime/web-runtime.js", import.meta.url));
    let runtime = "";
    try {
        runtime = fs.readFileSync(runtimePath, "utf8");
    }
    catch {
        diagnostics.push(new Diagnostic("I could not find the browser runtime. Build EngCode again.", undefined));
    }
    return {
        html: options.minify ? minifyHtml(html) : html,
        css,
        js,
        runtime,
        assets,
        appName: app.name,
        definition,
        diagnostics,
        warnings,
    };
}
// --------------------------------------------------------------------- markup
function nodeAttributes(node) {
    const parts = [`data-eng-node="${node.uid ?? ""}"`];
    if (node.id) {
        parts.push(`data-eng-id="${escapeAttribute(node.id)}"`);
        if (/^[A-Za-z0-9_-]+$/.test(node.id))
            parts.push(`id="${escapeAttribute(node.id)}"`);
    }
    const className = ELEMENT_CLASS[node.element];
    if (className)
        parts.push(`class="${className}"`);
    return parts.join(" ");
}
function renderLabel(node) {
    return escapeHtml(literal(node.label) ?? "");
}
function inputLabel(node) {
    return (literal(node.label) ??
        node.id ??
        literal(node.hint) ??
        "Input");
}
function renderPages(app) {
    return app.pages
        .map((page, index) => {
        const pageSlug = slug(page.name);
        const hidden = index === 0 ? "" : " hidden";
        return [
            `<section class="eng-page" data-page="${pageSlug}" id="page-${pageSlug}" aria-label="${escapeAttribute(page.name)}"${hidden}>`,
            page.body.map((node) => renderNode(node)).join("\n"),
            "</section>",
        ].join("\n");
    })
        .join("\n");
}
function sizeAttributes(node) {
    const parts = [];
    if (node.width) {
        const width = literalNumber(node.width, Number.NaN);
        if (Number.isFinite(width))
            parts.push(`width="${width}"`);
    }
    if (node.height) {
        const height = literalNumber(node.height, Number.NaN);
        if (Number.isFinite(height))
            parts.push(`height="${height}"`);
    }
    return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}
function renderNode(node) {
    const attrs = nodeAttributes(node);
    const children = node.children.map((child) => renderNode(child)).join("\n");
    const label = renderLabel(node);
    switch (node.element) {
        case "section":
        case "row":
        case "column":
        case "grid":
        case "card":
            return `<div ${attrs}>${node.label ? `<p class="eng-label">${label}</p>` : ""}${children}</div>`;
        case "heading": {
            const level = Math.min(6, Math.max(1, node.level ?? 1));
            return `<h${level} ${attrs}>${label}</h${level}>`;
        }
        case "paragraph":
            return `<p ${attrs}>${label}</p>`;
        case "text":
            return `<span ${attrs}>${label}</span>`;
        case "button": {
            const type = node.submits ? "submit" : "button";
            return `<button type="${type}" ${attrs}>${label}</button>`;
        }
        case "link": {
            const href = literal(node.linkTo) ?? "#";
            return `<a href="${escapeAttribute(href)}" ${attrs}>${label}</a>`;
        }
        case "image": {
            const source = literal(node.label) ?? "";
            const description = literal(node.description) ?? "";
            const size = sizeAttributes(node);
            return `<img src="${escapeAttribute(source)}" alt="${escapeAttribute(description)}" loading="lazy" decoding="async"${size} ${attrs}>`;
        }
        case "video": {
            const source = literal(node.label) ?? "";
            const description = literal(node.description);
            const poster = literal(node.poster);
            const loop = node.loop ? " loop" : "";
            const label = description ?? node.id ?? "Video";
            const posterAttribute = poster ? ` poster="${escapeAttribute(poster)}"` : "";
            const fallback = description ?? "Your browser cannot play this video.";
            return `<video src="${escapeAttribute(source)}" controls preload="metadata" playsinline${loop}${posterAttribute}${sizeAttributes(node)} ${attrs} aria-label="${escapeAttribute(label)}">${escapeHtml(fallback)}</video>`;
        }
        case "audio": {
            const source = literal(node.label) ?? "";
            const description = literal(node.description);
            const loop = node.loop ? " loop" : "";
            const label = description ?? node.id ?? "Audio";
            const fallback = description ?? "Your browser cannot play this audio.";
            return `<audio src="${escapeAttribute(source)}" controls preload="metadata"${loop} ${attrs} aria-label="${escapeAttribute(label)}">${escapeHtml(fallback)}</audio>`;
        }
        case "input": {
            const hint = literal(node.hint) ?? "";
            const required = node.required ? " required" : "";
            return [
                '<div class="eng-field">',
                `<label for="${node.uid}">${escapeHtml(inputLabel(node))}</label>`,
                `<input id="${node.uid}" type="text" placeholder="${escapeAttribute(hint)}"${required} ${attrs}>`,
                "</div>",
            ].join("");
        }
        case "text area": {
            const hint = literal(node.hint) ?? "";
            const required = node.required ? " required" : "";
            return [
                '<div class="eng-field">',
                `<label for="${node.uid}">${escapeHtml(inputLabel(node))}</label>`,
                `<textarea id="${node.uid}" placeholder="${escapeAttribute(hint)}"${required} ${attrs}></textarea>`,
                "</div>",
            ].join("");
        }
        case "checkbox":
        case "switch": {
            const role = node.element === "switch" ? ' role="switch"' : "";
            return `<label class="eng-check"><input type="checkbox"${role} ${attrs}> <span class="eng-check-label">${label}</span></label>`;
        }
        case "dropdown": {
            const options = node.choices
                .map((choice) => literal(choice))
                .filter((choice) => choice !== undefined)
                .map((choice) => `<option value="${escapeAttribute(choice)}">${escapeHtml(choice)}</option>`)
                .join("");
            const required = node.required ? " required" : "";
            return [
                '<div class="eng-field">',
                `<label for="${node.uid}">${escapeHtml(inputLabel(node))}</label>`,
                `<select id="${node.uid}"${required} ${attrs}>${options}</select>`,
                "</div>",
            ].join("");
        }
        case "radio choice": {
            const name = node.id ?? node.uid ?? "choice";
            return `<label class="eng-check"><input type="radio" name="${escapeAttribute(name)}" ${attrs}> <span class="eng-check-label">${label}</span></label>`;
        }
        case "slider": {
            const minimum = literalNumber(node.minimum, 0);
            const maximum = literalNumber(node.maximum, 100);
            const starting = literalNumber(node.starting, minimum);
            return [
                '<div class="eng-field">',
                `<label for="${node.uid}">${escapeHtml(inputLabel(node))}</label>`,
                `<input id="${node.uid}" type="range" min="${minimum}" max="${maximum}" value="${starting}" ${attrs}>`,
                "</div>",
            ].join("");
        }
        case "list":
            return `<ul ${attrs}></ul>`;
        case "table": {
            const caption = node.id ?? "Table";
            const columns = node.columns
                .map((column) => literal(column))
                .filter((column) => column !== undefined);
            const head = `<thead><tr>${columns
                .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
                .join("")}</tr></thead>`;
            return `<table ${attrs}><caption>${escapeHtml(caption)}</caption>${head}<tbody></tbody></table>`;
        }
        case "menu":
            return `<nav ${attrs}><ul>${children}</ul></nav>`;
        case "navigation bar":
            return `<nav ${attrs}>${children}</nav>`;
        case "footer":
            return `<footer ${attrs}>${children}</footer>`;
        case "form":
            return `<form ${attrs}>${children}</form>`;
        case "popup":
            return `<dialog ${attrs} aria-label="${escapeAttribute(node.id ?? "Popup")}">${children}</dialog>`;
        case "tabs":
            return `<div ${attrs} role="tablist">${children}</div>`;
        case "tab":
            return `<section ${attrs} role="tabpanel" aria-label="${escapeAttribute(literal(node.label) ?? "Tab")}">${children}</section>`;
        case "icon":
            return `<span ${attrs} aria-hidden="true">${label}</span>`;
        case "divider":
            return `<hr ${attrs}>`;
        case "canvas": {
            const width = literalNumber(node.width, 800);
            const height = literalNumber(node.height, 500);
            return [
                `<canvas width="${width}" height="${height}" aria-label="${escapeAttribute(node.id ?? "Game canvas")}" ${attrs}>`,
                "This game is drawn on a canvas. Use the keyboard controls described on this page.",
                "</canvas>",
            ].join("");
        }
        default:
            return `<div ${attrs}>${children}</div>`;
    }
}
function minifyHtml(html) {
    return html.replace(/\n\s*/g, "\n").replace(/>\n</g, "><");
}
// ------------------------------------------------------------------------ css
function cssColor(value, roles) {
    const lower = value.trim().toLowerCase();
    if (roles?.has(lower))
        return `var(${themeVariable(lower)})`;
    if (COLOR_NAMES[lower])
        return COLOR_NAMES[lower];
    if (/^#[0-9a-f]{3}$/i.test(lower) || /^#[0-9a-f]{6}$/i.test(lower))
        return lower;
    if (/^(rgb|rgba|hsl|hsla)\(/i.test(lower))
        return lower;
    if (lower === "transparent")
        return "transparent";
    if (/^[a-z ]+$/.test(lower))
        return lower.replace(/\s+/g, "");
    return lower;
}
function colorCssText(text, roles) {
    const lower = text.trim().toLowerCase();
    if (roles?.has(lower))
        return `var(${themeVariable(lower)})`;
    return cssColor(lower, roles);
}
function roleCss(value, roles) {
    if (value.type !== "text" && value.type !== "keyword")
        return undefined;
    const lower = value.value.trim().toLowerCase();
    return roles?.has(lower) ? `var(${themeVariable(lower)})` : undefined;
}
function px(value, roles) {
    const role = roleCss(value, roles);
    if (role)
        return role;
    switch (value.type) {
        case "number":
            return `${value.value}px`;
        case "percent":
            return `${value.value}%`;
        case "color":
            return cssColor(value.value, roles);
        case "keyword":
            switch (value.value) {
                case "full":
                    return "100%";
                case "half":
                    return "50%";
                default:
                    return value.value;
            }
        case "text":
            return value.value;
    }
}
function unitless(value, roles) {
    if (value.type === "number")
        return String(value.value);
    return px(value, roles);
}
function keywordCss(value, roles) {
    return px(value, roles).trim().toLowerCase().replace(/\s+/g, "-");
}
function fontFamily(value, roles) {
    const css = px(value, roles).trim();
    if (css.startsWith("var("))
        return css;
    return FONT_STACKS[css.toLowerCase()] ?? css;
}
function fontWeight(value, roles) {
    if (value.type === "number")
        return String(value.value);
    const raw = px(value, roles).trim().toLowerCase().replace(/-/g, " ");
    const weights = {
        thin: "100",
        "extra light": "200",
        light: "300",
        normal: "400",
        regular: "400",
        medium: "500",
        "semi bold": "600",
        semibold: "600",
        bold: "700",
        "extra bold": "800",
        black: "900",
    };
    return weights[raw] ?? raw;
}
function borderCss(value, roles) {
    if (value.type === "number")
        return `${value.value}px solid currentColor`;
    const role = roleCss(value, roles);
    if (role)
        return `1px solid ${role}`;
    const text = String(value.type === "color" ? cssColor(value.value, roles) : value.value);
    const match = text.match(/^\s*([\d.]+)(?:px)?\s*(solid|dashed|dotted|none)?\s*(.*)$/i);
    if (!match)
        return text;
    const width = `${match[1]}px`;
    const style = match[2] ?? "solid";
    const color = match[3]?.trim();
    return [width, style, color ? colorCssText(color, roles) : "currentColor"].join(" ");
}
function shadowCss(value, roles) {
    if (value.type === "text" || value.type === "keyword") {
        const named = SHADOWS[value.value.trim().toLowerCase()];
        if (named)
            return named;
    }
    return px(value, roles);
}
function durationCss(value, roles) {
    const text = px(value, roles);
    const match = text.match(/([\d.]+)\s*(seconds?|secs?|s|milliseconds?|ms)\b/i);
    if (!match)
        return undefined;
    const amount = Number(match[1]);
    const unit = /ms|milli/i.test(match[2]) ? "ms" : "s";
    return `${amount}${unit}`;
}
function transitionCss(value, roles) {
    const text = px(value, roles).trim().toLowerCase();
    if (text === "none")
        return "none";
    const duration = durationCss(value, roles);
    if (!duration)
        return text;
    const rest = text
        .replace(/([\d.]+)\s*(seconds?|secs?|s|milliseconds?|ms)\b/i, "")
        .replace(/\b(ease in out|ease in|ease out|ease|linear)\b/g, "")
        .trim();
    const propertyMap = {
        background: "background-color",
        "text color": "color",
        size: "width, height",
        all: "all",
    };
    const property = rest.length > 0 ? propertyMap[rest] ?? rest : "all";
    return `${property} ${duration} ease`;
}
const ANIMATION_NAMES = {
    "fade in": "eng-fade-in",
    "fade out": "eng-fade-out",
    "slide in": "eng-slide-in",
    "slide up": "eng-slide-up",
    "slide down": "eng-slide-down",
    "slide left": "eng-slide-left",
    "slide right": "eng-slide-right",
    pop: "eng-pop",
    float: "eng-float",
    pulse: "eng-pulse",
    spin: "eng-spin",
    bounce: "eng-bounce",
    shake: "eng-shake",
    glow: "eng-glow",
};
function animationCss(value, roles) {
    const text = px(value, roles).trim().toLowerCase();
    if (text === "none")
        return "none";
    const duration = durationCss(value, roles) ?? "0.6s";
    const infinite = /\b(forever|infinite|repeat)\b/.test(text);
    const rest = text
        .replace(/([\d.]+)\s*(seconds?|secs?|s|milliseconds?|ms)\b/i, "")
        .replace(/\b(over|for|forever|infinite|repeat)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const name = ANIMATION_NAMES[rest] ?? (rest.length > 0 ? rest : "eng-fade-in");
    return `${name} ${duration} ease ${infinite ? "infinite" : "both"}`;
}
function declarationToCss(declaration, roles) {
    const value = declaration.value;
    switch (declaration.property) {
        case "background":
            return ["background-color", px(value, roles)];
        case "text color":
            return ["color", px(value, roles)];
        case "font":
            return ["font-family", fontFamily(value, roles)];
        case "font size":
            return ["font-size", px(value, roles)];
        case "font weight":
            return ["font-weight", fontWeight(value, roles)];
        case "font style":
            return ["font-style", keywordCss(value, roles)];
        case "line height":
            return ["line-height", unitless(value, roles)];
        case "letter spacing":
            return ["letter-spacing", px(value, roles)];
        case "text decoration":
            return ["text-decoration", keywordCss(value, roles)];
        case "text transform":
            return ["text-transform", keywordCss(value, roles)];
        case "text shadow":
            return ["text-shadow", shadowCss(value, roles)];
        case "width":
            return ["width", px(value, roles)];
        case "height":
            return ["height", px(value, roles)];
        case "min width":
            return ["min-width", px(value, roles)];
        case "max width":
            return ["max-width", px(value, roles)];
        case "min height":
            return ["min-height", px(value, roles)];
        case "max height":
            return ["max-height", px(value, roles)];
        case "padding":
            return ["padding", px(value, roles)];
        case "margin":
            return ["margin", px(value, roles)];
        case "gap":
            return ["gap", px(value, roles)];
        case "rounded corners":
        case "border radius":
            return ["border-radius", px(value, roles)];
        case "border":
            return ["border", borderCss(value, roles)];
        case "border width":
            return ["border-width", px(value, roles)];
        case "border color":
            return ["border-color", px(value, roles)];
        case "border style":
            return ["border-style", keywordCss(value, roles)];
        case "shadow":
            return ["box-shadow", shadowCss(value, roles)];
        case "alignment":
            return ["text-align", keywordCss(value, roles)];
        case "layout": {
            if (value.type === "keyword" && value.value === "row")
                return ["display", "flex"];
            if (value.type === "keyword" && value.value === "column")
                return ["display", "flex"];
            if (value.type === "keyword" && value.value === "grid")
                return ["display", "grid"];
            return ["display", px(value, roles)];
        }
        case "direction":
            return ["flex-direction", keywordCss(value, roles)];
        case "wrap":
            return ["flex-wrap", keywordCss(value, roles)];
        case "align items":
            return ["align-items", keywordCss(value, roles)];
        case "justify content":
            return ["justify-content", keywordCss(value, roles)];
        case "flex grow":
            return ["flex-grow", unitless(value, roles)];
        case "flex shrink":
            return ["flex-shrink", unitless(value, roles)];
        case "grid columns": {
            if (value.type === "number") {
                return ["grid-template-columns", `repeat(${value.value}, minmax(0, 1fr))`];
            }
            return ["grid-template-columns", px(value, roles)];
        }
        case "object fit":
            return ["object-fit", keywordCss(value, roles)];
        case "object position":
            return ["object-position", keywordCss(value, roles)];
        case "background size":
            return ["background-size", keywordCss(value, roles)];
        case "background position":
            return ["background-position", keywordCss(value, roles)];
        case "background repeat":
            return ["background-repeat", keywordCss(value, roles)];
        case "overflow":
            return ["overflow", keywordCss(value, roles)];
        case "position":
            return ["position", keywordCss(value, roles)];
        case "top":
            return ["top", px(value, roles)];
        case "right":
            return ["right", px(value, roles)];
        case "bottom":
            return ["bottom", px(value, roles)];
        case "left":
            return ["left", px(value, roles)];
        case "z index":
            return ["z-index", unitless(value, roles)];
        case "cursor":
            return ["cursor", keywordCss(value, roles)];
        case "opacity":
            return ["opacity", unitless(value, roles)];
        case "transition":
            return ["transition", transitionCss(value, roles)];
        case "animation":
            return ["animation", animationCss(value, roles)];
        case "animation delay":
            return ["animation-delay", durationCss(value, roles) ?? px(value, roles)];
        default:
            return undefined;
    }
}
function styleSelector(style) {
    if (style.targetType === "id")
        return `[data-eng-id="${style.target.replace(/"/g, '\\"')}"]`;
    if (style.targetType === "everything")
        return "body";
    return KIND_SELECTORS[style.target.toLowerCase()] ?? `.eng-${slug(style.target)}`;
}
/** Applies a pseudo-class or prefix to every selector in a comma list. */
function eachSelector(selector, transform) {
    return selector
        .split(",")
        .map((one) => transform(one.trim()))
        .join(", ");
}
function stateSuffix(state) {
    const lower = state.toLowerCase();
    if (lower.includes("over") || lower.includes("hover"))
        return ":hover";
    if (lower.includes("pressed") || lower.includes("active"))
        return ":active";
    if (lower.includes("focus"))
        return ":focus-visible";
    if (lower.includes("visited"))
        return ":visited";
    return "";
}
function mediaQuery(media) {
    if (!media)
        return undefined;
    const lower = media.toLowerCase();
    if (lower === "small screens")
        return "(max-width: 639px)";
    if (lower === "big screens")
        return "(min-width: 1024px)";
    if (lower === "phones" || lower === "phone")
        return "(max-width: 479px)";
    if (lower === "tablets" || lower === "tablet")
        return "(min-width: 480px) and (max-width: 1023px)";
    return undefined;
}
function renderThemeCss(themes) {
    if (themes.length === 0)
        return "";
    const light = [];
    const dark = [];
    for (const theme of themes) {
        const target = theme.dark ? dark : light;
        for (const declaration of theme.declarations) {
            const variable = themeVariable(declaration.property);
            target.push(`  ${variable}: ${themeValue(declaration.property, declaration.value)};`);
        }
    }
    const chunks = [];
    if (light.length > 0)
        chunks.push(`:root {\n${light.join("\n")}\n}`);
    if (dark.length > 0) {
        chunks.push(`[data-theme="dark"] {\n${dark.join("\n")}\n}`);
        chunks.push(`@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark
            .map((line) => `  ${line}`)
            .join("\n")}\n  }\n}`);
    }
    return chunks.join("\n\n");
}
function themeValue(property, value) {
    if (property === "font" || property === "body font" || property === "heading font") {
        return fontFamily(value);
    }
    if (property === "shadow")
        return shadowCss(value);
    if (property === "corner radius" || property === "rounded corners")
        return px(value);
    if (value.type === "color")
        return cssColor(value.value);
    if (value.type === "text") {
        const text = value.value.trim();
        if (/^(#|rgb|hsl)/i.test(text) || COLOR_NAMES[text.toLowerCase()])
            return cssColor(text);
        return text;
    }
    return px(value);
}
function collectThemeRoles(themes) {
    const roles = new Set(Object.keys(THEME_VARIABLES));
    for (const theme of themes) {
        for (const declaration of theme.declarations)
            roles.add(declaration.property);
    }
    return roles;
}
function renderCss(styles, themes, warnings, minify) {
    const roles = collectThemeRoles(themes);
    const themeCss = renderThemeCss(themes);
    const chunks = themeCss.length > 0 ? [BASE_CSS, themeCss] : [BASE_CSS];
    for (const style of styles) {
        const selector = styleSelector(style);
        const media = mediaQuery(style.media);
        // A media-scoped style only applies inside its query; it must never leak
        // into the base stylesheet.
        const wrapMedia = (css) => media ? `@media ${media} {\n${css.replace(/^/gm, "  ")}\n}` : css;
        const declarations = style.declarations
            .map((declaration) => declarationToCss(declaration, roles))
            .filter((pair) => pair !== undefined);
        const rules = declarations.map(([property, value]) => `  ${property}: ${value};`);
        if (rules.length > 0)
            chunks.push(wrapMedia(`${selector} {\n${rules.join("\n")}\n}`));
        for (const state of style.states) {
            const suffix = stateSuffix(state.state);
            if (!suffix && state.state.length > 0)
                continue;
            const stateRules = state.declarations
                .map((declaration) => declarationToCss(declaration, roles))
                .filter((pair) => pair !== undefined)
                .map(([property, value]) => `  ${property}: ${value};`);
            if (stateRules.length > 0) {
                const stateSelector = eachSelector(selector, (one) => `${one}${suffix}`);
                chunks.push(wrapMedia(`${stateSelector} {\n${stateRules.join("\n")}\n}`));
            }
        }
        const darkRules = declarations.map(([property, value]) => `  ${property}: ${value};`).join("\n");
        if (style.dark && darkRules.length > 0) {
            const prefers = media ? `${media} and (prefers-color-scheme: dark)` : "(prefers-color-scheme: dark)";
            const prefersSelector = eachSelector(selector, (one) => `:root:not([data-theme="light"]) ${one}`);
            chunks.push(`@media ${prefers} {\n  ${prefersSelector} {\n${darkRules.replace(/^/gm, "  ")}\n  }\n}`);
            const darkSelector = eachSelector(selector, (one) => `[data-theme="dark"] ${one}`);
            chunks.push(wrapMedia(`${darkSelector} {\n${darkRules}\n}`));
        }
        checkContrast(style, warnings);
    }
    const output = chunks.join("\n\n");
    if (!minify)
        return output;
    return output.replace(/\s+/g, " ").replace(/\s*([{};:,])\s*/g, "$1").trim();
}
function colorToRgb(color) {
    const value = cssColor(color);
    if (value.startsWith("#")) {
        const hex = value.slice(1);
        if (hex.length === 3) {
            return [
                Number.parseInt(hex[0] + hex[0], 16),
                Number.parseInt(hex[1] + hex[1], 16),
                Number.parseInt(hex[2] + hex[2], 16),
            ];
        }
        if (hex.length === 6) {
            return [
                Number.parseInt(hex.slice(0, 2), 16),
                Number.parseInt(hex.slice(2, 4), 16),
                Number.parseInt(hex.slice(4, 6), 16),
            ];
        }
    }
    return undefined;
}
function luminance(rgb) {
    const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function checkContrast(style, warnings) {
    const background = style.declarations.find((declaration) => declaration.property === "background");
    const text = style.declarations.find((declaration) => declaration.property === "text color");
    if (!background || !text)
        return;
    if (background.value.type !== "color" && background.value.type !== "text")
        return;
    if (text.value.type !== "color" && text.value.type !== "text")
        return;
    const backgroundRgb = colorToRgb(background.value.value);
    const textRgb = colorToRgb(text.value.value);
    if (!backgroundRgb || !textRgb)
        return;
    const light = Math.max(luminance(backgroundRgb), luminance(textRgb));
    const dark = Math.min(luminance(backgroundRgb), luminance(textRgb));
    const ratio = (light + 0.05) / (dark + 0.05);
    if (ratio < 4.5) {
        warnings.push(new Diagnostic(`The text and background in this style are too close to read easily (contrast ${ratio.toFixed(1)}:1).`, undefined, "Use a darker text color or a lighter background."));
    }
}
const BASE_CSS = `:root {
  --eng-bg: #ffffff;
  --eng-fg: #1f2937;
  --eng-accent: #2563eb;
  --eng-surface: #ffffff;
  --eng-muted: #64748b;
  --eng-border: #e2e8f0;
  --eng-success: #16a34a;
  --eng-warning: #d97706;
  --eng-danger: #dc2626;
  --eng-font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --eng-heading-font: var(--eng-font);
  --eng-radius: 12px;
  --eng-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--eng-bg);
  color: var(--eng-fg);
  font-family: var(--eng-font);
  line-height: 1.55;
}
h1, h2, h3, h4, h5, h6 { font-family: var(--eng-heading-font); line-height: 1.2; }
#eng-app { max-width: 1080px; margin: 0 auto; padding: 20px; }
[hidden] { display: none !important; }
.eng-skip {
  position: absolute;
  left: -9999px;
  top: 0;
  padding: 10px 14px;
  background: var(--eng-accent);
  color: white;
  z-index: 100;
}
.eng-skip:focus { left: 12px; top: 12px; }
.eng-page { padding: 8px 0 28px; }
.eng-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.eng-column { display: flex; flex-direction: column; gap: 12px; }
.eng-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.eng-card {
  border: 1px solid var(--eng-border);
  border-radius: var(--eng-radius);
  padding: 16px;
  background: var(--eng-surface);
  box-shadow: var(--eng-shadow);
}
.eng-section { margin: 18px 0; }
.eng-text { display: inline-block; }
.eng-field { display: flex; flex-direction: column; gap: 4px; }
.eng-field label { font-weight: 600; }
img, video { max-width: 100%; height: auto; }
video, audio { display: block; }
input, textarea, select, button {
  font: inherit;
  padding: 9px 12px;
  border: 1px solid var(--eng-border);
  border-radius: 8px;
  background: var(--eng-surface);
  color: inherit;
}
textarea { min-height: 100px; resize: vertical; }
button { cursor: pointer; background: var(--eng-accent); color: white; border-color: transparent; }
button:hover { filter: brightness(0.95); }
.eng-check { display: inline-flex; align-items: center; gap: 8px; }
.eng-check input { width: auto; }
ul, ol { padding-left: 22px; }
.eng-list li { margin: 6px 0; }
.eng-list-interactive {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.eng-list-interactive li {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease;
}
.eng-list-interactive li:hover { background: color-mix(in srgb, var(--eng-fg) 7%, transparent); }
.eng-list-interactive li:active { transform: scale(0.99); }
.eng-list-interactive li[aria-current="true"] {
  background: color-mix(in srgb, var(--eng-accent) 16%, transparent);
  box-shadow: inset 3px 0 0 var(--eng-accent);
}
.eng-list-interactive li:focus-visible {
  outline: 2px solid var(--eng-accent);
  outline-offset: 2px;
}
table { border-collapse: collapse; width: 100%; }
caption { text-align: left; font-weight: 700; padding-bottom: 6px; }
th, td { border: 1px solid var(--eng-border); padding: 8px 10px; text-align: left; }
.eng-navbar, .eng-menu, .eng-footer { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
.eng-navbar a, .eng-menu a, .eng-footer a { color: var(--eng-accent); }
.eng-menu ul { display: flex; gap: 14px; list-style: none; padding: 0; margin: 0; }
.eng-divider { border: 0; border-top: 1px solid var(--eng-border); margin: 18px 0; }
.eng-icon { font-size: 1.2em; }
.eng-canvas { max-width: 100%; height: auto; background: #0f172a; border-radius: var(--eng-radius); }
.eng-popup { padding: 20px; border: 0; border-radius: var(--eng-radius); max-width: min(92vw, 560px); background: var(--eng-surface); color: var(--eng-fg); }
.eng-popup::backdrop { background: rgba(15, 23, 42, 0.55); }
.eng-label { font-weight: 700; margin: 0 0 8px; }
.eng-theme-toggle {
  position: fixed;
  right: 16px;
  top: 16px;
  z-index: 50;
  background: var(--eng-fg);
  color: var(--eng-bg);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.9rem;
}
#eng-toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 80;
  display: grid;
  gap: 8px;
  max-width: min(90vw, 380px);
}
.eng-toast {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: #111827;
  color: white;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
}
@keyframes eng-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes eng-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes eng-slide-in { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
@keyframes eng-slide-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes eng-slide-down { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: none; } }
@keyframes eng-slide-left { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes eng-slide-right { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
@keyframes eng-pop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); }
}
@keyframes eng-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes eng-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes eng-spin { to { transform: rotate(360deg); } }
@keyframes eng-bounce {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-12px); }
  60% { transform: translateY(-4px); }
}
@keyframes eng-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes eng-glow {
  0%, 100% { box-shadow: 0 0 4px var(--eng-accent); }
  50% { box-shadow: 0 0 22px var(--eng-accent); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
//# sourceMappingURL=compiler.js.map