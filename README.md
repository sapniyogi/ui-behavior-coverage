# ui-behavior-coverage

Behavioral verification coverage for React component tests, with first-class Material UI semantics.

Traditional code coverage asks **“did this code execute?”** `ui-behavior-coverage` asks a different question:

> **Did the test explicitly verify the UI behavior it exercised?**

> **Current stable release: `0.1.0`.** The analyzer is intentionally conservative. Unsupported or ambiguous patterns are skipped rather than guessed. Treat findings as test-quality evidence to review, not as a replacement for test execution or browser automation.

## Why this matters for AI-generated tests

AI coding assistants can generate tests that compile, render components, exercise controls, and increase traditional execution coverage while still providing weak evidence that the intended UI outcome is correct.

For example, a generated or human-written test may click a checkbox and assert only that *some* callback occurred:

```tsx
await user.click(checkbox);
expect(onChange).toHaveBeenCalled();
```

That proves that code executed, but it does not prove the expected checked value, callback payload, rendered state, or other observable behavior.

`ui-behavior-coverage` is **generation-agnostic**. It does not attempt to determine whether a human or an LLM wrote a test. Instead, it separates three questions:

```text
Code coverage:
Did the implementation execute?

Behavior Reach:
Did the test exercise the UI behavior?

Behavior Verification:
Did the test explicitly prove the expected outcome?
```

This makes the tool useful for reviewing both human-authored and AI-generated React test suites, especially when passing tests or high line coverage can hide weak or missing behavioral assertions.

## Install and scan

Install the stable release:

```bash
npm install -D ui-behavior-coverage
```

Scan a project:

```bash
npx ui-behavior-coverage scan .
```

JSON output:

```bash
npx ui-behavior-coverage scan . --json
```

Analyze a single component/test pair:

```bash
npx ui-behavior-coverage analyze \
  --component src/SaveButton.tsx \
  --test src/SaveButton.test.tsx
```

The shorter installed binary is also available:

```bash
ubc scan .
```

## What it measures

* **Behavior Reach** — discovered behaviors that tests actually reach or exercise.
* **Behavior Verification** — discovered behaviors with an explicit matching oracle.
* **Verification Gap** — Behavior Reach minus Behavior Verification: behavior is exercised but its expected outcome is not explicitly proven.

For example, this reaches a controlled checkbox transition but proves only that *some* callback occurred:

```tsx
await user.click(checkbox);
expect(onChange).toHaveBeenCalled();
```

That remains **EXERCISED**.

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

The same principle applies to observable DOM state such as:

```tsx
expect(button).toBeDisabled();
expect(checkbox).toBeChecked();
expect(input).toHaveValue('value');
expect(dialog).toBeVisible();
expect(element).toHaveAttribute('aria-expanded', 'true');
```

Equivalent exact DOM-property assertions can also provide evidence when the analyzer can safely correlate them with the behavior target:

```tsx
expect(button.disabled).toBe(true);
```

## Material UI semantics

Material UI is a first-class semantic provider, not the product boundary. The analyzer also understands supported native React/HTML behavior and follows a conservative subset of real React composition patterns.

The analyzer recognizes MUI statically from imports; **it does not install or execute `@mui/material`**.

| Capability                                                         | `0.1.0` support |
| ------------------------------------------------------------------ | --------------- |
| Native `<button disabled>` callback suppression                    | ✅               |
| MUI `Button` disabled/loading suppression                          | ✅               |
| MUI `Button` rendered disabled state                               | ✅               |
| MUI `Checkbox` disabled + controlled checked behavior              | ✅               |
| MUI `Switch` disabled + controlled checked behavior                | ✅               |
| standalone MUI `Radio` disabled + selection behavior               | ✅               |
| controlled MUI `TextField` callback/value evidence                 | ✅               |
| MUI native-mode `Select` callback/value behavior                   | ✅               |
| MUI Input/InputBase/OutlinedInput/FilledInput value state          | ✅ conservative  |
| MUI Slider public value state                                      | ✅ conservative  |
| Dialog/Popover/Menu/Modal public `open` visibility                 | ✅ conservative  |
| explicit public-prop-driven `aria-*` forwarding                    | ✅ conservative  |
| React Admin/RHF-style `useInput` / `useController` form state      | ✅ limited       |
| local wrappers / simple prop forwarding / `styled()` wrappers      | ✅ limited       |
| barrel exports and named aliases                                   | ✅               |
| TypeScript path aliases                                            | ✅               |
| configurable render-helper normalization                           | ✅               |
| statically safe local test render-helper reach                     | ✅ conservative  |
| Testing Library `rerender()` state evidence                        | ✅ conservative  |
| target-aware Testing Library assertion correlation                 | ✅ conservative  |
| dynamic `data-testid` correlation when target uniqueness is proven | ✅ conservative  |
| suppression of internal implementation-handler contracts           | ✅               |
| non-native MUI `Select` popup interaction semantics                | ❌               |
| arbitrary hooks/context/effects/state machines                     | ❌               |
| browser layout, portals, computed CSS, animation timing            | ❌               |
| arbitrary custom form hooks                                        | ❌               |

