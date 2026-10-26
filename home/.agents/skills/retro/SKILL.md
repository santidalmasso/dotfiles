---
name: retro
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says retro.
disable-model-invocation: true
---

# Retro

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "retro" or "/retro". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript by the path rule in `santi-mode/references/harness.md`. Stay inside this workspace's folder. Other projects' sessions are private.

For each candidate, read the first JSONL line. Take the file whose first user message is the conversation's opening prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three subagents that keep MCP access, so they can look up the tickets, chat threads, and observability traces the transcript references. If subagents in this harness cannot reach MCPs, say so and let them work from the transcript alone.

| Lens | Prompt template |
|---|---|
| Judgment | `references/judgment-reviewer.md` |
| Tooling | `references/tooling-reviewer.md` |
| Divergent | `references/divergent-reviewer.md` |

Put the divergent reviewer on a different model when one is available, through the **second-opinion** skill.

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their response.

## 3. Synthesize

One subagent with MCP access. It spot-verifies citations through MCP. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): follow the **writing-for-agents** skill.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rewrite the description per the pointer rules in the **writing-for-agents** skill.
- `new skill via writing-for-agents: <kebab-name>`: create it under `~/.agents/skills/` per the **writing-for-agents** skill. Do not invent the shape ad hoc.
- `new private skill via writing-for-agents: <kebab-name>`: same shape, created under `~/.agents/skills-private/`, then run `setup.sh` from the dotfiles repo so both harnesses link it. An existing skill under `~/.agents/skills/` may be a link into that private directory; editing it in place keeps it private.
- `project: <repo-relative path>` (the lesson holds only for this codebase): edit that project's `AGENTS.md` or `.agents/skills/` in the project's working tree. The public pack under `~/.agents/skills/` takes only what applies to anyone.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
