---
name: effective-html
description: Create self-contained HTML deliverables instead of markdown — reports, plans, code reviews, explainers, prototypes, and decision-collecting editors. Use when the user asks for a deliverable as HTML / "as a page" / an artifact, or when the output is something the reader should explore, react to, or decide from rather than skim. Not for production app code.
---

# Effective HTML

An HTML deliverable trades a document the reader would *skim* for one they'd actually *read*. Every artifact is **self-contained**: one `.html` file, one `<style>` block, at most one `<script>`, zero network requests — no CDNs, no external fonts, no libraries, no image files. Diagrams and charts are hand-authored inline SVG; icons are Unicode or CSS; avatars are initials in circles. The file must render correctly opened straight from `file://`.

## 1. Classify the artifact

Pick the tier — it fixes the **JS budget**. Never spend more JS than the tier allows.

| Tier | JS budget | Typical artifacts |
|---|---|---|
| **Document** | Zero JS | status report, postmortem, implementation plan, comparison, PR writeup, token sheet |
| **Explainer** | Read-only JS: tabs, click-to-detail, simulation | code walkthrough, flowchart, concept simulator, slide deck, asset sheet |
| **Prototype** | Feel-it JS: variant toggles, live controls, drag | design directions, component matrix, animation/interaction mock |
| **Editor** | Stateful JS: frozen `INITIAL` + full `render()` on change + Reset | triage board, config editor, prompt tuner, interview wizard |

Then load the matching patterns:

- Read [PATTERNS.md](PATTERNS.md) for the tier's layout and technique recipes.
- If the artifact's job is to surface unknowns or collect the user's decisions (blindspot pass, interview, plan review, design directions, quiz), also read [UNKNOWNS.md](UNKNOWNS.md).

Done when: tier named, JS budget fixed, pattern(s) chosen.

## 2. Apply the token system

Read [TOKENS.md](TOKENS.md) before writing any CSS. It is the single source of truth for color, type, spacing, radii, shadows, motion, and the do/don't rules — a minimal, achromatic system.

## 3. Build

Rules that apply to every tier:

- **Cite sources.** State what the artifact was built from ("Sources: git log …", "Files read:", "drawn from .github/workflows/") in a nav panel or mono footer.
- **Native elements first.** `<details>/<summary>` for collapse, hidden-radio segmented controls with `:has(input:checked)`, checkboxes with `accent-color`, anchors + `scroll-behavior: smooth` + `scroll-margin-top`, scroll-snap, HTML5 drag & drop. Custom JS only where natives can't reach; the page must degrade to a readable static document.
- **Triage the reader's attention.** Full detail only where risk or judgment lives; collapse trusted/mechanical content into `<details>`. Encode severity with a typed badge taxonomy, not prose.
- **Choices carry their price.** Every option, variant, or alternative gets a quantified tradeoff ("steals ~56px", "removes ~½ day") and a "pick this if:" trigger.
- **End decision-forcing.** Close with a recommendation, checklist, or numbered open questions — never trail off.
- **Round-trip** (Prototype and Editor tiers): the artifact is a form whose submit action is the clipboard. Chips, checkboxes, and pickers assemble a paste-ready reply (`Copy as markdown` / `Copy diff` / `Copy prompt`), pre-filled so it never opens empty, with unanswered blanks visually loud.

Done when: the file exists and every rule above that applies to the tier is satisfied.

## 4. Verify

Check the finished file — every line must pass:

- [ ] `grep -nE 'src=|href="http|@import|url\(http|<link'` finds no external request (in-page `#anchors` fine).
- [ ] One `<style>`, at most one `<script>`; JS matches the declared tier budget.
- [ ] No `border:` on containers (box-shadow ring instead); no `font-weight: 700`+; no accent color beyond blue + status-dot hues.
- [ ] Wide content (code, diffs, tables, SVG) scrolls in its own `overflow-x: auto` container; page body never scrolls horizontally.
- [ ] Provenance present; ends with recommendation / checklist / open questions.
- [ ] Interactive tiers: round-trip copy works (with `execCommand` textarea fallback) and Reset restores `INITIAL`.
- [ ] Opens from `file://` and reads as a complete document with JS disabled.

Done when: every box checks. Then deliver the file (SendUserFile or Artifact).
