# Page style

Taken from skills.wheresryan.sh/anatomy and its collection page, as inspiration, not a copy. The look is one quiet column of small text with hairline rules, numbered sections, and a sticky rail that lists them. `page-template.html` carries the tokens and the skeleton. Change structure freely; keep the restraint.

## Tokens

| Token | Value | Paints |
|---|---|---|
| `--ground` | `#f7f8f6` | page background |
| `--ink` | `#161a17` | headings, strong text, numbers |
| `--text-2` | `#4a514c` | body paragraphs |
| `--muted` | `#7f8781` | section index, captions, colophon |
| `--faint` | `#c2c8c3` | link underlines, icons at rest |
| `--rule` | `#e4e8e4` | hairlines, table rows, details borders |
| `--well` | `#edf0ec` | inline code background |
| `--card` | `#ffffff` | cards and figures |
| `--accent` | `#2f5d8a` | focus rings, sliders, notes |
| `--accent-soft` | `#e6eef6` | the pressed option, takeaways, a link target |
| `--column` | `660px` | reading column width, so a 640-wide scene is not scaled down |
| `--rail` | `200px` | sticky nav column on the left |
| `--gap` | `48px` | column gutter |
| `--ease` | `cubic-bezier(0.22,0.75,0.2,1)` | the only easing |

Every colour token has a dark value. The template sets them under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. Scene colours live in `assets/scene/scene.css`.

Cards (code blocks, figures) are `--card` on the ground with a hairline shadow and a 12px radius. Nothing else has a border.

## Type

- Body: a sans with optical weight 450 at 14px / 20.5px. System sans is fine. Lead paragraphs at weight 550.
- Headings: the same size as body, weight 550. `h1` only in the masthead. `h2` is the section title, `h3` an item inside a section. Hierarchy comes from spacing and rules, not size.
- Section index: an italic serif numeral (`01`, `02`) in `--muted` at 16px, lining tabular figures, sitting right of the hairline that runs out from the `h2`. EB Garamond on the site; Georgia or Iowan Old Style as the system fallback.
- Code: mono at 12.5px inline on `--well`, 12px / 19px in cards. Tabular numerals everywhere a number appears.
- Links underlined, 1px, offset 3px, underline in `--faint`, text in ink.

## Layout

- Three columns from 1120px up: margin, rail, column. Under that, one column with the rail hidden and a plain in-page list at the top.
- Masthead: `h1` with a middle-dot subtitle (`Anatomy · a skill`), one statement sentence with at most one italic `em`, a small meta line (count, author, date).
- Sections 72px apart, `scroll-margin-top: 48px`. Each opens with `.section-head`: the `h2`, a hairline that fills the row, the index numeral.
- Paragraphs 12px apart. Short. One idea each.
- Q&A and gotchas as `<details>` with a hairline top border and a `summary` in weight 500.
- Tables full width, hairline rows, 9px vertical padding, no vertical lines.
- Colophon: 72px below the last section, hairline top, muted 13px, naming what the page was built from.
- Motion only under `prefers-reduced-motion: no-preference`, and only `--ease`.

## What to change for a learning page

- The rail is the learning path: one entry per step, numbered, the current one in ink.
- A step's evidence sits in a card: the file and function as a `path:line` link, the lines that matter, nothing more.
- Static diagrams are inline SVG in a card, with a one-line caption under it in muted. A mechanism is a scene: see `scenes.md`.
- The glossary is a table: term in mono, meaning in body text.
- Learn more is a table: source as a link, one line on what it is good for.
