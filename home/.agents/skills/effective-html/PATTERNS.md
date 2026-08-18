# Pattern catalog

Recipes distilled from thariqs.github.io/html-effectiveness (20 demos). Find your tier, pick the closest artifact, imitate its structure and techniques.

## Shared toolkit (any tier)

- **Page anatomy:** mono uppercase eyebrow → display h1 → dek paragraph → sections → mono provenance footer.
- **Clipboard helper** (the one script every interactive page shares): `navigator.clipboard.writeText` → catch → hidden-textarea `execCommand('copy')` fallback → swap button text to "Copied ✓" for ~1.6s.
- **Segmented control, CSS-only:** hidden radios + `label:has(input:checked)` styling.
- **Collapse:** `<details>` with `summary::before "▸"` rotated 90° on `[open]`; right-aligned `file:line` locator in the summary via `margin-left: auto`.
- **Custom properties as runtime API:** all variants consume shared `--knob-*` tokens; controls call `setProperty` on `documentElement`; `transition` on the consuming properties animates every change for free.
- **Diff-as-grid:** `display: grid; grid-template-columns: 48px 18px 1fr` (line-no / ± mark / code); `user-select: none` on line numbers so copying skips them; add/del/hunk row tints on a dark panel.
- **Hand-authored SVG:** hardcoded coordinates, `<marker>` arrowheads per edge semantic (neutral / success / dashed-failure), `pointer-events: none` on `<text>` so the parent `<g>` catches clicks, caption explaining the encoding, in-image mono labels.
- **Sticky chrome:** `position: sticky` sidebars (TOC, key-files, detail panels — `align-self: start`) and toolbars (live controls, counts, copy buttons).
- **Badge taxonomy:** typed chips (new/mod, sev high/med/low, Landmine/Convention/Discovery…) with consistent colors — categories over prose.
- **Data-in-attributes / data-driven render:** repeated or stateful content lives in a JS array or `data-*` attributes; markup is generated, mechanism is generic.

## Documents (zero JS)

- **Comparison grid** — "show me N ways to do X": N-column grid (collapse <1100px), each card with identical anatomy: numbered heading → dark code panel (span-based highlighting, 2–4 classes) → pro/con mini-table with colored dot bullets → mono metric chips (bundle, testability). End with a left-border accented Recommendation aside.
- **Status report** — 4-stat summary band (stat cards, delta line color-coded, warn variant via left accent border) → highlights → table with status dots and `:hover` rows → inline SVG bar chart (values labeled on bars, peak accented, a comment documenting the value→pixel math) → carryover panel → provenance footer ("Sources: git log … generated <date>").
- **Incident postmortem** — header status pills → inverted dark TL;DR panel (the one paragraph everyone must read) → CSS-only vertical timeline (`::before` rail + positioned dots, semantic dot colors) → root cause with fake diff (`.del`/`.add` tinted lines) → key-value impact table → action items with CSS-checkbox + strikethrough for done, initials avatars.
- **Implementation plan** — numbered section chips (01–06) → summary strip → milestone timeline (grid: date | dot+connector | body) → SVG data-flow diagram → *mockups built as real HTML/CSS, not images* → dark code panels (migration + key snippet) → risk grid with severity chips → open-question cards with owner + deadline ("Decide with · design, before slice 2").
- **PR writeup** — PR meta header → TL;DR → before/after two-panel comparison (after-panel border in success hue) → file tour as `<details>` per file, *ordered for reading not alphabetically*, summary carries path + new/mod badge + ±counts; risky files open by default, plumbing collapsed → numbered "where to focus" cards (include "what I deliberately did not do") → test-plan checkboxes (done vs pending) → rollout as joined segments.
- **Design-token sheet** — self-demonstrating tokens: swatch chips styled by their own value with hex + `--name` beneath; type rows rendered in the actual style with size/weight metadata right-aligned; spacing as literal bars whose width equals the token; radius/shadow cards applying the token to themselves; real working component specimens (hover/focus intact) labeled with their tag name.

## Explainers (read-only JS)

