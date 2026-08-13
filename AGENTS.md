# Agent engineering rules

## Product invariant

`ui-behavior-coverage` measures whether UI behavior is *verified*, not merely whether code is executed.
Do not collapse the states `discovered`, `exercised`, and `verified` into ordinary code coverage.
Visual/design-system guidance is a separate signal family and must not be mixed into Behavior Reach or Behavior Verification.

## Current boundaries

- React/TSX only.
- Deterministic static analysis only; no LLM calls.
- Jest/Vitest-style test syntax.
- Testing Library-style `render()` plus supported user interactions.
- Built-in providers: native HTML and selected Material UI contracts.
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

- Pair a local test with component source only when a runtime relative import resolves to TSX and that imported identifier is rendered directly in JSX.
- Skip type-only imports, unresolved files, namespace JSX, unsupported package imports, and unsupported aliases until explicit support and false-positive tests exist.
- Supported framework package imports may be handled only by a framework-specific provider with explicit import recognition.
- Group all matching tests for one component before calculating its final behavioral status; do not double-count a behavior because multiple test files import the same component.
- CI must run type-checking, the complete test suite, and npm package dry-run validation.

## Behavior-provider guardrails

- UI-framework semantics must come from a framework-specific provider; never infer MUI behavior from a capitalized JSX name alone.
- A provider must identify framework components from runtime imports before assigning framework semantics.
- Do not add a runtime dependency on a supported UI framework unless execution of that framework becomes an explicit product requirement.
- Framework behavior rules must be tied to documented public API semantics and have false-positive tests for similarly named custom components.
- Strong-oracle verification must validate the documented outcome, not merely callback invocation.
- For checked-state and value-change contracts, a callback-presence assertion alone remains `EXERCISED`.
- Non-native MUI Select must not be treated as a native `selectOptions` interaction until a dedicated menu-interaction rule exists.
- Keep providers deterministic and explainable; optional semantic/LLM inference belongs in a separate later layer.

## Design-guidance guardrails

- Design observations and policy results are not behavioral coverage results.
- Only infer framework style semantics when framework imports and supported syntax identify them deterministically.
- Numeric MUI `sx.borderRadius` values are theme multipliers; do not present default-theme pixel values as guaranteed runtime pixels when a custom theme may override `shape.borderRadius`.
- Do not guess through `sx` callbacks, arrays, unresolved spreads, `styled()` definitions, theme overrides, or external CSS until explicit resolution support and false-positive tests exist.
- Prefer token-level rules (for example allowed radius multipliers) over hard-coded pixel assumptions when application theme data is unavailable.
