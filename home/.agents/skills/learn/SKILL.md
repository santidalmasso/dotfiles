---
name: learn
description: Learn an unfamiliar codebase, subsystem, library, or concept from the outside in, and leave one page to keep: a map, a learning path, sections that cite the real code or the sources, a glossary, and the gotchas, in simplified technical English.
disable-model-invocation: true
---

# Learn

**You build the person's mental model of something unfamiliar and leave them one page they can come back to. The goal is that they understand it, not that you change anything.**

`teach` explains one change in conversation. `learn` is for "I'm new to this" and ends with a page. `teach`'s rules on plain definitions, density, no quizzes, no framing labels, and diagrams built up one part at a time apply here. Read it first.

## 1. Read the need

From the conversation: about to contribute, reviewing, debugging, evaluating, or curious. That sets the depth and which path to walk. Ask one question only when nothing in the conversation says.

## 2. Gather, don't guess

- Code: read the README, the agent instruction files, the manifests, and CI yourself for the map. Then the **how** skill over the thing (angles: entry points, the data model, the main flow, boundaries) and the **why** skill, narrowly, on the one or two decisions a newcomer asks "why on earth" about. Keep `why`'s confidence language.
- A library, technique, or concept: the **find-docs** skill, then the primary source (the spec, the paper, the project's own guide, the Wikipedia article for the general idea). Never memory for an API or a version.

## 3. Build the page

One self-contained HTML file through the **effective-html** skill at the Explainer tier. Start from `references/page-template.html` and keep to `references/page-style.md`. Sections in this order. Drop one that has nothing to say.

1. **Masthead.** The name, one sentence that says what it is, who the page is for.
2. **Map.** Three to seven big parts, what each owns, how they connect. One diagram.
3. **Path.** The learning path as numbered steps, each naming what the reader can do after it. The left rail lists the same steps.
4. **One section per step.** Short prose, then the evidence in a card. For code, the real file and function as a `path:line` link and the lines that matter. For a concept, the source it comes from. One diagram when a picture lands faster than words, each redraw adding one part to the last.
5. **Vocabulary.** Every term with its own meaning here, spelled as the code spells it, one line each.
6. **Gotchas.** What looks like it should work one way but doesn't, with the `why` finding behind it.
7. **Learn more.** Sources to go deeper, one line each on what it is good for: the docs, the spec, a paper, Wikipedia, a talk.
8. **Colophon.** What the page was built from: files read, commands run, sources fetched.

Stop at the depth the need requires. Someone evaluating a library gets the map, a short path, and learn more.

## 4. Write it in simplified technical English

The STE layer of the **technical-writing** skill and the **unslop** skill. One thought per sentence, under about 20 words. The everyday word. One name per thing, kept for the whole page. Define a term where it first appears, then use it unchanged. State the mechanism, never a metaphor in its place.

## 5. Show it

Diagrams follow the **show-me** skill and go into the page as inline SVG: a file tree for ownership, a call tree for flow, a sequence for interaction, pseudocode for an algorithm. When one mechanism is the heart of the topic and the reader will come back to it, the **anatomy** skill draws it as an interactive isometric figure. A figure takes up to an hour, so build one only when the user asks or the budget allows. A video is out of reach here. A stepper that adds one part per step is the nearest thing.

Open the page for them. For a small topic, the reply is the page.

**Reply:** the explanation, map first, never a report about what you did. Then the path to the page.
