### Multi-phase plan

**You own the plan, then one phase at a time. The plan is a checklist the agent runs phase by phase, and the user reviews each phase's code before the next one starts.** Writing the plan is its own deliverable. Do not implement until the user says go.

1. When the change is one or two files with an obvious approach, skip the plan. Say so and route to Feature.
2. Settle open questions by prototype before you write. Run `playbooks/prototype.md` for each. Keep the scratch path, the SHA if any, and the screenshots or output for Appendix A. Ask the user only about a product or preference call that no run can settle. Give options (the **never-block-on-the-human** principle skill).
3. Explore in read-only subagents per `references/harness.md`, on the bulk-reading model in `references/models.md` (the **guard-the-context-window** principle skill). Each returns file pointers, conventions, test commands, and entry points. No inlined dumps.
4. Copy the skeleton below into the plan file and fill every placeholder. Unless the user names a path, write it to `~/.agents/plans/<repo>/<slug>.md`. Keep every heading and every sub-block in the order shown. One section per phase. A phase is one change with its own evidence that the user can review in one sitting, landing as one commit or a few small ordered ones (the **sequence-verifiable-units** principle skill). Order phases so each one leaves the repo building and its tests green.
5. Write under the **technical-writing** skill in full, then the **unslop** skill. The body is one Diátaxis mode, how-to. Appendices hold explanation and reference. Each heading states the task or the finding. No long dashes. No mid-sentence colons.
6. Audit the plan against the skeleton before handing back. Every placeholder is filled. Every phase has **Depends on**, **Files**, **Build**, **You see**, all three verify blocks, and **Stop for review**. A perf block that does not apply says `n/a: <reason>` instead of disappearing.
7. Hand back. Post the plan path, the phases in order, and what the prototypes proved, then stop. Execution starts on the user's explicit go.

**Running a phase.** On the user's go, read the plan file and take the first phase with unchecked boxes. Only that phase. Build it per Feature step 4, check each box as its evidence exists, commit on the local branch, log the decisions via the **decision-log** skill, and stop with the phase report. The plan file is the state, so any fresh session can pick up the next phase from it.

**The phase report.** The commits with SHAs and a diff stat, the evidence for every verify box, any deviation from the plan and why, and the two or three spots in the diff most worth the user's review. Then stop and wait.

**Review feedback.** When the user asks for changes, make them inside the same phase, re-run that phase's verify blocks, amend or add commits, and stop again with a fresh report. A phase is done only when the user says continue. When feedback changes the shape of later phases, edit those phases in the plan file before starting the next one and say so in the report.

**Verification.** Tests alone are not sufficient verification. A phase is verified only when its unit, live, and perf boxes are all checked (the **prove-it-works** principle skill). That sentence is the verification rule. Every verification block opens with it. The live block is mandatory and drives the real surface through its control skill. Give it one to three scenarios, each with what it saves (a screenshot, a log line, a command's output) and its pass predicate. One scenario is the **Regression check against the base.** It runs the same load-bearing scenario on the base commit and the phase head. If the base does not have the feature, record that fact and gate the behavior the phase adds instead of inventing a base result. The perf block applies when the phase touches a hot path, a startup path, or something the user waits on. Otherwise it reads `n/a: <reason>`. When it applies it names the metric, the probe run on base and head interleaved, the base baseline measured first, and the rule with the number that fails.

**Control skill.** Pick it by surface. A repo with a `verify-<app>` skill uses that. Browser, Electron, and web UIs use the **agent-browser** skill. CLIs, servers, and TUIs run in a herdr pane (`herdr pane run` and `herdr pane read`) when `HERDR_ENV=1`, else a background Bash call. Native mobile uses whatever simulator-driving skill the repo has. A surface with no way to drive it is a risk in Appendix C, and its live block still names how each scenario is observed.

````markdown
# <Program> plan

<Under ten lines. What changes, for whom, the rule the change enforces, and the phase ids in order.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

Phases run one at a time on the branch `<branch>`. After each phase the agent commits, reports, and stops. The next phase starts only when the user says continue. Commits stay local unless the user asks for a PR.

Tests alone are not sufficient verification. A phase is verified only when its unit, live, and perf boxes are all checked.

## Run checklist

- [ ] State this plan to the user, then stop. Start the first phase only on the user's explicit go.
- [ ] Create the branch `<branch>` from `<base>` and record the base SHA here. <SHA>
- [ ] Re-read this file at the start of every phase. Take the first phase with unchecked boxes. Run only that phase.
- [ ] Follow this dependency order. <P1> first. <P2> after <P1>.
- [ ] Hold the file boundaries. <Phase id> touches only `<glob>`.
- [ ] Before each commit, run the repo's lint and typecheck, then the **simplify** skill.
- [ ] End every phase with the phase report and stop. Never roll into the next phase in the same turn.

## <Task as a verb phrase> (<P1>)

**Depends on.** <Phase id, or None.>

**Files.**

- [ ] Edit `<path>`.
- [ ] Create `<path>`.
- [ ] Delete `<path>`.

**Build.**

- [ ] <One change. Name the symbol and the file.>

**You see.**

- [ ] <One observable result, with the exact log line or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A phase is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Test file and the case it gains.> Run `<command>`.

**Verify, live.** Tests alone are not sufficient verification. A phase is verified only when its unit, live, and perf boxes are all checked. Drive it through <control skill>.

- [ ] Scenario 1. Regression check against the base. Run <the load-bearing scenario> at the base and the phase head. If the base lacks the feature, record that and gate <the behavior this phase adds>. Save `<artifact>`. Pass when <predicate>.
- [ ] Scenario 2. <Scenario.> Save `<artifact>`. Pass when <predicate>.

**Verify, perf.** Tests alone are not sufficient verification. A phase is verified only when its unit, live, and perf boxes are all checked.

- [ ] <Metric, probe, base baseline, and the rule with the number that fails. Or `n/a: <reason>`.>

**Stop for review.**

- [ ] Commit as `<conventional commit subject>`. Record the SHA here. <SHA>
- [ ] Post the phase report. List the commits, the evidence, any deviation from the plan, and the spots in the diff worth reviewing.
- [ ] The user said continue. <Date, and any feedback that changed later phases.>

## Close the plan

- [ ] Every box above is checked with its evidence.
- [ ] Reply with the phases landed, their SHAs, what changed from the original plan, and what stays open.

## Appendix A. Prototype evidence

<Each open question a prototype answered, with the scratch path, the SHA, and the artifacts. Each question that stays unproven.>

## Appendix B. Alternatives rejected

<Each approach weighed and why it lost.>

## Appendix C. Risks

<Each risk with the phase it lands in and what to watch.>

## Appendix D. Links and reading list

<Docs to read before editing. Which phases warrant the **how** skill before starting and the **interrogate** skill before the review stop.>
````

**Reply:** the plan path, the phases in order with their dependencies, what the prototypes proved and what stays unproven, and that execution waits for the user's go.