- **Code walkthrough** — two-column: main = inline SVG box-and-arrow diagram (hot node accented, matching the hot step badge below — same color = same concept across diagram and text) then numbered steps with `file:line-range` mono headers and collapsible snippets (accordion JS: opening one closes the rest; the critical one ships `open`); sticky sidebar = key files + accent-bordered gotchas panel.
- **Master–detail flowchart** — SVG flowchart (diamond gates, dashed failure edges, colored markers, legend chips) + sticky detail `aside`; clicking a `<g class="node" data-k>` renders title/meta/body/code from a keyed lookup object. Keep SVG labels terse; depth lives in the panel.
- **Feature explainer** ("how X works here") — sticky nav with TOC + "Files read" provenance → TL;DR box → numbered `<details>` steps → minimal tab switcher (~10 lines, `data-tabs` indices) for config/code/response views → gotchas → FAQ as `<dl>`.
- **Concept simulator** — prose → live demo panel (sliders + buttons + readout) → comparison table (`td` good/bad tints) → sticky glossary linked to dotted-underline `.term`s in prose via `data-term` hover. Techniques: deterministic hash so the demo is stable across reloads; re-render whole SVG as a template string with CSS `transition` on positions; **diff-and-report** — compute before/after state and show the delta as the headline number, so the demo *proves* the text's claim.
- **Slide deck** — `<section class="slide">` at 100vw/100vh, `scroll-snap-type: y mandatory` as the deck engine; arrow/space keyboard nav via `scrollIntoView`; IntersectionObserver (threshold 0.6) syncing an "n / N" counter; `clamp()` type scale; one inverted dark slide for the decision moment; per-slide micro-viz (div progress bars, big metric numbers with deltas, full-width `polyline` sparkline).
- **SVG asset sheet** — when the deliverable *is* graphics: `<figure>` per asset (bordered canvas + figcaption with title, intended use, Download button that serializes the node via `XMLSerializer` → `Blob` → `<a download>`); each SVG embeds its own `<defs><style>` so exports are self-sufficient; close with the palette + drawing rules so the style is reproducible later.

## Prototypes (feel-it JS)

- **Rendered design variants** — 2×2 grid of "artboards": corner tag ("A — Minimal"), fixed-height stage rendering the real component, rationale beneath. Key trick: **stage-scoped tokens** — `.stage { --fg; --panel; … }` redefined under a modifier class, so variants are written once and a global toggle re-themes all stages at once.
- **Component matrix** — sticky toolbar of live controls (slider/radios/checkbox → `setProperty('--card-*')`) over a grid of labeled variants with "best for:" notes; all variants consume the same tokens so one knob retunes the matrix; hovering a card loads its `data-snippet` JSX into a pinned code panel with placeholders substituted from current control values.
- **Animation playground** — live stage (click to replay, entire choreography driven by one class toggle) + easing panel swapping a global `--ease` + keyframe timeline (labeled dots at each delay) + copy-paste CSS block. Techniques: checkmark via `stroke-dashoffset` transition; growing `::after` strike bar; spring overshoot keyframes; CSS-only confetti (per-particle `--dx/--dy/--rot` consumed by one shared `@keyframes`).
- **Interaction prototype** — working mock (e.g. drag-to-reorder: native HTML5 DnD, ~40 lines; `.dragging` = low opacity + slight tilt; drop-indicator line positioned at the nearest row boundary using **midpoint thresholds**, not raw cursor Y; `insertBefore` reorders) + "What you're feeling" annotation panel enumerating the baked-in decisions + what was *deliberately left out* + numbered open questions.

## Editors (stateful JS)

State discipline for all three: content as a single data array; deep-copied frozen `INITIAL`; full `render()` on every change (no framework, trivially correct); Reset restores `INITIAL`; every editor ends in a **round-trip** copy.

- **Triage board** — sticky toolbar (live per-column counts, filter pill, Reset, "Copy as markdown") over color-coded kanban columns; native DnD between columns (guard `dragleave` with `col.contains(e.relatedTarget)`); tag-click filtering dims non-matches; column footers sum estimates live so capacity is visible while dragging; export serializes the *current* board + per-column rationale to markdown.
- **Config/flags editor** — grouped rows: CSS-only toggle switch (hidden checkbox + track/knob, `:focus-visible` ring) + mono key + badges + "requires X" chip; **state lives in the DOM checkboxes** (`currentState()` reads them — one source of truth); declarative dependency rules validated live (row → chip → banner escalation); sticky sidebar with pending count + live minimal diff vs `INITIAL` (`Copy diff` disabled until changes exist) + `Copy full JSON` in paste-ready format; `CSS.escape` for selectors built from data keys.
- **Prompt tuner** — contenteditable mono editor with live `{{slot}}` highlighting (known = chip, unknown = warn underline) beside N sample cards re-rendered per keystroke (rAF-debounced) so one edit is tested against every persona at once; char + ~token counter (`chars/4.2`); one shared `SLOT_RE` for highlighter and filler so they can't disagree. Caret survival in contenteditable: TreeWalker-based get/set caret by character offset, intercept `paste` to plain text and `Enter` to literal `\n`.
