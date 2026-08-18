---
name: oop-heuristics
description: >
  Domain-modeling heuristics for object-oriented design — software as a computable
  model whose objects must teach the domain. Use when writing code that models
  domain entities (classes, types, value objects), when reviewing or refactoring
  OOP code, or on sight of violations: primitive obsession, anemic or incomplete
  objects, null standing in for domain concepts, mutable domain state, broken
  encapsulation, or God objects.
---

# OOP Heuristics

Software is knowledge expressed in a **computable model** of a problem domain (Church) — not merely instructions turning input into output (Turing). Good software == good model, judged on three axes: **implementative** (how it runs), **descriptive** (how well it communicates), **functional** (how faithfully it represents the domain). These heuristics optimize the descriptive and functional axes: the model must **teach** — someone will read this code later, and it must transmit the domain to them.

An **object** is the *essential representation* of a domain entity, expressed through the **messages** it answers (message = *what* it does; method = *how*). **Essence** is what makes an entity be what it is and not something else. The test (Saint-Exupéry — perfection is when nothing is left to take away): remove a message; if the object still represents its entity, the message wasn't part of its essence and belongs elsewhere. A `Ferrari` survives losing `asHtml()`, so rendering isn't the Ferrari's — keeping it there is coupling.

Change is *essential* to software, not accidental: the domain changes, our understanding changes, our modeling techniques change. Complexity = essential + accidental; every heuristic exists to cut **accidental complexity**, and applies only when it does.

These are **heuristics, not principles**: contextual rules with exceptions (Bob Martin himself concedes the SOLID "principles" are heuristics). No dogma — if a heuristic makes the code harder to understand in context, skip it and say why.

Full grounding — Turing vs Church, the science-vs-engineering debate, development as a learning process, immediate feedback (Bret Victor/TDD), essence, principle vs heuristic — lives in [PHILOSOPHY.md](PHILOSOPHY.md). Read it when the user asks *why*, pushes back on a recommendation, or wants the theory.

## The heuristics

Before/after TypeScript for H1–H6 lives in [EXAMPLES.md](EXAMPLES.md) — read the relevant pair before writing rewrite code in a recommendation.

### H1 — One entity, one object, faithfully

For each entity in the problem domain, exactly one object represents it, and that representation captures its essence. What entities you *see* depends on your observation, domain knowledge, and experience — different readers extract different entities from the same natural-language spec, so confirm the model with the user rather than assume yours is canonical.

- One entity split across several objects → duplication, inconsistency, lost cohesion.
- One object representing several entities (**primitive obsession** — money, email, date range as raw string/number) → it represents none of them well.
- Unmet, H1 yields: ad-hoc solutions, reinvented (flat) wheels, duplicated and error-prone code, non-declarative code, a model that's hard to understand.

**Don't over-model:** `Numerator` and `Denominator` as types make no sense when both are just numbers. A primitive with no invariants and no behavior stays a primitive (a branded type at most).

### H2 — Objects are created complete

Unlike a bridge blueprint, a program has time passing at runtime — so ask *from when* an object represents its entity. Answer: **from the moment it exists**. Setters-before-getters, `init()` methods, fields born `undefined` — all temporal coupling: the model stops teaching how to use it and becomes a puzzle.

A complete object teaches how it's instantiated and whom it relates to, helps the model evolve, and carries no temporal coupling between its messages.

Tips:

1. One primary constructor or factory; every other creation path delegates to it.
2. Instance variables you can't initialize at construction signal the class wants to split in two.
3. Construction involving much "passage of time" → Builder (the Builder is mutable; the built object is complete).
4. A framework demanding empty constructors (e.g. Hibernate) doesn't oblige your domain — isolate that at the infrastructure boundary.

### H3 — Only create valid objects

An object represents its entity **validly from the moment it exists**. If it can't exist in the domain, it can't exist in the model. The object teaches explicitly what it needs and **fails fast** when created wrong — otherwise every consumer validates defensively and the model lies about what's possible.

Tips:

1. Exceptions, not return codes.
2. Validate in a static factory (`create(...)`), not the constructor — the constructor has already allocated the object by the time it runs.
3. Each object validates only its own invariants: an `Invoice` checks its number and date format; the `SalesBook` checks the number is sequential against previous invoices.
4. Pick a validation model: stop-on-first-error (SOFE) for domain/API flows; Notification pattern (collect all errors) for UIs, where users need every problem at once.

### H4 — Null is not a domain concept

`null` is "nothing", and one nothing ends up standing for many different domain entities — not-found, not-applicable, not-yet-loaded, explicitly-empty — indistinguishably. Represent each absence with its own object: the **Null Object Pattern** replaces `if (x === null)` with polymorphism (mechanics in the `oop-patterns` skill).

Null is acceptable at idiomatic language/framework boundaries, for truly optional data with no behavioral difference (an optional middle name), and on measured performance-critical paths.

### H5 — Favor immutable objects

Once complete (H2) and valid (H3), a domain object doesn't change state; when the entity's state changes, create a new object representing the new state. An immutable object is a snapshot you can trust and share — mutation hides *who changed this, when* and adds temporal dependencies.

Mutability is fine for Builders mid-construction, measured hot paths, ORM-managed entities at the infrastructure boundary, and algorithm accumulators where immutability adds complexity without domain benefit.

### H6 — Don't break encapsulation

Objects communicate through messages (what), never by exposing internal structure (how). **Tell, don't ask**: not `if (account.getBalance() >= amount) { account.setBalance(...) }` but `account.withdraw(amount)` — the object owns its behavior. Extracting data to decide outside couples every consumer to the representation and scatters logic that belongs to the object; the model stops teaching and becomes a data bag.

Signals: feature envy (get, compute outside, set back), type-check-then-cast, DTOs masquerading as domain objects, leaked internal collections. Getters for query/display are fine; expose data for serialization/UI at the infrastructure boundary, not in the domain object.

### H7 — Model the architecture in the system itself

Layers, modules, and boundaries should be explicit constructs the compiler/runtime enforces — not folder conventions that erode. Lower priority than H1–H6: it matters in larger systems with real drift risk. Skip it for small projects, still-forming architectures, or frameworks that already enforce boundaries.

## Applying

**Writing new code:** identify the domain entities, then per entity: one faithful object (H1), complete (H2) and valid (H3) from birth, absence explicit (H4), immutable by default (H5), behavior inside — tell, don't ask (H6); in larger systems, boundaries explicit (H7).

**Reviewing code:** check every touched domain object against every heuristic H1–H7; the review is done only when each object is accounted for. Signals by impact: primitive obsession, anemic/incomplete objects, missing validation, null abuse, mutable domain state, feature envy and getter chains, implicit architecture.

Report each finding as:

- **What** — the heuristic and what triggers it
- **Why** — the accidental complexity added, or what the model stops teaching
- **Tradeoff** — what it gains vs what it costs (effort, indirection, verbosity)
- **Recommendation** — concrete, with code per EXAMPLES.md style
- **Severity** — real problem or nitpick; be honest

"H1 suggests wrapping this, but the primitive has no invariants or behavior — a branded type at most" is a valid finding. A heuristic that doesn't clearly improve the code in context doesn't apply; say so explicitly.

## Anti-patterns (in yourself)

Over-modeling (H1 misapplied) · pattern worship — Null Object where an optional check is clearer (H4) · dogmatic immutability (H5) · encapsulation theater (H6) · fighting the framework instead of isolating it at the boundary.
