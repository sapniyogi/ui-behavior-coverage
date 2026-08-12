# Codex build specification — v0.1

## Objective

Build the first deterministic MVP of `ui-behavior-coverage`, an npm package that distinguishes UI behavior a test merely exercises from behavior it explicitly verifies.

The first acceptance case is a React component that maps a boolean `disabled` prop to a native `<button disabled>` and maps an `onSave` callback to `onClick`. A test that renders the component disabled and clicks the button but never asserts `onSave` was not called must be reported as `EXERCISED`, not `VERIFIED`.

## Non-goals

Do not add LLM APIs, network calls, Vue support, Storybook integration, Playwright browser execution, source rewriting, auto-fix, or a web dashboard in v0.1.

## Architecture

Keep one npm package initially, with these internal layers:

- `src/core`: model, scoring, reporting
- `src/react`: TSX behavior extraction and test analysis
- `src/cli`: command-line entry point

The architecture should permit future package splitting without requiring it now.

## Behavioral states

Use these project-specific terms:

- `discovered`
- `exercised`
- `verified`

Metrics:

- `Behavior Reach`
- `Behavior Verification`
- `Verification Gap`

Do not copy terminology, prose, figures, prompts, code, or data from research papers.

## First inference rule

Infer a behavior only when a native disabled-capable HTML element directly contains both:

```tsx
<button disabled={disabled} onClick={onSave}>
```

Requirements:

- the native element must be known to have HTML disabled semantics;
- `disabled` must be directly bound to an identifier;
- `onClick` must be directly bound to an identifier;
- do not infer the rule for custom `<Button>` elements.

The resulting behavioral contract should state that when `disabled=true`, click activation should not invoke the bound callback.

## Test matching

Support Jest/Vitest-style `it()` and `test()` callbacks.

Recognize a matching test when it directly renders:

```tsx
<SaveButton disabled onSave={onSave} />
```

Then:

- if no click occurs after render => `discovered`;
- if a click occurs after render and no sufficient assertion occurs afterward => `exercised`;
- if a sufficient callback-suppression assertion occurs after click => `verified`.

Initially sufficient assertions are:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

An identical assertion before the interaction must not qualify the behavior as verified.

## CLI

Support:

```bash
ubc analyze --component path/to/Component.tsx --test path/to/Component.test.tsx
ubc analyze --component ... --test ... --json
```

The text report must make weak-oracle cases obvious and suggest:

```tsx
expect(onSave).not.toHaveBeenCalled();
```

## Acceptance tests

At minimum verify:

1. behavior discovery from native `<button disabled={disabled} onClick={onSave}>`;
2. exercised-but-unverified classification;
3. verified classification;
4. render-only behavior does not count as reached;
5. assertion before interaction does not count as verification;
6. custom `<Button>` does not trigger native semantics;
7. report exposes the Verification Gap.

## Engineering policy

Favor precision over recall in the MVP. Do not add broad heuristics without false-positive tests. Keep analysis deterministic and explainable. Every inference must be traceable to source evidence.
