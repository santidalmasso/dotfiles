---
name: oop-patterns
description: >
  Identify and suggest design patterns based on intent, not structure, while actively resisting over-design.
  Use this skill whenever Claude encounters code with scattered conditionals on type/state, null-checking
  patterns, global singleton access, or state machine behavior. Also trigger when the user explicitly asks
  about design patterns, refactoring toward patterns, or when reviewing code that could benefit from
  replacing if/else chains with polymorphism. This skill covers: Null Object Pattern, Double Dispatch,
  State Pattern, and Singleton (as a critique). Even if the user doesn't mention "pattern" — if you see
  repeated conditionals on collaborator type or state transitions buried in if/else, consult this skill.
---

# OOP Patterns

## Philosophy

Every pattern emerges from three forces:

1. **Removing duplicated code** — duplication means a missing abstraction (an object we haven't found yet)
2. **Replacing if with polymorphism** — conditionals on type or state are procedural; polymorphism is declarative
3. **Replacing subclassification with composition** — most patterns are this, ~90% of GoF

Plus contextual judgment. Patterns are **discovered in code, not imposed on it.** The moment you
design _toward_ a pattern, you're likely over-engineering.

> "Learn them, internalize them, and forget them. Let them emerge. Never impose them."

Patterns give us a **shared language** to talk about recurring design situations — that's their
greatest contribution. The structure diagrams are the least important part. What matters is the
**name** (gives us vocabulary), the **intent** (tells us _when_), and **known uses** (patterns
are discovered, not invented).

**This skill matches patterns by intent, not by structure.** If the intent doesn't match the
problem, the pattern doesn't apply — no matter how similar the code looks structurally.

### Relationship to oop-heuristics

This skill builds on top of the oop-heuristics skill. Heuristics identify _what's wrong_;
patterns suggest _how to fix it._ Specifically:

- oop-heuristics **H4** (Don't use null) → **Null Object Pattern**
- oop-heuristics **H5** (Favor immutability) + **H6** (Don't break encapsulation) → **State Pattern** respects both
- oop-heuristics **H1** (One entity, one object) → **Double Dispatch** makes type relationships explicit

---

## The Anti-Over-Engineering Filter

Before suggesting ANY pattern, pass it through this filter:

1. **Is there actual duplication or repeated conditionals?** If the if/else exists only once
   and is unlikely to grow, a pattern adds indirection without benefit. Leave it.
2. **Does the intent match?** Don't force a pattern because the structure looks similar.
   State Pattern is for objects whose behavior changes with internal state — not for every enum switch.
3. **Is the domain better represented?** After applying the pattern, does the model teach more
   about the domain? If it just adds classes without clarity, skip it.
4. **What's the cost?** More classes, more indirection, more files. Is that cost justified
   by the problem's actual complexity?

If any answer is "no" → **don't suggest the pattern.** Say explicitly why it doesn't apply.

---

## Patterns

### Null Object Pattern

**Intent:** Eliminate conditionals on null/absence by providing a polymorphic object that
represents "nothing" with real behavior.

**When it applies:**

- Multiple `if (x !== null)` / `if (x != undefined)` checks scattered across consumers
- Null represents a meaningful domain concept (no discount, no logger, guest user)
- The "absence" case has default behavior that consumers currently duplicate

**Relates to:** oop-heuristics H4 (Don't use null to represent domain concepts)

**How to apply:**

1. Create a polymorphic hierarchy with an abstraction for the concept
2. Move the "present" behavior into a concrete implementation
3. Move the "absent/null" behavior into a Null Object implementation
4. Name both implementations after what they represent in the domain
5. Replace the null checks with polymorphic message sends

**Example (TypeScript):**

```typescript
// ❌ Null checks scattered across consumers
function processOrder(order: Order, logger: Logger | null) {
  if (logger !== null) logger.log("Processing order");
  // ... process ...
  if (logger !== null) logger.log("Order complete");
}

// ✅ Null Object — polymorphism replaces conditionals
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }
}

class NullLogger implements Logger {
  log(_message: string): void {
    // intentionally does nothing — represents "no logging"
  }
}

function processOrder(order: Order, logger: Logger) {
  logger.log("Processing order");
  // ... process ...
  logger.log("Order complete");
}
```

**Don't apply if:**

- The null check exists in only one place — the indirection isn't worth it
- The absence case is truly exceptional (throw, not handle)
- A simple default value or optional chaining (`?.`) is clearer in context
- The "null behavior" would be confusing or hide real errors

---

### Double Dispatch

**Intent:** Resolve behavior that depends on the types of **two** objects — the receiver and
a collaborator — without using conditionals on the collaborator's type.

**When it applies:**

- You see `if (param instanceof X)` or `switch (param.type)` — conditionals on a **parameter's** type
- The behavior varies based on the combination of receiver + collaborator types
- The number of combinations (N×M) is manageable and domain-meaningful

**Relates to:** oop-heuristics H1 (One entity, one object — each type combination gets explicit representation)

**How to apply:**

1. Identify the `if` that checks the collaborator's type
2. Replace it with a polymorphic message to the collaborator
3. The collaborator calls back to the receiver with a more specific message (including its type in the name)
4. Name the messages after what they mean in the domain

**Key insight:** Double Dispatch doesn't reduce complexity (N×M methods still exist).
It **distributes responsibility** correctly and makes the model teach you the relationships.

**Example (TypeScript):**

```typescript
// ❌ Conditional on collaborator type
class NumberExpression {
  plus(other: Expression): Expression {
    if (other instanceof NumberExpression) {
      return new NumberExpression(this.value + other.value);
    }
    if (other instanceof FractionExpression) {
      return new FractionExpression(
        this.value * other.denominator + other.numerator,
        other.denominator,
      );
    }
    throw new Error("Unknown expression type");
  }
}

// ✅ Double Dispatch — each type knows how to combine with each other
interface Expression {
  plus(other: Expression): Expression;
  plusNumber(number: NumberExpression): Expression;
  plusFraction(fraction: FractionExpression): Expression;
}

class NumberExpression implements Expression {
  constructor(readonly value: number) {}

  plus(other: Expression): Expression {
    return other.plusNumber(this); // dispatch to collaborator
  }

  plusNumber(number: NumberExpression): Expression {
    return new NumberExpression(this.value + number.value);
  }

  plusFraction(fraction: FractionExpression): Expression {
    return new FractionExpression(
      this.value * fraction.denominator + fraction.numerator,
      fraction.denominator,
    );
  }
}
```

**Don't apply if:**

- The conditional is on a single collaborator type and unlikely to grow
- N×M is large and the combinations don't all have distinct domain meaning
- Meta-programming (e.g., method dispatch tables) would be simpler in the language you're using
- The types involved don't belong to the same domain — cross-domain dispatch is questionable

---

### State Pattern

**Intent:** Allow an object to alter its behavior when its internal state changes, making it
appear to change its class. It's a **finite state machine** expressed through polymorphism.

**When it applies:**

- An object has behavior that varies based on an internal state field
- You see `if (this.state === "X")` or `switch (this.status)` inside methods
- State transitions have rules (not every state can transition to every other state)
- The object's lifecycle is a meaningful part of the domain

**Relates to:** oop-heuristics H5 (Favor immutability — state transitions can produce new objects)
and H6 (Don't break encapsulation — the object manages its own state transitions)

**How to apply:**

1. Identify the states (each value of the state field becomes a class)
2. Create a state interface with the methods whose behavior varies by state
3. Each concrete state implements the behavior for that state
4. The context object delegates to its current state
5. State transitions are handled by the state objects themselves (they know what's next)

**Implementation variants:**

- **Without Double Dispatch:** Context holds a state reference, delegates calls. Simpler.
- **With Double Dispatch:** State transitions call back to the context. More explicit about transitions.
- **Immutable variant:** Each transition returns a new context with the new state. Aligns with H5.

**Example (TypeScript):**

```typescript
// ❌ State conditionals scattered through the object
class Order {
  private status: "draft" | "confirmed" | "shipped" = "draft";

  confirm(): void {
    if (this.status !== "draft") throw new Error("Can only confirm drafts");
    this.status = "confirmed";
  }

  ship(): void {
    if (this.status !== "confirmed")
      throw new Error("Can only ship confirmed orders");
    this.status = "shipped";
  }

  cancel(): void {
    if (this.status === "shipped")
      throw new Error("Cannot cancel shipped orders");
    this.status = "draft";
  }
}

// ✅ State Pattern — each state is an explicit object
interface OrderState {
  confirm(order: Order): OrderState;
  ship(order: Order): OrderState;
  cancel(order: Order): OrderState;
}

class DraftOrder implements OrderState {
  confirm(_order: Order): OrderState {
    return new ConfirmedOrder();
  }
  ship(_order: Order): OrderState {
    throw new Error("Cannot ship a draft order");
  }
  cancel(_order: Order): OrderState {
    return new DraftOrder(); // already draft
  }
}

class ConfirmedOrder implements OrderState {
  confirm(_order: Order): OrderState {
    throw new Error("Already confirmed");
  }
  ship(_order: Order): OrderState {
    return new ShippedOrder();
  }
  cancel(_order: Order): OrderState {
    return new DraftOrder();
  }
}

class ShippedOrder implements OrderState {
  confirm(_order: Order): OrderState {
    throw new Error("Already shipped");
  }
  ship(_order: Order): OrderState {
    throw new Error("Already shipped");
  }
  cancel(_order: Order): OrderState {
    throw new Error("Cannot cancel shipped order");
  }
}
```

**Don't apply if:**

- There are only 2 states with trivial behavior differences — a boolean flag is fine
- The state doesn't represent a domain lifecycle (it's just a configuration toggle)
- The transitions are simple and unlikely to grow in complexity
- The overhead of multiple state classes obscures what is actually a simple flow

---

### Singleton (Critique)

**Intent (as documented):** Ensure a class has only one instance and provide global access to it.

**Why this is almost always wrong:**

The real questions to ask before using a Singleton:

1. **Why must there be only one instance?** Often there's no real constraint — it's just convenience.
2. **Why must the class itself enforce this?** Singletons conflate object creation with object behavior.
3. **Why must it be globally accessible?** Global access creates hidden coupling everywhere.

**Problems:**

- **Global coupling:** Every consumer is coupled to the Singleton. Invisible dependencies.
- **Testing difficulty:** Can't substitute, can't isolate, can't run tests in parallel.
- **GC stress:** In languages with generational GC (most modern ones), long-lived objects
  get promoted to old generation and stress collection. Singleton made sense in C for memory
  fragmentation — it doesn't in GC'd languages.
- **Configuration rigidity:** What if you later need two instances? The pattern fights you.

**When Singleton is (maybe) acceptable:**

- True hardware constraints (one physical device, one connection pool with hard limits)
- Language-level constants or registry objects that are genuinely singular
- Even then, prefer dependency injection over global access

**What to suggest instead:**

- Pass the dependency explicitly (constructor injection, parameter)
- Let the composition root / DI container manage the lifecycle
- If it must be "one instance," make that a deployment decision, not a class-level constraint

**Don't suggest Singleton.** When you see Singleton in existing code, flag the coupling
and testing issues. Suggest injection as an alternative. Be pragmatic — if the Singleton
is deeply embedded and works, don't push a refactor unless it's actively causing problems.

---

## How to Apply This Skill

### Proactive detection — signals to watch for

| Signal in code                                   | Candidate pattern  | Verify intent before suggesting                       |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------- |
| Multiple `if (x != null)` on same concept        | Null Object        | Is the absence a domain concept with behavior?        |
| `if (param instanceof X)` / `switch(param.type)` | Double Dispatch    | Does behavior depend on receiver × collaborator type? |
| `if (this.state === "X")` in multiple methods    | State              | Is there a real lifecycle/FSM in the domain?          |
| `SomeClass.getInstance()` / global access        | Singleton critique | Flag coupling, suggest injection                      |

### When suggesting a pattern

1. **State the intent match:** "This looks like [pattern] because [intent alignment]"
2. **Show the signal:** Point to the specific code that triggered the suggestion
3. **Show before/after:** Minimal transformation, not a full rewrite
4. **State the "don't apply if":** Always include when it would be over-engineering
5. **Be honest about cost:** More classes, more indirection — is it worth it here?

### When NOT to suggest a pattern

- The conditional exists once and is unlikely to grow → leave it
- The code is infrastructure/glue, not domain logic → patterns are for domain modeling
- The "fix" would add more accidental complexity than it removes
- The user didn't ask and the code works fine with its current structure

Say explicitly: "This could technically be a [pattern], but in this context it would be
over-engineering because [reason]." That's a valid and valuable recommendation.