“Conservative” means the analyzer requires a traceable public condition/evidence chain and leaves unsupported or ambiguous cases unclassified instead of guessing framework behavior.

Detailed provider and architecture boundaries:

* [Provider semantics](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/providers.md)
* [Architecture](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/architecture.md)

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

Supported production-oriented paths include:

* conservative boolean expressions;
* JSX spreads with override safeguards;
* recursive local component composition;
* `useThemeProps({ props, ... })`;
* selected React Hook Form / React Admin bindings;
* barrel exports and TypeScript path aliases;
* target-aware correlation between production behavior and Testing Library evidence.

Test analysis can also propagate render-state reach through statically safe local helper functions when the helper contains a single unconditional `render(...)` path.

For example:

```tsx
const setup = () => {
  render(<ExampleDialog open={true} />);
};

test('shows dialog content', () => {
  setup();
});
```

The analyzer can recognize that `open=true` was reached without treating arbitrary helper control flow as executable evidence.

Testing Library `rerender()` can similarly establish additional reached states:

```tsx
const { rerender } = render(
  <ExampleDialog open={true} />
);

rerender(
  <ExampleDialog open={false} />
);
```

Both safely resolvable states can contribute to Behavior Reach.

Discovery telemetry is included in project reports so that:

```text
zero discovered behaviors
```

can be distinguished from:

```text
the scanner could not resolve the relevant component/test surface
```

## Precision-first contract extraction

`ui-behavior-coverage` attempts to describe **observable component behavior**, rather than implementation details.

For example, given:

```tsx
function handleClick() {
  onOpenChange?.(true);
}

<Button
  disabled={disabled}
  onClick={handleClick}
/>
```

the local function `handleClick` is an implementation detail. The meaningful consumer-facing behavior is associated with the public callback such as `onOpenChange`.

`0.1.0` incorporates precision hardening that suppresses internal implementation-handler contracts where exposing them would create unreachable or misleading public test obligations.

Similarly, callback payload contracts are emitted conservatively. A callback is not assumed to receive an underlying DOM/MUI event payload if a local wrapper transforms or replaces that payload before invoking the public callback.

## Versioned JSON

`--json` output has been versioned since the first public release:

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

Schema v1 preserves the raw report fields at the top level for compatibility with earlier CLI output.

New automation should:

1. check `schemaVersion`;
2. use `summary` for aggregate metrics;
3. use `report` for the complete analysis.

Incompatible machine-readable changes require a new schema version.

See:

[JSON report schema v1](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/json-schema-v1.md)

## Programmatic API

The package is CommonJS-compatible and can also be loaded by ESM consumers through Node interoperability:

```ts
import {
  analyzeProject,
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
} from 'ui-behavior-coverage';

const report = analyzeProject('.');
```

The public API also exposes provider, project-discovery, scoring, reporting, MUI semantic extraction, and Box design-guidance helpers.

Because the project remains in the SemVer `0.x` series, public APIs may continue to evolve. Material compatibility changes will be documented, and incompatible machine-readable JSON changes will use a new schema version.

## Box and design-system guidance

Visual policy remains intentionally separate from behavioral verification.

The current design-guidance API starts with MUI `Box` `sx.borderRadius`:

```tsx
<Box sx={{ borderRadius: 2 }} />
```

