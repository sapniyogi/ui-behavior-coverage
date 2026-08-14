# ui-behavior-coverage

Experimental behavioral verification coverage for React component tests, with first-class Material UI semantics.

Traditional code coverage asks **“did this code execute?”** `ui-behavior-coverage` asks a different question:

> **Did the test explicitly verify the UI behavior it exercised?**

> **Alpha status:** `0.1.0-alpha.0` is intentionally conservative and incomplete. Unsupported patterns are skipped rather than guessed. Treat findings as test-quality evidence to review, not as a replacement for test execution or browser automation.

## Install and scan

```bash
npm install -D ui-behavior-coverage@alpha
npx ui-behavior-coverage scan .
```

JSON output:

```bash
npx ui-behavior-coverage scan . --json
```

Single component/test pair:

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

- **Behavior Reach** — discovered behaviors that tests actually reach/exercise.
- **Behavior Verification** — discovered behaviors with an explicit matching oracle.
- **Verification Gap** — Reach minus Verification: tests interact with behavior but do not prove the outcome.

For example, this reaches a controlled checkbox transition but only proves that *some* callback happened:

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

The same principle applies to rendered DOM state such as `toBeDisabled()`, `toBeChecked()`, `toHaveValue()`, visibility assertions, and explicit `aria-*` assertions.

## Material UI support in the alpha

The analyzer recognizes MUI statically from imports; **it does not install or execute `@mui/material`**.

| Capability | Alpha support |
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
| non-native MUI `Select` popup interaction semantics | ❌ |
| arbitrary hooks/context/effects/state machines | ❌ |
| browser layout, portals, computed CSS, animation timing | ❌ |
| arbitrary custom form hooks | ❌ |

“Conservative” means the analyzer requires a traceable public condition/evidence chain and leaves unsupported cases unclassified instead of inferring undocumented framework behavior.

See [`docs/providers.md`](docs/providers.md) and [`docs/architecture.md`](docs/architecture.md) for the detailed boundaries.

## Real React composition

Project scanning can follow a useful subset of production composition patterns, including:

```text
public component prop
       ↓
local wrapper / barrel / alias
       ↓
simple prop forwarding or known normalization
       ↓
Material UI component
       ↓
semantic UI contract
       ↓
test render/setup
       ↓
matching assertion
```

Supported production-oriented paths include conservative boolean expressions, JSX spreads with override safeguards, recursive local component composition, `useThemeProps({ props, ... })`, and selected form bindings.

Discovery telemetry is included in project reports so “zero behaviors” can be distinguished from “the scanner could not resolve this test surface.”

## Versioned JSON

`--json` output is versioned from the first alpha:

```json
{
  "schemaVersion": "1",
  "toolVersion": "0.1.0-alpha.0",
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

Schema v1 also preserves the raw report fields at the top level for compatibility with the pre-schema alpha CLI. New automation should check `schemaVersion` and use `report`/`summary`.

See [`docs/json-schema-v1.md`](docs/json-schema-v1.md).

## Programmatic API

The alpha is CommonJS-compatible and can also be loaded by ESM consumers through Node interoperability:

```ts
import {
  analyzeProject,
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
} from 'ui-behavior-coverage';

const report = analyzeProject('.');
```

The public API also exposes provider, project-discovery, scoring, reporting, MUI semantic extraction, and Box design-guidance helpers. Public APIs may still change during the `0.x` alpha series; JSON schema changes will be versioned.

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

See [`docs/design-guidance.md`](docs/design-guidance.md).

## External evaluation

The current alpha release candidate has been evaluated against pinned scopes from **six** substantial public MUI repositories: OpenCTI, React Admin, MUI X Data Grid, Toolpad Core, Clash Verge Rev, and Refine MUI.

Across the current pinned alpha corpus:

- **250** test files were paired/analyzed across the six scopes;
- **14** conservative production contracts were discovered;
- **2** were reached;
- **1** was explicitly verified;
- all **14** currently reported production contracts were manually reviewed for the alpha precision audit;
- there are **0 known false VERIFIED** findings in that audited sample.

The original five-repository Phase 7 benchmark accounted for 226 paired test files and 9 contracts. Phase 7.5 adds Refine MUI at a pinned commit, where 24 test files are paired and 5 additional valid `loading=true → disabled=true` wrapper contracts are discovered. Those Refine contracts are not marked reached because the paired tests do not establish a statically resolvable `loading=true` condition.

This remains a small evidence base, not a statistically strong accuracy claim. React Admin is currently the only benchmark repository with reached/verified contracts. The benchmark deliberately leaves unsupported or unproven surfaces unclassified rather than lowering inference precision to increase counts.

See [`docs/evaluations/2026-08-13-phase7-semantic-evidence.md`](docs/evaluations/2026-08-13-phase7-semantic-evidence.md), [`docs/evaluations/alpha-readiness.md`](docs/evaluations/alpha-readiness.md), and [`docs/evaluations/2026-08-13-alpha-precision-audit.md`](docs/evaluations/2026-08-13-alpha-precision-audit.md).

## CLI exit codes

```text
0  analysis completed successfully
1  invalid command or arguments
2  analysis/filesystem failure
```

Verification gaps do not fail CI by default in `0.1.0-alpha.0`. Threshold-based CI policy is intentionally deferred until report semantics have more external validation.

## Release quality gates

The repository validates:

```bash
npm run check
npm test
npm run pack:check
```

`npm test` includes a clean consumer smoke path that packs the package, installs the resulting tarball into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

See [`docs/release.md`](docs/release.md).

## Research context and independence

This project is motivated by research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles. It is an independent implementation with its own terminology and architecture. Contributors should not copy paper prose, figures, prompts, datasets, supplemental artifacts, or source code unless a separate license permits reuse.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Contributing and security

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development and clean-room contribution rules. See [`SECURITY.md`](SECURITY.md) for security reporting guidance.

## License

MIT.
