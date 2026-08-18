# Design tokens — minimal system

A restrained, achromatic system: near-white surfaces, near-black text, one blue accent, shadows instead of borders. Light theme only, by design — set explicit backgrounds so the page renders identically regardless of viewer theme.

## Ready-to-paste `:root`

```css
:root {
  /* color — achromatic core */
  --bg: #FAFAFA;            /* page background */
  --bg-elevated: #FFFFFF;   /* cards, panels */
  --bg-recessed: #F2F2F2;   /* wells, code chrome, hover fills (#EBEBEB for nav hover) */
  --fg: #171717;            /* primary text */
  --fg-secondary: #4D4D4D;
  --fg-muted: #8F8F8F;
  --accent: #0072F5;        /* the ONLY accent — interactivity/links */
  --focus: #005FCC;

  /* shadow-as-border + elevation */
  --ring: 0 0 0 1px rgba(0,0,0,0.08);
  --shadow-sm: var(--ring), 0px 2px 2px rgba(0,0,0,0.04);
  --shadow-lg: var(--ring), 0px 2px 2px rgba(0,0,0,0.04), 0px 8px 16px -4px rgba(0,0,0,0.04);
  --focus-ring: 0 0 0 2px #FFF, 0 0 0 4px var(--accent);

  /* type */
  --sans: system-ui, -apple-system, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "Roboto Mono", monospace;

  /* spacing — 4px base, multiplier naming */
  --space: 4px;   --space-2x: 8px;  --space-3x: 12px; --space-4x: 16px;
  --space-6x: 24px; --space-8x: 32px; --space-10x: 40px; --space-16x: 64px;
  --space-24x: 96px; --space-32x: 128px;
  --gap: 24px; --gap-half: 12px; --gap-quarter: 8px;

  /* radius */
  --radius: 6px;        /* default: buttons, inputs, chips */
  --radius-card: 12px;  /* cards, panels — the maximum for functional UI */
  --radius-pill: 9999px;

  /* motion */
  --ease-swift: cubic-bezier(.175, .885, .32, 1.1);
  /* overlays: 0.3s, entrance scale 0.96; popovers: 0.2s */
}
```

## Status colors — dots only

Blue `#0062D1` · Cyan `#52AEFF` · Teal `#45DEC5` / `#067A6E` · Green `#398E4A` / `#45A557` / `#6CDA75` · Orange `#FF990A` · Red `#E5484D` · Pink `#EA3E83` · Purple `#7820BC` / `#BF89EC`

Rendered as ~10px circles beside a label — never as background fills or large swaths.

**Artifact exception:** deliverable *content* that needs area color — diff lines, chart fills, severity row tints — may use these hues at low alpha (e.g. `rgba(229,72,77,0.08)` del / `rgba(57,142,74,0.08)` add). Page chrome stays achromatic.

## Typography

Three weights only — 400 (regular), 500 (medium), 600 (semibold). **Never 700+.**

| Element | Size / line | Weight | Letter-spacing |
|---|---|---|---|
| h1 (display) | 48px / 48px | 600 | −2.28px (−4.75%) |
| h3 (section display) | 32px / 40px | 600 | −1.28px (−4%) |
| h2 (subsection label) | 14px / 20px | 500 | −0.28px |
| body | 16px / normal | 400 | — |
| button | 14px / 14px | 400 | — |
| code / pre | 13px / 20px | 500 | — |
| input | 13.3px | 400 | — |

Aggressive negative letter-spacing on display headings (32px+) is the signature — apply it. Mono for all "machine" text: file paths, IDs, timestamps, tokens, eyebrows, labels.

## Components

- **Heights:** small 32px · default 40px · large 48px · header 64px · sub-menu 46px.
- **Buttons:** ghost-first — transparent default, hover fill `#EBEBEB` with text promoted to `--fg`; feedback via color change only.
- **Focus:** the double ring — `box-shadow: var(--focus-ring)` (2px white separation + 4px blue).
- **Inputs:** transparent default; focus `outline: var(--focus) auto 1px` or the double ring.

## Layout

- Page width 1200px standard, 1400px wide; 24px horizontal page margin. Prose reading columns may be narrower (~820px) inside it.
- Elevation in layers: border ring alone for structure; add depth layers only as elements float (card → menu → modal).

## Do / Don't

- **Do** use shadow-as-border: `box-shadow: 0 0 0 1px rgba(0,0,0,0.08)` — **don't** use CSS `border` on containers.
- **Do** keep color achromatic — black/white/gray, blue for interactivity, status hues as dots. **Don't** introduce new accent colors.
- **Don't** use decorative gradients or patterns.
- **Don't** exceed 12px radius on functional UI (pills at 9999px are the exception).
- **Don't** add divider lines between sections — separate with spacing and background shifts (`--bg` ↔ `--bg-elevated` ↔ `--bg-recessed`).
- **Don't** animate `transform`/`opacity` on interactive chrome — hover feedback is color-only. (Prototype/demo *content* that exists to show motion is exempt.)