Numeric MUI System border radii are represented as theme multipliers rather than assumed pixels. The default-theme 4px equivalent is informational only because applications can customize `theme.shape.borderRadius`.

```ts
import {
  evaluateBoxBorderRadiusGuidance,
  extractMaterialUiDesignObservations,
} from 'ui-behavior-coverage';

const observations = extractMaterialUiDesignObservations(source);

const results = evaluateBoxBorderRadiusGuidance(observations, {
  allowedThemeMultipliers: [1, 2],
  allowedCssValues: ['50%'],
});
```

See:

[Design-system guidance](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/design-guidance.md)

## External evaluation

`ui-behavior-coverage` has been evaluated against pinned scopes from independent open-source React applications rather than only synthetic fixtures.

Earlier Phase 8A validation expanded the external corpus across multiple React and Material UI projects and focused especially on:

* assertion-to-target correlation;
* interaction-to-target correlation;
* wrapper and control-flow handling;
* callback payload inference;
* project/workspace resolution;
* behavior-contract identity and deduplication.

Phase B validation then used additional pinned production repositories to test the release-candidate analyzer on previously unseen application structures.

### Cytoscape validation

A pinned `cytoscape/cytoscape-web` evaluation exposed four conservative-classification limitations:

1. internal implementation handlers being surfaced as consumer contracts;
2. render-state reach hidden behind safe local test helpers;
3. state changes performed through Testing Library `rerender()`;
4. exact DOM-property assertions whose target used a dynamic production `data-testid`.

Those observations were first recorded in a contract-by-contract manual adjudication before analyzer changes were made.

The cases were then converted into regression tests and corrected.

For the pinned Cytoscape snapshot used in that evaluation, the corrected analyzer produced:

| Metric                    |                 Result |
| ------------------------- | ---------------------: |
| consumer-facing contracts |                     12 |
| reached contracts         |                      8 |
| verified contracts        |                      1 |
| Behavior Reach            |                  66.7% |
| Behavior Verification     |                   8.3% |
| Verification Gap          | 58.4 percentage points |

These figures are specific to that pinned repository snapshot and supported analyzer surface. They are **not** intended as a universal accuracy rate.

The release strategy remains precision-first: unsupported or ambiguous behavior is left unclassified rather than lowering inference requirements merely to increase the number of findings.

Evaluation records include:

* [Phase 8A target-aware precision](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-15-phase8a-target-aware-precision.md)
* [Phase 8A workspace/self-import resolution](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-15-phase8a-workspace-self-imports.md)
* [Alpha precision audit](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-13-alpha-precision-audit.md)
* [Phase B Cytoscape adjudication](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/evaluations/2026-08-24-phase-b-cytoscape-adjudication.md)

These evaluations provide evidence for the documented analyzer surface; they should not be interpreted as a statistically established accuracy claim across all React applications.

## CLI exit codes

```text
0  analysis completed successfully
1  invalid command or arguments
2  analysis/filesystem failure
```

Verification gaps do not fail CI by default in `0.1.0`.

Threshold-based CI policy remains deferred until report semantics and external validation cover a broader range of real-world projects.

## Release quality gates

The repository validates:

```bash
npm run check
npm test
npm run pack:check
```

`npm test` includes a clean consumer smoke path that:

1. builds the package;
2. creates an npm tarball;
3. installs the tarball into a temporary consumer project;
4. invokes the installed CLI;
5. scans a fixture;
6. verifies CommonJS and ESM loading.

Release validation also includes:

* TypeScript compilation;
* unit and regression tests;
* consumer tarball smoke testing;
* npm package-content inspection;
* version consistency between package metadata and JSON reporting;
* pinned external evaluation;
* precision-focused adversarial regression fixtures;
* validation that packaged `README.md` matches the intended release source.

See:

[Release procedure](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/docs/release.md)

## Research context and independence

This project is motivated by research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles.

It is an independent implementation with its own terminology and architecture. Contributors should not copy paper prose, figures, prompts, datasets, supplemental artifacts, or source code unless a separate license permits reuse.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Contributing and security

See:

* [CONTRIBUTING.md](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/CONTRIBUTING.md)
* [SECURITY.md](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/SECURITY.md)

## License

MIT.
