# Subagents for Pi

A compact Pi extension that adds subagent orchestration without spawning extra `pi` subprocesses.

## Tools

- `Agent` — run a specialized subagent in an isolated in-process Pi SDK session.
- `get_subagent_result` — inspect background subagent status/output.
- `steer_subagent` — redirect a queued/running background subagent.

## Built-in agent types

- `Explore` — read-only code search (`read`, `grep`, `find`, `ls`).
- `Plan` — read-only implementation planning (`read`, `grep`, `find`, `ls`).
- `Verify` — independent validation with read/search/bash test access.
- `general-purpose` — full built-in coding tools.

## Example

```json
Agent({
  "subagent_type": "Explore",
  "description": "Find auth code",
  "prompt": "Find the files and functions responsible for authentication. Return paths and a brief summary.",
  "run_in_background": true
})
```

Then later:

```json
get_subagent_result({ "agent_id": "<id>" })
```

## Custom agents

Create `~/.pi/agent/agents/my-agent.md` or trusted project-local `.pi/agents/my-agent.md`:

```md
---
name: security-reviewer
description: Review code for security issues
tools: read,grep,find,ls,bash
prompt_mode: replace
---
You are a focused security review subagent. Do not edit files. Report concrete vulnerabilities with file paths and remediation ideas.
```

Project-local agents are only loaded when the tool call uses `agent_scope: "project"` or `"both"`.

## Efficiency choices

- Uses `createAgentSession()` in-process instead of child processes.
- Uses `SessionManager.inMemory()` so subagent transcripts do not pollute disk sessions.
- Disables extensions/skills/templates/context files inside subagents to avoid recursive tools and reduce prompt overhead.
- Bounded background concurrency defaults to 3.
- Foreground tasks stream compact progress via tool updates.
