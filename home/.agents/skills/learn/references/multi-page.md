# Multi-page courses

Read this before the first build of a course that spans more than one page, or that splits figure work across agents.

## Build

One script assembles every page from fragments: shared CSS, the rail, the pager, and the figures. Put these in it from the first build:

- **Scenes from placeholders.** A page writes `<!--SCENE:name-->` where the figure belongs. The build replaces it with `<figure class="sc" data-scene="name"></figure>`, fails when `scenes/name.js` does not exist, inlines `assets/scene/scene.css` with the page CSS, and ends the body with one `<script>`: the engine, then each scene the page uses, with every `</script` escaped as `<\/script`.

- **Figure numbers come from ids.** Each figure has an id. The build numbers figures in page order and turns a reference marker into "Fig N.M". A typed number goes stale as soon as someone inserts a figure.
- **One reference page holds every term and every gotcha.** Each has an anchor (`#v-*` for terms, `#g-*` for gotchas). Pages link a term at its first use, and the build adds the definition as a hover title. Parallel agents write new terms and gotchas to their own fragment files, and the build merges them.
- **Two validation modes.** Per-page mode warns, because during parallel work a sibling's anchors may not exist yet. Strict mode fails on an unknown anchor, a broken cross-page link, or a stale figure number. The lead runs strict mode before every publish.
- **One shared navigation script on every page.** A normal link opens the page at the top, and a link with a hash lands on its target. Back and Forward keep the browser's own restoration, so `history.scrollRestoration` stays at `auto`.

## Page shape

Every page, when the reader is new to the domain:

1. **The question:** one concrete situation that the reader can feel, in one to three sentences.
2. **Before this page:** links to the pages and terms it builds on.
3. **Sections, from the fundamental to the detail**, in the order that §3 of the skill sets.
4. **What you now know:** three to six one-sentence takeaways.
5. **Gotchas on this page:** each gotcha the page mentions, explained in two to four sentences, linked to its full entry on the reference page.
6. **Sources for this page:** two to six links, each with one line on what it is good for.

## Navigation tests

Start the test from a non-zero scroll position, and confirm it fails without the fix before you trust it with the fix. A local headless browser does not reproduce the claude.ai host frame, so name the host you tested in when you report the result.

## Figures across parallel agents

1. Copy the engine from `assets/scene/`. Build one exemplar scene in the new domain yourself, run its jump audit, and screenshot every step.
2. Write a brief: `scenes.md`, the course's colour key, the page shape, the voice, the file order (a figure's file exists before its placeholder), and which pages each agent owns.
3. Fork by page group. Agents write scene files only and leave the engine as it is. Each agent returns a clean jump audit and one contact sheet per figure, with consecutive identical frames removed, plus a manifest that lists the sheets.
4. Review from the manifests: every sheet, in both themes. Report coverage as "N of N figures checked".
