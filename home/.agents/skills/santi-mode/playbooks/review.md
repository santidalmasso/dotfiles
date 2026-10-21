### Review

**You own the verdict. Read, challenge, judge.** The deliverable is a judgment the author can act on, not a changed branch.

1. Scope the diff: a PR number through `gh pr diff`, a branch against its base, or the working tree. Read the PR body and the linked issue for the intent.
2. **how** over any subsystem the diff touches that you don't already hold in your head. Skip for a diff inside one file you understand.
3. The **interrogate** skill over the diff: two model families, then the four buckets.
4. For any finding that hinges on "this can't happen" or "nothing else calls this", the **blast-radius** skill: find the one fact the change is safe because of and prove it by running code.
5. Verify the author's verification claims against the real artifact when that is cheap (prove it works).
6. Apply the **unslop** skill to the reply. Draft the Act on and Consider findings as review comments in the reply, one draft per finding with its file and line, and nothing from Noted or Dismissed. Never publish them through `gh`; the user posts what they keep.

**Reply:** the intent as you read it, the four buckets, the proven safety fact or its absence, and your verdict: merge, merge after the Act on list, or not yet, with the reason.
