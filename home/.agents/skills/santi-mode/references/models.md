# Model configuration

One line per role. The pack's skills name a role; this file names the model it runs on in each harness. Edit a value to change it. `inherit` means omit the model override, so the role runs on the session's model.

Claude Code takes `model` plus `effort` (`low` to `max`). pi takes `model` as `provider/id` or a substring; its subagents have no per-call thinking level, so they run at the session's level. Every slug below was checked against `pi --list-models openai` and the Claude Code `Agent` tool on 2026-10-17. Rerun that check before writing a new one. The OpenAI tiers follow OpenAI's own guide: Astra for the most demanding reasoning and coding, 6.1 Sol for complex coding at near-Astra quality and a fifth of the cost, Luna as the fastest and cheapest for focused high-volume work. GPT-5.5, 5.6 Sol/Terra/Luna and 5.3 Codex Spark are the previous generation; nothing routes to them.

# budget: large (xhigh for judgment, high for everything else)

| Role | Claude Code | pi |
|---|---|---|
| Bulk reading: how explorers, why investigators, retro tooling, verification source wave, blast-radius scouts | `sonnet`, effort high | `gpt-6-luna` |
| Workers: feature, bug-fix, refactoring delegates, Comment Sicko | `opus`, effort high | `gpt-6.1-sol` |
| Verifier | `sonnet`, effort high | `gpt-6-luna` |
| Judgment and prose: how explainer, why synthesizer, retro judgment and synthesizer, interrogate Reviewer A | inherit, effort xhigh | `gpt-6-astra` |
| Hardest tasks: a slice you would not trust a worker with | inherit, effort max | `gpt-6-astra` |
| Other family: retro divergent, interrogate Reviewer B, decision-log trail review | the **second-opinion** skill, pi default | the **second-opinion** skill, `opus` |

The budget line sets the effort token for every role at once. `unlimited` is max everywhere, `large` is the table above, `medium` drops judgment to high, `small` drops everything to medium.
