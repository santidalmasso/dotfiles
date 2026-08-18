# Philosophy — why these heuristics exist

The grounding for [`oop-heuristics`](SKILL.md). Read this when the user asks *why*, challenges a recommendation, or wants the theory behind the rules.

## What is software?

Software has no single definition — like a car, which is a work tool to a taxi driver and a product to a salesman. Two definitions matter here:

> A set of instructions that, given some input, produces some output. — **Alan Turing**

Under this view, good software means prioritizing the machine: performance, resource usage, good instructions. It dominated when processor cycles and memory were scarce.

> Knowledge expressed in a **computable model** of a **problem domain** of reality. — **Alonzo Church**

A model is a representation of what we're modeling — built to understand, study, teach, and predict it. Models need a language; declarative models express the **"what"**. A *computable* model expresses both the "what" and the "how", and its language is a programming language, because the model must also run. The model lives in the source code.

If software is a model, then **good software == good model**. A good computable model is good on three axes:

- **Implementative** — how it runs in its technical environment
- **Descriptive** — how well the model is described; how understandable it is
- **Functional** — how faithfully it represents the domain

The heuristics optimize the descriptive and functional axes.

## Science or engineering?

- Abelson & Sussman (MIT 6.001, 1986): computer science is not a science.
- **Fred Brooks**: "Anything that calls itself a science, isn't." Both build — the scientist builds to learn; the engineer learns to build.
- The term "software engineering" is attributed to **Margaret Hamilton**, to distinguish the discipline from hardware and other engineering.
- **Dijkstra** was scathing: software engineering "has accepted as its charter 'how to program if you cannot'"; a program is really a formula derived by symbol manipulation ([EWD1305](http://www.cs.utexas.edu/users/EWD/transcriptions/EWD13xx/EWD1305.html)).
- **Yourdon**: building working software systems is not a "science" — so-called computer scientists tell us our systems are directed graphs or finite automata, pronouncements "more relevant to a Zen master" than to building useful, maintainable systems. What's needed is a set of practical methods that deal with the error-prone nature of project staff, users, maintainers, and the development process — *that* is software engineering.
- **Billy Vaughn Koen** argues it *is* an engineering (Real Software Engineering).
- **David Farley** (Modern Software Engineering): software development is a process of discovery and exploration, so engineers must become experts at *learning* — and humanity's best approach to learning is science. Be pragmatic in applying the scientific method.

> "In science, if you know what you are doing, you should not be doing it. In engineering, if you do not know what you are doing, you should not be doing it." — **Richard Hamming**

## Development is a learning process

It is **fundamental** that our models **teach us**, because time passes — at execution time and across development. On a team, knowledge is transmitted over time: one developer writes something, and sooner or later another will read it.

If development is a learning process, it implies:

- Being **iterative**
- Being **incremental**
- Knowledge is generated from **concrete facts**
- Generated knowledge must be **organized**

The problem domain is usually specified in ambiguous, contextual natural language — so development means *disambiguating and decontextualizing* domain knowledge.

**Change is an essential characteristic of software, not accidental**, because: the problem domain changes, our understanding of it changes, and the way we model what we understand changes. Therefore models must be easy to understand, easy to evolve, and must minimize accidental complexity:

> Complexity = Essential Complexity + Accidental Complexity

## Immediate feedback (Bret Victor, "Inventing on Principle")

We play at being computers — running the program in our heads instead of letting the machine execute it. That's madness: we make mistakes and get tired. Spend that energy building new models instead. Watching how something actually runs builds **intuition — a cache of knowledge**. **Immediate feedback is fundamental to learning**: it accelerates it and shows whether something works. This is the idea behind TDD. (All of Bret Victor's talks: https://worrydream.com/Home2011/)

## What is an object?

The **essential representation** of an entity of the problem domain, realized through the **messages** it knows how to answer. A **message** is *what* an object does; a **method** is *how* it does it.

**Essence** is what makes something be what it is and not something else. It's hard to determine what is essential, but easy to spot what *isn't*:

> Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away. — **Antoine de Saint-Exupéry**

The test: given a `Ferrari` with `openTrunk()`, `accelerate()`, `turnOff()`, `turnOn()`, `asHtml()` — remove `asHtml()`. Does it still represent the Ferrari? Yes — so that message was never part of its essence. Behavior placed on an object where it doesn't belong generates **coupling**.

## Principle vs heuristic

A **principle** (Oxford) is a fundamental truth or proposition serving as the foundation for a system of belief or chain of reasoning — if it didn't hold, it wouldn't be a principle. A **heuristic** provides strategies, methods, and criteria for solving problems through creativity and lateral thinking — help toward the most effective solution for the problem *the individual is analyzing*.

A heuristic is not a fundamental truth. It is a **rule that must be analyzed contextually** — it has exceptions, and it doesn't always pay to use it.

Bob Martin himself, defining the SOLID "principles", says a principle is good advice but not a pure truth nor a rule — principles that aren't principles; he even calls them heuristics. We don't care about marketing or dogmatic thinking. We want **critical thinking**.
