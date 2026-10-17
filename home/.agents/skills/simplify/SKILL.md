---
name: simplify
description: Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Behavior stays identical. Use after writing code and before opening a PR, or for "simplify this", "clean this up", "tighten the diff". Not a bug hunt; that is interrogate.
---

# Simplify

Make the diff smaller and plainer without changing what it does.

## Scope

The changed code only: `git diff <base>...HEAD` on a branch, `git diff` plus untracked files otherwise, or what the user points at. Surrounding code is context to read, not to improve (laziness protocol).

## Lenses

Apply each to every hunk.

- **Reuse.** A helper, type, or utility already in the repo does this. Call it instead. Search before concluding there is none.
- **Simplification.** A branch, flag, wrapper, parameter, or layer that can go: one-caller wrappers, identity pass-throughs, speculative configurability, error handling for impossible states, a boolean pair that is really an enum, an abstraction with one call site.
- **Efficiency.** Work done twice, a lookup inside a loop that could be a map, serialized steps that are independent, an allocation the caller already made. Only when the cleaner shape is also the faster one. No micro-optimizations that cost clarity.
- **Altitude.** Each function reads at one level, orchestration or detail, not both. Names say what. Comments say only a non-obvious why. Phase-narrating comments go.

## Apply

1. List the candidate cleanups with file:line and the lens.
2. Apply the ones that remove something. Skip any that only rearrange the same complexity.
3. Run the existing check for the touched code (tests, typecheck, lint). Behavior unchanged is the bar.
4. Re-read the diff once more as the next maintainer.

## Reply

The cleanups applied, one line each with the lens, and the ones considered and skipped with why. The check you ran and its result.
