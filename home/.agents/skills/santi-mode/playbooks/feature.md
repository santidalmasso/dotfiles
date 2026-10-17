### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. `how` over the affected subsystem.
2. The **codebase-design** skill. Design it twice: two structurally distinct shapes, compared on interface depth, before committing.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate before serializing shared state** principle). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a worker subagent with a specific scope (file paths, named data shape and its organizing structure per the **model the domain** principle, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria), or write it yourself when the slice is small. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), sketch each and pick before writing logic. Comments per **Comments**, names per the **write-discoverable-code** skill. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence verifiable units** principle, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run the **open-pr** skill.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.
