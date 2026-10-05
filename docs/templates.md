# Making a custom template

A shipreel template is a folder of plain HTML and CSS. No build step, no framework. If you can style a web page, you can make a template.

## Folder structure

```
my-template/
├── template.json     # optional manifest
├── intro.html        # logo + project name + "vX is out"
├── highlight.html    # rendered once per highlight
├── fixes.html        # "+ 12 bug fixes" (skipped when there are no fixes)
├── outro.html        # call to action
├── styles.css
└── assets/…          # images or fonts referenced from styles.css (optional)
```

`template.json` (all keys optional):

```json
{
  "name": "neon",
  "description": "Dark gradient with a neon accent",
  "defaults": { "font": "Space Grotesk", "brandColor": "#f472b6" },
  "scenes": { "intro": "intro.html", "highlight": "highlight.html", "fixes": "fixes.html", "outro": "outro.html" },
  "styles": ["styles.css"]
}
```

Point your config at the folder (`"template": "./my-template"`) and run `npx shipreel preview`. Press **Reload** in the preview after every edit. Copy [`examples/custom-template`](../examples/custom-template) to get started.

## How a scene is rendered

Each scene file is an HTML fragment. shipreel wraps it in a full document:

```html
<body class="sr-landscape sr-landscape" style="--brand:#6d28d9; --brand-contrast:#fff; --font:'Inter'; --duration:2.5s; --name-chars:7; --w:1920px; --h:1080px">
  <main class="scene scene-highlight">
    <!-- your scene HTML -->
  </main>
</body>
```

Assets are served from your template folder, so `url(assets/bg.png)` in `styles.css` and `<img src="assets/x.svg">` both work. The Google Font from the config is loaded automatically.

### Rules for deterministic rendering

shipreel renders frame by frame: for each frame it **pauses every animation** (`document.getAnimations()`) and sets its `currentTime` to the frame time. So:

- ✅ Animate with **CSS animations / transitions** or the **Web Animations API** (`element.animate()` during page load).
- ✅ Times are relative to the start of the scene. Use `animation-delay` to sequence things, and `var(--duration)` to run something across the whole scene.
- ❌ Don't animate with `setTimeout`, `requestAnimationFrame`, `Date.now()` or `Math.random()`. They won't be captured consistently.
- ❌ Don't load remote images or scripts (Google Fonts is the exception). Put assets in the template folder.
- Size everything in `vmin` / `vw` / `vh` (or `%`) so one design works in landscape, square and vertical.

Scenes fade in and out automatically: the first scene doesn't fade in, and the last doesn't fade out.

## Variables

Use `{{name}}` (HTML-escaped) or `{{{name}}}` (raw, for icons and the logo data URI). Sections: `{{#name}}…{{/name}}` renders when truthy (or loops over arrays), `{{^name}}…{{/name}}` when falsy.

### All scenes

| Variable | Example | Notes |
| --- | --- | --- |
| `projectName` | `acme-ui` | |
| `monogram` | `A` | First letter, for logo placeholders |
| `version` / `versionLabel` | `2.4.0` / `v2.4.0` | |
| `date` / `dateLabel` | `2026-09-30` / `Sep 30, 2026` | Empty when unknown |
| `logo` | `data:image/svg+xml;base64,…` | Use raw: `<img src="{{{logo}}}">`, wrap in `{{#logo}}` |
| `brandColor` / `brandContrast` | `#6d28d9` / `#ffffff` | Also CSS vars `--brand`, `--brand-contrast` |
| `font` | `Inter` | Also CSS var `--font` |
| `cta` | `npm i acme-ui@latest` | |
| `ctaIsCommand` | `true` | When the CTA looks like a shell command |
| `ctaCommand` | `npm i acme-ui@latest` | CTA, or `open <url>` when it is not a command |
| `ctaSecondary` | `Star us on GitHub` | |
| `repo` / `repoLabel` | `acme/acme-ui` / `github.com/acme/acme-ui` | |
| `url` / `urlLabel` | `https://acme.dev` / `acme.dev` | |
| `footerLabel` | `github.com/acme/acme-ui` | `repoLabel`, else `urlLabel` |
| `nameSize` | `l` \| `m` \| `s` | Length class for the project name |
| `size`, `width`, `height` | `landscape`, `1920`, `1080` | |
| `orientation` | `landscape` \| `portrait` \| `square` | Also a body class: `sr-landscape` … |
| `sceneType`, `sceneSeconds` | `highlight`, `2.5` | |
| `totalHighlights` | `5` | |
| `fixCount`, `fixLabel`, `fixText`, `hasFixes` | `12`, `bug fixes`, `+ 12 bug fixes`, `true` | |
| `dots` | `[{active, done}]` | One per highlight, for progress indicators |
| `icons.sparkles`, `icons.zap`, `icons.alert`, `icons.arrowUp`, `icons.wrench`, `icons.check`, `icons.star`, `icons.terminal`, `icons.rocket` | `<svg…>` | Use raw; they inherit `currentColor` |

### `highlight.html` only

| Variable | Example | Notes |
| --- | --- | --- |
| `text` | `Command palette with fuzzy search` | Cleaned and shortened |
| `kind` | `feature` \| `performance` \| `breaking` \| `other` \| `fix` | |
| `kindLabel` | `New`, `Faster`, `Breaking change`, `Improved`, `Fixed` | |
| `icon` | `<svg…>` | Icon for the kind (raw) |
| `index`, `indexPadded`, `total` | `1`, `01`, `5` | |
| `textSize` | `xl` \| `l` \| `m` \| `s` | Length class: pick a font size per class |
| `parity` | `odd` \| `even` | For alternating layouts |

## Helpers

| Helper | What it does |
| --- | --- |
| `data-split="words"` / `data-split="chars"` | Wraps every word/char in `<span class="sr-word">` / `<span class="sr-char">` with `--i` (its index), and sets `--n` (the count) on the element. Stagger with `animation-delay: calc(var(--i) * 60ms)`. |
| `class="sr-counter"` + `@property --sr-count` | Counting numbers: animate `--sr-count` from 0 to `var(--target)` and the number is drawn with a CSS counter. See `fixes.html` in any built-in template. |
| `class="sr-icon"` | Makes an inline SVG fill its box (set width/height on the wrapper). |
| `--name-chars` | Length of the project name. Cap the title size so it never overflows: `font-size: min(14vmin, calc((100vw - 20vmin) / (var(--name-chars) * .6)))` |
| `--duration` | Scene length, e.g. `2.5s` |

## Checklist before sharing a template

- Preview all three sizes (`landscape`, `square`, `vertical`) with a short and a long project name.
- Test with a long highlight (~70 chars) and with a single highlight.
- Test with and without a logo.
- Render one real video: `npx shipreel --changelog CHANGELOG.md --template ./my-template`.

Want it built in? See [CONTRIBUTING.md](../CONTRIBUTING.md#contributing-a-template).
