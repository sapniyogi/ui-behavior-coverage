# ui-behavior-coverage

[![npm version](https://img.shields.io/npm/v/ui-behavior-coverage.svg)](https://www.npmjs.com/package/ui-behavior-coverage)
[![npm downloads](https://img.shields.io/npm/dm/ui-behavior-coverage.svg)](https://www.npmjs.com/package/ui-behavior-coverage)
[![CI](https://github.com/sapniyogi/ui-behavior-coverage/actions/workflows/ci.yml/badge.svg)](https://github.com/sapniyogi/ui-behavior-coverage/actions/workflows/ci.yml)
[![Node](https://img.shields.io/node/v/ui-behavior-coverage.svg)](https://www.npmjs.com/package/ui-behavior-coverage)
[![License](https://img.shields.io/npm/l/ui-behavior-coverage.svg)](LICENSE)

**Static analysis for React tests that distinguishes UI behavior a test reaches from behavior it actually verifies.**

`ui-behavior-coverage` works with React test code, including Testing Library, Jest/Vitest patterns, native controls, and first-class Material UI semantics.

Traditional code coverage asks:

> **Did this code execute?**

`ui-behavior-coverage` asks:

> **Did the test explicitly verify the UI behavior it exercised?**

Current stable release: **`0.1.0`**.

The analyzer is intentionally conservative: unsupported or ambiguous patterns are skipped rather than guessed. UBC is test-quality evidence to review alongside your normal test runner and code coverage, not a replacement for them.

## The problem in 30 seconds

Consider a disabled button:

```tsx
export function SaveButton({ disabled, onSave }) {
  return (
    <button disabled={disabled} onClick={onSave}>
      Save
    </button>
  );
}
```

This test renders the disabled state and interacts with the button:

```tsx
it('handles a disabled button', async () => {
  const onSave = vi.fn();

  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Save' }));
});
```

The behavior was **reached**, but the test never proves that the disabled button suppresses the callback.

A stronger test adds the missing behavioral oracle:

```tsx
it('does not save when disabled', async () => {
  const onSave = vi.fn();

  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSave).not.toHaveBeenCalled();
});
```

UBC distinguishes these cases as **EXERCISED** versus **VERIFIED** behavior.

The repository contains these exact fixtures:

- [weak test](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.weak.test.tsx)
- [verified test](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.verified.test.tsx)
- [component](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.tsx)

## Install and scan

```bash
npm install -D ui-behavior-coverage
npx ui-behavior-coverage scan .
```

JSON output:

```bash
npx ui-behavior-coverage scan . --json
```

Analyze one component/test pair:

```bash
npx ui-behavior-coverage analyze \
  --component src/SaveButton.tsx \
  --test src/SaveButton.test.tsx
```

The shorter binary is also available:

```bash
ubc scan .
```

## What UBC measures

| Metric | Question |
|---|---|
| **Behavior Reach** | Did a test reach or exercise the discovered UI behavior? |
| **Behavior Verification** | Did the test contain an explicit matching oracle for that behavior? |
| **Verification Gap** | How much reached behavior remains unverified? |

A test can therefore pass and contribute to traditional code coverage while still leaving behavior merely **EXERCISED**.

For example:

```tsx
await user.click(checkbox);
expect(onChange).toHaveBeenCalled();
```

proves that a callback happened, but may not prove the expected checked value or callback payload.

A stronger oracle can make the behavior **VERIFIED**:

```tsx
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({
      checked: true,
    }),
  }),
);
```

UBC also recognizes supported observable DOM evidence such as:

```tsx
expect(button).toBeDisabled();
expect(checkbox).toBeChecked();
expect(input).toHaveValue('value');
expect(dialog).toBeVisible();
expect(element).toHaveAttribute('aria-expanded', 'true');
```

## Why this matters for AI-generated tests

AI coding assistants can generate tests that compile, render components, exercise controls, and increase execution coverage while still using weak or incomplete assertions.

UBC is **generation-agnostic**. It does not attempt to determine whether a human or an LLM wrote a test. Instead it independently evaluates the behavioral evidence present in the test suite.

That makes UBC useful as a second layer after AI-generated tests:

```text
AI or human writes tests
        ↓
normal test runner passes
        ↓
traditional code coverage
        ↓
ui-behavior-coverage
        ↓
reached behavior vs explicitly verified behavior
```

## Where UBC fits

UBC complements rather than replaces existing tools:

- **Jest / Vitest** — did the test pass?
- **Istanbul / V8 coverage** — did the code execute?
- **Testing Library** — how is the UI exercised and asserted?
- **Mutation testing** — can injected implementation changes survive?
- **UBC** — which supported UI behaviors were reached, and which were explicitly verified?

Typical uses include reviewing AI-generated tests, auditing mature React test suites for weak oracles, and adding behavioral evidence to test-quality reviews.

## Material UI semantics

Material UI is a first-class semantic provider, not the product boundary. The analyzer also understands supported native React/HTML behavior and follows a conservative subset of real React composition patterns.

UBC recognizes MUI statically from imports; **it does not install or execute `@mui/material`**.

| Capability | `0.1.0` support |
|---|---|
| Native `<button disabled>` callback suppression | ✅ |
| MUI `Button` disabled/loading suppression | ✅ |
| MUI `Button` rendered disabled state | ✅ |
| MUI `Checkbox` disabled + controlled checked behavior | ✅ |
| MUI `Switch` disabled + controlled checked behavior | ✅ |
| standalone MUI `Radio` disabled + selection behavior | ✅ |
| controlled MUI `TextField` callback/value evidence | ✅ |
| MUI native-mode `Select` callback/value behavior | ✅ |
| MUI Input/InputBase/OutlinedInput/FilledInput value state | ✅ conservative |
| MUI Slider public value state | ✅ conservative |
| Dialog/Popover/Menu/Modal public `open` visibility | ✅ conservative |
| explicit public-prop-driven `aria-*` forwarding | ✅ conservative |
| React Admin/RHF-style `useInput` / `useController` form state | ✅ limited |
| local wrappers / simple prop forwarding / `styled()` wrappers | ✅ limited |
| barrel exports and named aliases | ✅ |
| TypeScript path aliases | ✅ |
| configurable render-helper normalization | ✅ |
| statically safe local test render-helper reach | ✅ conservative |
| Testing Library `rerender()` state evidence | ✅ conservative |
| target-aware Testing Library assertion correlation | ✅ conservative |
| dynamic `data-testid` correlation when target uniqueness is proven | ✅ conservative |
| suppression of internal implementation-handler contracts | ✅ |
| non-native MUI `Select` popup interaction semantics | ❌ |
| arbitrary hooks/context/effects/state machines | ❌ |
| browser layout, portals, computed CSS, animation timing | ❌ |
| arbitrary custom form hooks | ❌ |

“Conservative” means the analyzer requires a traceable public condition/evidence chain and leaves unsupported or ambiguous cases unclassified instead of guessing framework behavior.

Detailed boundaries:

- [Provider semantics](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/providers.md)
- [Architecture](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/architecture.md)

## Real React composition

Project scanning can follow a useful subset of production composition patterns:

```text
public component prop
       ↓
local wrapper / barrel / alias
       ↓
simple prop forwarding or known normalization
       ↓
native or supported framework component
       ↓
semantic UI contract
       ↓
test render/setup/rerender
       ↓
matching interaction and assertion
```

Supported paths include conservative boolean expressions, JSX spreads with override safeguards, recursive local component composition, `useThemeProps({ props, ... })`, selected React Hook Form / React Admin bindings, barrel exports, TypeScript path aliases, statically safe render helpers, and Testing Library `rerender()` evidence.

Discovery telemetry is included in project reports so that “zero discovered behaviors” can be distinguished from “the scanner could not resolve the relevant component/test surface.”

## Precision-first contract extraction

UBC tries to describe **observable component behavior**, not implementation details.

For example:

```tsx
function handleClick() {
  onOpenChange?.(true);
}

<Button disabled={disabled} onClick={handleClick} />
```

The local `handleClick` function is an implementation detail. The meaningful consumer-facing behavior is associated with the public callback such as `onOpenChange`.

`0.1.0` includes precision hardening that suppresses internal implementation-handler contracts where exposing them would create unreachable or misleading public test obligations.

Callback payload contracts are also emitted conservatively: UBC does not assume that a public callback receives a framework event payload when a local wrapper transforms or replaces it.

## Versioned JSON

`--json` output is versioned:

```json
{
  "schemaVersion": "1",
  "toolVersion": "0.1.0",
  "reportType": "project",
  "summary": {
    "discovered": 9,
    "exercised": 2,
    "verified": 1,
    "behaviorReach": 22.2,
    "behaviorVerification": 11.1,
    "verificationGap": 11.1
  },
  "report": {}
}
```

New automation should check `schemaVersion` and use `summary` for aggregate metrics and `report` for the complete analysis.

See [JSON report schema v1](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/json-schema-v1.md).

## Programmatic API

```ts
import {
  analyzeProject,
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
} from 'ui-behavior-coverage';

const report = analyzeProject('.');
```

The package is CommonJS-compatible and can also be loaded by ESM consumers through Node interoperability.

The public API also exposes provider, project-discovery, scoring, reporting, MUI semantic extraction, and Box design-guidance helpers.

Because the project remains in the SemVer `0.x` series, public APIs may continue to evolve. Material compatibility changes will be documented, and incompatible machine-readable JSON changes will use a new schema version.

## External evaluation

UBC has been evaluated against pinned scopes from independent open-source React applications rather than only synthetic fixtures.

Phase 8A expanded external validation across multiple React and Material UI projects. Phase B then used additional pinned production repositories to test the analyzer on previously unseen application structures.

A pinned `cytoscape/cytoscape-web` evaluation exposed four conservative-classification limitations that were recorded before analyzer changes, converted into regression tests, and corrected:

1. internal implementation handlers surfaced as consumer contracts;
2. render-state reach hidden behind safe local test helpers;
3. state changes performed through Testing Library `rerender()`;
4. exact DOM-property assertions whose target used a dynamic production `data-testid`.

For that pinned Cytoscape snapshot, the corrected analyzer produced:

| Metric | Result |
|---|---:|
| consumer-facing contracts | 12 |
| reached contracts | 8 |
| verified contracts | 1 |
| Behavior Reach | 66.7% |
| Behavior Verification | 8.3% |
| Verification Gap | 58.4 percentage points |

These figures are specific to that pinned repository snapshot and supported analyzer surface. They are **not** a universal accuracy rate.

Evaluation records:

- [Phase 8A target-aware precision](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-15-phase8a-target-aware-precision.md)
- [Phase 8A workspace/self-import resolution](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-15-phase8a-workspace-self-imports.md)
- [Alpha precision audit](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-13-alpha-precision-audit.md)
- [Phase B Cytoscape adjudication](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-24-phase-b-cytoscape-adjudication.md)

The release strategy remains precision-first: unsupported or ambiguous behavior is left unclassified rather than lowering inference requirements just to increase finding counts.

## Known boundaries

UBC does not currently model every browser or framework behavior. Important unsupported areas include non-native MUI `Select` popup interaction semantics, arbitrary hooks/context/effects/state machines, browser layout and portals, computed CSS and animation timing, and arbitrary custom form hooks.

If a behavior cannot be resolved conservatively, the analyzer prefers to leave it unclassified.

## CLI exit codes

```text
0  analysis completed successfully
1  invalid command or arguments
2  analysis/filesystem failure
```

Verification gaps do not fail CI by default in `0.1.0`. Threshold-based CI policy is intentionally deferred until report semantics and external validation cover a broader range of real-world projects.

## Design-system guidance

Visual policy is intentionally separate from behavioral verification. The current design-guidance API includes MUI `Box` `sx.borderRadius` analysis.

See [Design-system guidance](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/design-guidance.md).

## Release quality

The repository validates:

```bash
npm run check
npm test
npm run pack:check
```

`npm test` includes a clean packed-consumer smoke path that installs the generated tarball into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

See [Release procedure](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/release.md).

## Research context and independence

This project is motivated by research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles. It is an independent implementation with its own terminology and architecture.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Contributing and security

- [CONTRIBUTING.md](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/CONTRIBUTING.md)
- [SECURITY.md](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/SECURITY.md)

## License

MIT.
