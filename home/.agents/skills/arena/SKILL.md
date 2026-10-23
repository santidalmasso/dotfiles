---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Ported from pstack's arena. Read `../santi-mode/references/harness.md` for this harness's tools and `../santi-mode/references/models.md` for the arena rows.

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners from the `Arena runners` row in `models.md`. The default is one seat per family. The seat in your own family is a subagent. The other family's seat is an agent in a herdr pane (see Other-family seats below). Outside herdr, run every seat in your own family and say so. If the `Agent` tool or pi rejects a model, run that seat on its family's default and say so. Spawn more runners when the arena covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive. Pick each subagent's effort for the job, per the Subagents section of the **santi-mode** skill.
4. Give each candidate its own output location, per the **separate before serializing shared state** principle. For code, that means a git worktree: `isolation: "worktree"` for a Claude Code subagent, and `git worktree add <scratch>/arena-<slug>/candidate-<n> -b arena/<slug>-<n>` for a pi subagent or a herdr seat. For anything else, use `<scratch>/arena-<slug>/candidate-<n>/`.

Write the task to `<scratch>/arena-<slug>/task.md`. Include the artifact, the shared grounding (file paths to read), and the instruction to write the artifact plus a short `RATIONALE.md` in the candidate's own location. The rationale names the alternatives the candidate considered and what it rejected. Finish with: "When the artifact and RATIONALE.md are written, reply with a line containing only `SEAT-DONE`." Leave the rubric out of it.

## Phase B: Fan out

Launch every seat in one message. Same-family seats use the "Worker that edits" row of `harness.md` and run in the background. Each gets a pointer to `task.md`, its own output path, and an instruction to report its worktree path in its reply, since the harness picks that path. Herdr seats get the same pointer.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, take one model from the `Arena cross-judge` row in `models.md`. Prefer a different model family from the parent's, run read-only through the **second-opinion** skill's step 3 (herdr inside herdr, headless outside). Write its brief to `<scratch>/arena-<slug>/judge.md`. Give it the rubric and the candidates by path label (candidate-1, candidate-2), but not which model wrote which. Have it score each criterion per candidate and recommend a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the **laziness protocol** principle.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign from first principles** principle, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove it works** principle. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

Then clean up what the arena created. Close its herdr panes, remove its worktrees with `git worktree remove`, and delete its `arena/<slug>-*` branches once the synthesis has landed.

## Other-family seats

A herdr seat runs the other family's CLI in a sibling pane the user can watch. It requires `HERDR_ENV=1`. Follow the herdr procedure in step 3 of the **second-opinion** skill, with these differences:

- **Layout.** Split the first seat from the calling pane, then split each later seat `down` from the previous seat's pane (`herdr pane split <prev-pane> --direction down`). Repeated splits from the calling pane leave unusably narrow columns.
- **Working directory.** Pass the candidate's worktree or output directory as `--cwd`.
- **Name.** `arena-<slug>-<n>` for a candidate, `arena-<slug>-judge` for the judge.
- **Writer flags.** A candidate edits files, so drop the read-only flags:

  ```bash
  # pi candidate (from Claude Code)
  herdr agent start <name> --kind pi --pane <pane> -- \
    --no-session --no-extensions --model openai-codex/<id> --thinking xhigh

  # Claude candidate (from pi)
  herdr agent start <name> --kind claude --pane <pane> -- \
    --model opus --effort xhigh --permission-mode auto
  ```

  The judge keeps second-opinion's read-only flags. Add `bash` to pi's `--tools`, or use `--permission-mode auto` for Claude, when the judge should run the candidates' tests. Its brief still says "do not edit files".
- **Waiting.** Start one background wait per seat on the `SEAT-DONE` sentinel so the seats run in parallel. Take each pane ID from its own `pane split` response, never from the pattern of earlier IDs, because closed pane IDs are not reused. When a wait times out or the agent shows `blocked`, read the pane before you send input.
