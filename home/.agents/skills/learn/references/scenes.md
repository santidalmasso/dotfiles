# Scenes: figures in the 3Blue1Brown manner

A **scene** is a flat, interactive figure that teaches one idea as a sequence of steps. The same objects move between steps, so the reader watches the transformation instead of comparing two pictures. The reader steps forward and back, plays the sequence, hovers a coloured word to light up the objects it names, and drives the last step with a control. The dark palette is manim's (`#58c4dd`, `#5cd0b3`, `#fc6255`, `#83c167`), which is why the figures read as 3b1b.

Reuse the engine in `assets/scene/`. It runs 47 scenes in the Aleph course and is tuned so that no object jumps between states. Build only the scene files.

| File | What it is |
|---|---|
| `assets/scene/engine.js` | The runtime. Inline it once per page, before the scene files. |
| `assets/scene/scene.css` | The figure chrome and the colour tokens, in both themes. Inline it after the page tokens. |
| `assets/scene/example-rowsToPivot.js` | The reference scene: nine flat rows morph into a pivot, totals count up, an AVG control shows the trap. Read it before you write a scene. Its numbers are from a finance course. Copy the pattern, not the domain. |
| `assets/scene/preview.html` | Open `preview.html?scene=<path>.js` to see a draft scene without a page or a build. Several paths take commas. |
| `assets/scene/audit.js` | The jump audit (see Checks). |

## The API

```js
Scene.define("name", {
  fig: "Fig 2.1", title: "Short name", w: 640, h: 300,
  params: {
    agg: { type: "seg", label: "Measure", options: [["sum", "SUM"], ["avg", "AVG"]], value: "sum" },
    k: { type: "range", label: "Rows per month", min: 1, max: 4, step: 1, value: 1, format: (v) => v + "×" },
  },
  steps: [
    { say: 'One STE sentence. <b class="k-key" data-tag="dept">department</b>', params: [] }, // [] hides every control; omit to show all
    { say: "...", params: ["agg"], ms: 1100, dwell: 2600 },
  ],
  caption: "Where the data and the code come from. HTML allowed.",
  draw(step, p, h) { return [/* every object for this (step, params) */]; },
});
```

- `draw` is pure. It returns the whole picture for one state, and the engine diffs by key. The same key in two states moves: that is a **morph**. A new key fades in from its `enter` props. A key that goes away fades out.
- Objects: `h.rect(key, {x, y, w, h, r, fill, stroke, sw, opacity, dash})`, `h.text(key, {x, y, text, size, fill, anchor, weight, mono, serif, rot})`, `h.line(key, {x1, y1, x2, y2, stroke, sw, dash})`, `h.arrow(...)`, `h.circle(key, {cx, cy, r, ...})`, `h.path(key, {d, ...})`, `h.rich(key, {x, y, size, anchor, parts: [[text, color, weight]]})` for a formula with coloured terms.
- A counting number: give a text `num` and `fmt` (`h.fmt.int`, `one`, `two`, `pct1`, `pct2`, `signed`). Pick `fmt` from the target value, so an integer does not show decimals while it counts.
- Per-object options, the third argument: `{ tags: "a b", at: 0..0.7, span, enter: {...} }`. `at` delays the object inside the step's transition, which gives a **lagged start**. `tags` links the object to narration words with the same `data-tag`. A hover on either dims everything else.
- Debug: `document.querySelector('figure[data-scene=name]').__scene.go(i, ms)`.

## Motion contract

The engine keeps every transition continuous. A scene keeps its side of the contract:

