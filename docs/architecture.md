# Architecture

## Goal

Measure assertion-level behavioral verification in UI component tests.

The analyzer separates three states:

1. **Discovered** — a behavioral contract can be inferred from component or supported framework semantics.
2. **Exercised** — a test establishes the relevant state and performs the triggering interaction.
3. **Verified** — after exercising the behavior, the test explicitly checks the expected observable outcome.

## Pipeline

```text
Component/Test TSX
       |
       v
Import + JSX parsing
       |
       +------ Native HTML provider
       |
       +------ Material UI provider
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

## Provider boundary

Behavior inference runs through providers instead of treating every JSX element as if it had known semantics. The default provider set currently contains `native-html` and `material-ui`.

A provider translates documented platform/framework semantics into deterministic `BehaviorContract` objects. Providers do not execute the UI framework. Material UI support is static: this package does not import or depend on `@mui/material`; provider rules activate only when source imports identify a supported MUI component.

The public `BehaviorProvider` interface allows additional providers to be introduced without changing the scoring model.

## Native HTML behavior

For a native interactive element such as:

```tsx
<button disabled={disabled} onClick={onSave}>Save</button>
```

we infer:

```text
condition: disabled=true
event: click
expected observable: onSave callback is not invoked
```

A similarly named custom `<Button>` is not treated as a native button.

## Material UI behavior

Phase 4 recognizes selected documented Material UI semantics when imports identify `Button` or `Checkbox`.

Examples:

```tsx
import Button from '@mui/material/Button';
import { Checkbox } from '@mui/material';
```

Initial contracts include Button disabled/loading activation suppression and Checkbox disabled suppression plus controlled checked-state transitions.

For a controlled Checkbox:

```tsx
<Checkbox checked={checked} onChange={onChange} />
```

the provider emits directional contracts for `checked=false -> event.target.checked=true` and `checked=true -> event.target.checked=false`.

A callback-presence assertion such as `expect(onChange).toHaveBeenCalled()` is not sufficient verification for this state-transition contract. The matcher currently requires the expected boolean under `event.target.checked`, for example through nested `expect.objectContaining` with `toHaveBeenCalledWith` or `toHaveBeenLastCalledWith`.

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

Object-spread support is conservative: unresolved or nested spreads are treated as unknown when they may override a relevant prop, and explicit JSX attributes are applied in source order.

Suppression verification currently recognizes:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

These restrictions should be expanded incrementally with false-positive tests for every new inference.

## Project discovery

The `scan` command walks a project while ignoring `.git`, `node_modules`, `dist`, and `coverage`, then inspects `*.test.tsx`, `*.test.ts`, `*.spec.tsx`, and `*.spec.ts` files.

A local test file is paired with component source only when all of the following are true:

1. the test has a relative import that resolves to a `.tsx` source file;
2. the import is a runtime import, not `import type`;
3. the imported local identifier is used directly as a JSX tag in that test;
4. named import aliases are not used by the local-source resolver.

All matching tests for a local component file are combined before behavioral status is selected. This prevents one weak test from hiding a stronger verification test while avoiding duplicate counting of the same component behavior across multiple test files.

Phase 4 adds an explicit package-import exception for supported direct Material UI tests. When a test directly renders supported `@mui/material` Button/Checkbox states, the MUI provider can produce contracts without a local wrapper source file.

Project discovery remains conservative. Unsupported package imports, namespace JSX, JavaScript/JSX files, framework-specific module-resolution aliases, and general package-source traversal remain future work.

## Why one package first

The repository remains one publishable package with internal boundaries under `src/core`, `src/providers`, `src/react`, `src/project`, and `src/cli`. These can later become workspace packages if adoption warrants it, without changing the public behavioral-coverage concepts.
