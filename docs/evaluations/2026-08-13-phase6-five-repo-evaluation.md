# Phase 6 five-repository production evaluation — 2026-08-13

Phase 6 addresses the production-readiness failures exposed by the Phase 5 benchmark. The same five public repositories and pinned upstream commits were rerun so before/after comparisons are reproducible.

## What Phase 6 adds

- expression-aware public prop analysis (`!prop`, `Boolean(prop)`, boolean equality/inequality, conservative `propA || propB` handling);
- same-file and recursive cross-file component contract propagation;
- conservative `...props` forwarding through simple wrappers and `styled()` wrapper functions;
- explicit JSX override ordering so a later prop can cancel a spread-derived contract;
- barrel/index export resolution, named import aliases, TypeScript path aliases, and JS/JSX tests;
- configurable custom render-helper normalization;
- project discovery telemetry with reasons for unresolved/skipped test targets;
- a separate Material UI rendered-state contract family for deterministic public `disabled`, `loading`, and `checked` state;
- rendered-state test oracles including `toBeDisabled`, `toBeEnabled`, `toBeChecked`, `expect(input.checked).toBe(...)`, `expect(input.disabled).toBe(...)`, and `toHaveProperty`;
- transparent tracing through MUI `useThemeProps({ props, ... })`, without treating arbitrary function calls as transparent prop transforms.

## Reproducible benchmark results

| Repository | Phase 5 tests analyzed | Phase 6 tests analyzed | Discovered | Exercised | Verified |
|---|---:|---:|---:|---:|---:|
| OpenCTI frontend | 51 | 55 | 1 | 0 | 0 |
| React Admin `ra-ui-materialui` | 78 | 118 | 3 | 1 | 0 |
| MUI X Data Grid | 1 | 36 | 0 | 0 | 0 |
| Toolpad Core | 16 | 16 | 0 | 0 | 0 |
| Clash Verge Rev `src` | 1 | 1 | 0 | 0 | 0 |

Across the five scopes, test-file pairing improved from **147 to 226**, an increase of 79 paired test files (~53.7%). Phase 5 discovered zero contracts in every target; Phase 6 discovers four conservative public-prop/render-state contracts in the same pinned inputs.

The zero rows must still not be interpreted as perfect coverage. They mean the currently supported Material UI contract families are not yet exposed through a resolvable public prop surface in the paired tests for those scopes.

## Discovery telemetry highlights

- React Admin: 118/118 test files now have resolved local targets; 570 of 714 rendered runtime imports resolved. The remaining 144 rendered imports are external modules.
- MUI X Data Grid: 36/45 test files now have local targets, up from 1/45 in Phase 5. Seven test files contain no runtime JSX; additional gaps come from external modules and unresolved barrel/module edges.
- OpenCTI: 55/191 test files have local targets. Most of the remainder are non-UI/unit tests with no runtime JSX.
- Toolpad Core: 16/19 test files have local targets; three have no runtime JSX.
- Clash Verge Rev: only one of eight test files contains runtime JSX in the scanned `src` scope, so the low pairing count is expected rather than a resolver failure.

## Manual audit of production findings

### React Admin `BooleanInput`

`BooleanInput` accepts public `disabled` and `readOnly` props, normalizes incoming props through MUI `useThemeProps`, and ultimately renders:

```tsx
<Switch
  disabled={disabled || readOnly}
  readOnly={readOnly}
  ...
/>
```

Phase 6 correctly traces both public conditions to MUI Switch `disabled=true` and reports two **DISCOVERED** render-state contracts. The paired test file does not exercise `disabled` or `readOnly`, so neither is incorrectly marked reached.

The same test file contains many checked-state assertions, but those checked values come from React Admin form state/default values rather than a public `checked` prop. Phase 6 deliberately does not pretend those are public-prop contracts.

### React Admin `DatagridRow`

`DatagridRow` renders its bulk-action checkbox with:

```tsx
<Checkbox
  checked={selectable && selected}
  disabled={!selectable}
  ...
/>
```

The test `should not execute the onToggleItem function if the row is not selectable` renders `selectable={false}` and verifies that the callback is not invoked, but does not assert that the checkbox is disabled. Phase 6 therefore reports the independent render-state contract `selectable=false -> disabled=true` as **EXERCISED**, not **VERIFIED**. Manual inspection supports this as a legitimate additional oracle rather than a false positive.

### OpenCTI `MarkdownFieldBase`

Phase 6 finds a public `disabled=true -> MUI Button disabled=true` render-state contract. The paired test file does not render the component with the public disabled condition, so the contract remains **DISCOVERED**.

## CI validation

The Phase 6 branch passes clean GitHub Actions validation on Node 20 and Node 22:

- `npm ci`
- `npm run check`
- full test suite: **53 tests, 53 passed, 0 failed**
- `npm run pack:check`

The package dry-run includes the new discovery, module-resolution, composition, render-state, and test-analysis modules.

## Deliberate limitations after Phase 6

Phase 6 materially improves production reach, but it is still conservative by design:

1. Only public-prop-derived behavior is promoted through component boundaries. Hook state, context state, form-controller state, and arbitrary computed data remain internal unless a future evidence model can prove their public contract.
2. `propA || propB` can safely produce separate contracts for the truthy/disabled case; the false case is not promoted because it would require a conjunction (`!propA && !propB`) that the current single-condition model cannot represent accurately.
3. Arbitrary wrapper functions are not assumed to preserve props. MUI `useThemeProps({ props, ... })` is treated as a known transparent normalization path; unknown transforms remain opaque.
4. The render-state oracle family currently targets boolean `disabled` and `checked` states. Production `value`, accessibility, visibility, selection, expansion, focus, and layout oracles remain future work.
5. Cross-package design-system wrappers may require package/workspace-aware resolution beyond the current project root.
6. Test harnesses that render through dynamically constructed stories/factories may still require configuration or dedicated adapters.

## Next benchmark goal

The next meaningful improvement should not be judged merely by increasing discovered counts. Future work should rerun these exact pinned repositories and report:

- paired-test coverage;
- discovered/exercised/verified contracts;
- unsupported-pattern telemetry;
- a manually audited sample of `EXERCISED` findings;
- estimated false-positive rate.

Phase 6 establishes the infrastructure needed to make those production measurements credible rather than fixture-only.