- **One key per object, stable across steps.** A key that names the thing ("cell-Sales-Jan"), never its position in a list. The engine warns in the console on a duplicate key.
- **Morph shapes of the same kind.** A path morphs when the two `d` strings have the same commands in the same order. Write both with the same skeleton. A path with a new skeleton, a new text, anchor or weight, or an arrow head that comes or goes, cross-fades at the midpoint instead.
- **Numbers count. Words cross-fade.** Put a changing number in `num`, never in `text`.
- **Give a new object an `enter` that starts where it belongs** (the same x, y, opacity 0), or next to the object that it comes from. An object that enters from the origin flies across the stage. Enter at opacity 1 only when the object flies out of a visible source, and with an `at` of 0: a delayed object waits visible at its start, and an interrupted step leaves it there.
- What the engine already handles: an interrupted step continues from the object's current place and speed with no stagger stall, a fade-out that is interrupted continues from its current opacity, a dropped `dash` or `rot` returns to none, a colour to or from `none` fades, the slider moves the picture directly with no stagger, and a change of object kind cross-fades.

## Rules

1. One idea per scene, and one new thing per step. A step that adds two things is two steps.
2. Show the transformation. When one form becomes another (rows into a grid, text into a tree, a total into spread cells), the same keys move. Never swap one picture for another.
3. Concrete first. The first step shows the simplest picture with real numbers and needs nothing the reader has not learned. The general rule comes after the example.
4. Colour is meaning. A word in the narration and the object it names share the colour and the tag.
5. The narration says why, not only what. A step defines a term before a later step uses it.
6. Let the reader push on it. A variable gets a control: a slider for a number, a segmented button for a choice. The last step is a **playground** that says what to try ("Set the measure to AVG and watch the grand total").
7. A trap shows the wrong answer next to the right one, in `--c-bad` and `--c-good`.
8. Calm motion. 1100 ms per step by default, lagged starts with `at`, smooth easing. No bounce, no spin, no decoration.
9. Few words in the drawing: axis labels, names, numbers, at most one short note. The narration carries the explanation.

## Narration

Each `say` has at most three sentences of at most 20 words, in the page's simplified technical English. Active voice, present tense. A command for what to do: "Move the slider to March."

## Colour key

Each idea keeps one colour on every page. `--c-bad` (wrong results, errors) and `--c-good` (correct results, checks that pass) are fixed. The other five are slots. At the start of a course, write a table that gives each slot one meaning, and keep it for the whole course. The token names come from the first course: keep them, because every existing scene uses them.

| Token | Prose class | Meaning in the finance course (an example) |
|---|---|---|
| `--c-actual` | `k-actual` | Actual scenario, the read path |
| `--c-budget` | `k-budget` | Budget scenario, the write path |
| `--c-key` | `k-key` | keys, dimensions, group-by columns |
| `--c-time` | `k-time` | time: months, quarters |
| `--c-calc` | `k-calc` | formulas, computed values |
| `--c-bad` | `k-bad` | wrong results, errors |
| `--c-good` | `k-good` | correct results |

Totals are `var(--ink)` at weight 650 to 700. Structure (cell borders, rules) is `var(--c-cell-line)`, a cell is `var(--c-cell)`, and everything else is `var(--ink)` or `var(--muted)`. Colours are always CSS variables, never hex: the engine resolves them per theme and re-renders on a theme switch.

## Layout

The stage is 640 wide and 220 to 380 high. Text is at least 11 viewBox units. On a phone the stage scrolls sideways (min-width 560). The page column is 660 px so that the stage is not scaled down.

## Checks

A scene is done when its audit is clean and every step looks right in both themes.

1. **Jump audit.** `node <anatomy>/scripts/drive.mjs "file://<skill>/assets/scene/preview.html?scene=/abs/path/scene.js" --preload <skill>/assets/scene/audit.js --actions a.json`, with the actions written at the top of `audit.js`. Pass a built page instead of the preview to audit every scene on it. It plays every step forward, backward and interrupted, clicks every option, sweeps every slider, samples each frame, and lists each object that jumps, pops, flashes or changes its words while visible. The result must be `findings: 0`. Fix the scene, never the thresholds.
2. **Every step in both themes.** `["eval", "...__scene.go(i)"]`, `["wait", 1400]`, `["shot", ...]` per step, with `--theme light` and `--theme dark`. Read every PNG: overlaps, clipped text, colours that do not read.
3. **One slow-motion sheet** across the main morph: `["slow", 0.1]` and `["sheet", ...]`.
4. A clean console.

Report coverage as "N of N figures checked".
