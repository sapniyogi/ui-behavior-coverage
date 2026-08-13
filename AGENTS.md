# Agent engineering rules

## Product invariant

`ui-behavior-coverage` measures whether UI behavior is *verified*, not merely whether code is executed.
Do not collapse the states `discovered`, `exercised`, and `verified` into ordinary code coverage.

## v0.1 boundaries

- React/TSX only.
- Deterministic static analysis only; no LLM calls.
- Jest/Vitest-style test syntax.
- Testing Library-style `render()` and click interaction.
- First supported contract: native disabled controls suppress a directly-bound click callback.
- Prefer low false-positive rates over broad inference.

## Clean-room/IP rule

Implement concepts independently. Do not copy prose, figures, prompts, datasets, supplemental artifacts, or source code from research papers unless the material has a separately verified license permitting reuse.
Use our terminology: `discovered`, `exercised`, `verified`, `Behavior Reach`, `Behavior Verification`, and `Verification Gap`.

## Quality gates

Every new behavior inference rule must include:

1. one positive discovery fixture;
2. one false-positive guard;
3. one exercised-but-unverified test;
4. one verified test;
5. a deterministic explanation string.

Run `npm test` before committing.

## Project discovery guardrails

- Project scanning may only pair a test with a component when a runtime relative import resolves to TSX and that imported identifier is rendered directly in JSX.
- Skip type-only imports, package imports, unresolved files, namespace JSX, and aliased named imports until explicit support and false-positive tests exist.
- Group all matching tests for one component before calculating its final behavioral status; do not double-count a behavior because multiple test files import the same component.
- CI must run type-checking, the complete test suite, and npm package dry-run validation.
