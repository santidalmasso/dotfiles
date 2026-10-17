# Search notes

Search lets a user find notes by title or body text, inspect a matching note, and distinguish no matches from an unavailable search.

## Sub-features

- `search-open` opens search from each supported browser entry point.
- `search-match` returns title and body matches without changing note data.
- `search-open-result` opens a result in the note editor.
- `search-empty` shows a complete empty state for a query with no matches.
- `search-clear` removes the query and restores the recent-notes view.
- `search-cli` returns the same matching notes from the terminal.

## How to get to it (user POV)

- Choose the `Search` button in the browser toolbar.
- Press `/` in the browser while focus is outside an editable field.
- Run `notes search <query>` in a terminal.

## Driving it with agent-browser and control-notes

Preconditions:

- Notes is healthy at `http://127.0.0.1:4173`.
- The disposable data directory contains `Quarterly plan` with body text `Draft budget`.
- `control-notes doctor` reports the expected URL and data directory.
- `agent-browser open http://127.0.0.1:4173` has run in this run's session.

- **Toolbar entry.** Choose the `Search` button. Run `agent-browser find role button click --name "Search"`. A dialog named `Search notes` appears with focus in its searchbox.
- **Keyboard entry.** Close the dialog, focus the page, and press `/`. Run `agent-browser press Escape` then `agent-browser press /`. The same dialog appears and the page does not insert a slash.
- **Title match.** Type `quarterly`. Run `agent-browser find role searchbox fill "quarterly" --name "Search notes"` then `agent-browser wait --text "Quarterly plan"`. The `Search results` list contains `Quarterly plan` and does not contain `Grocery list`.
- **Body match.** Replace the query with `budget`. Run `agent-browser find role searchbox fill "budget" --name "Search notes"`. The result `Quarterly plan` remains visible with a body-match excerpt.
- **Open result.** Choose `Quarterly plan`. Run `agent-browser find role link click --name "Quarterly plan"`. The dialog closes and the editor heading reads `Quarterly plan`.
- **Empty state.** Reopen search and enter `volcano`. Run `agent-browser find role searchbox fill "volcano" --name "Search notes"` then `agent-browser wait --text "No matching notes"`. A status named `No matching notes` appears after search completes.
- **Clear query.** Choose `Clear search`. Run `agent-browser find role button click --name "Clear search"`. The searchbox is empty and the `Recent notes` region replaces the result list.
- **CLI match.** Search from the terminal. Run `control-notes cli -- notes search "quarterly" --format json`. Exit code `0` and stdout contain one object whose title is `Quarterly plan`.
- **CLI miss.** Search for an absent value. Run `control-notes cli -- notes search "volcano" --format json`. Exit code `0` and stdout are `[]`.
- **Proof.** Capture the populated result state. Run `agent-browser snapshot -i --json > artifacts/search/results.json` and `agent-browser screenshot artifacts/search/results.png`. Both artifacts identify Notes, the query, and `Quarterly plan`.

## Gotchas

- Pressing `/` while the editor or searchbox has focus inserts text instead of opening search.
- Results update after a short debounce. Wait for the results list or empty status, not a fixed sleep.
- Archived notes are excluded unless the user enables `Include archived`.
- The CLI defaults to human-readable output. Use `--format json` for stable assertions.
- Opening a result changes browser state. Reopen search before proving another query.
