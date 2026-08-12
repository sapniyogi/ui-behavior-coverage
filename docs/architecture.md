# Architecture

## Goal

Measure assertion-level behavioral verification in UI component tests.

The MVP deliberately separates three states:

1. **Discovered** — a behavioral contract can be inferred from component source.
2. **Exercised** — a test places the component in the relevant state and performs the triggering interaction.
3. **Verified** — after exercising the behavior, the test explicitly checks the expected observable outcome.

## Pipeline

```text
Component TSX
    |
    v
Behavior extractor
    |
    v
Behavior contracts ------------------+
                                      |
Test TSX                              |
    |                                 |
    v                                 v
Test observation + assertion matcher
    |
    v
Discovered / Exercised / Verified
    |
    v
Coverage scoring + CLI report
```

## Why one package first

The initial repository uses one publishable package with internal boundaries under `src/core`, `src/react`, and `src/cli`. This keeps v0.1 easy to build and test. If the model proves useful, these boundaries can later become separate workspace packages without changing the public concepts.

## First behavior rule

For a native interactive element such as:

```tsx
<button disabled={disabled} onClick={onSave}>Save</button>
```

we infer the contract:

```text
condition: disabled=true
event: click
expected observable: onSave callback is not invoked
```

The analyzer intentionally does not infer this semantic contract from custom `<Button>` components in v0.1 because their behavior is not guaranteed by the HTML platform.

## Current static-analysis limits

The analyzer intentionally does not perform full data-flow or alias analysis. It supports direct bindings such as:

```tsx
<SaveButton disabled onSave={onSave} />
```

and simple same-test `const` object spreads such as:

```tsx
const props = { disabled: true, onSave };
render(<SaveButton {...props} />);
```

Object-spread support is deliberately conservative: unresolved or nested spreads are treated as unknown when they may override a relevant prop, and explicit JSX attributes are applied in source order.

It also supports direct negative call assertions such as:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

These restrictions should be expanded incrementally with false-positive tests for every new inference.
