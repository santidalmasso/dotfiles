# Harness map

Read once per session. Skills in this pack name a job, not a tool. This file maps the job to the harness you are in. Tell which one by your tools: `Agent` with `subagent_type` values `Explore` and `general-purpose` plus `TodoWrite` or `EnterPlanMode` means Claude Code. `Agent` with `get_subagent_result` and `steer_subagent`, plus `read`, `bash`, `edit`, `write`, means pi.

| Job | Claude Code | pi |
|---|---|---|
| Read-only explorer | `Agent` with `subagent_type: "Explore"`. It keeps Bash, so the brief also says "do not edit files". | `Agent` with `subagent_type: "Explore"` (read, grep, find, ls only). |
| Worker that edits | `Agent` with `subagent_type: "general-purpose"`. `isolation: "worktree"` for its own checkout. | `Agent` with `subagent_type: "general-purpose"`. Give it its own worktree in the brief. |
| Verifier | `general-purpose` with a read-and-run brief. | `Agent` with `subagent_type: "Verify"`. |
| Same-family model override | `model: "opus"`, `"sonnet"`, `"haiku"`, or `"fable"`; `effort` for reasoning level. | `model: "<provider>/<id>"` or a substring; `thinking` for level. |
| Other model family | The **second-opinion** skill (pi headless). The codex plugin's `codex:codex-rescue` agent is a second option. | The **second-opinion** skill (claude headless), or a subagent with an Anthropic model when that provider is configured. |
| Background and wait | Subagents run in the background and notify you. | `run_in_background: true`, then `get_subagent_result`. |
| Todo list | `TodoWrite` when present, otherwise keep the list in the reply. | `TodoWrite` from the todos extension. |
| Plan mode | `EnterPlanMode` and `ExitPlanMode`. | `EnterPlanMode` and `ExitPlanMode` from the modes extension. |
| Loop until a predicate | `/loop <interval or none> <prompt>`. | `/loop` from the loop extension; the `goal` tools for a budgeted objective. |
| Structured question to the user | `AskUserQuestion`. | `AskUserQuestion` from the extension. Absent in `-p` mode, so ask in plain text. |
| Current transcript | `~/.claude/projects/<slug>/<session>.jsonl`. Slug is the cwd with every `/` and `.` turned into `-`. The newest file is this session; `<session>/subagents/` holds subagent transcripts. | `~/.pi/agent/sessions/<slug>/<session>.jsonl`. Slug is `--` plus the cwd with every `/` turned into `-`, plus `--`. |
| Always-on instructions | `~/.claude/CLAUDE.md`, then the project's `CLAUDE.md`. | `~/.pi/agent/AGENTS.md`, then the project's `AGENTS.md` or `CLAUDE.md`. |
| Invoke a skill by hand | `/<name>` | `/skill:<name>` |

Read only this workspace's transcript folder. Never glob across other projects' sessions.
