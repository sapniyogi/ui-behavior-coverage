# Phase 7 semantic evidence evaluation — 2026-08-13

Phase 7 extends the Phase 6 production-composition analyzer into semantic UI evidence. The same five public repositories and the exact same upstream commit SHAs are used so the comparison remains reproducible.

## Semantic evidence added

Phase 7 adds conservative project-level evidence for:

- **value state** — public `value` props reaching MUI `TextField`, `Input`, `InputBase`, `OutlinedInput`, `FilledInput`, `Select`, and `Slider`, matched against `toHaveValue`, `toHaveDisplayValue`, or direct `.value` assertions;
- **visibility state** — public `open` state reaching MUI `Dialog`, `Popover`, `Menu`, and `Modal`, matched against visibility/presence assertions;
- **accessibility state** — explicit `aria-*` attributes on MUI elements when their values come directly from public props, matched against `toHaveAttribute`;
- **expansion / selection evidence** — represented conservatively through explicit `aria-expanded`, `aria-selected`, and `aria-pressed` evidence rather than assuming which internal MUI node owns an implicit ARIA state;
- **form-controlled state** — React Admin / React Hook Form-style `useInput` and `useController` bindings, where `source`/`name` identifies a field and surrounding `defaultValues`, `record`, or `values` supplies the test input state.

The existing callback and Phase 6 boolean render-state channels remain intact.

## Test evidence improvements

The test analyzer now carries the actual rendered primitive value into the oracle matcher and recognizes:

- `expect(element).toHaveValue(value)`;
- `expect(element).toHaveDisplayValue(value)`;
- `expect(input.value).toBe(value)` / `toEqual(value)`;
- `expect(element).toBeVisible()` and conservative negative-presence forms;
- `expect(element).toHaveAttribute(name, value)`;
- form-controlled `.checked` / `toBeChecked` and `.value` / `toHaveValue` evidence.

A lexical test environment was also added. Constants declared at module or enclosing `describe` scope before a test are available to that test, while sibling-test constants are not leaked across tests. This is required for production patterns such as React Admin's shared `defaultProps` objects.

## Same five pinned repositories

| Repository | Scope | Pinned upstream SHA |
|---|---|---|
| OpenCTI | `opencti-platform/opencti-front` | `2dfbddd21c3316bfcd1b3d7e1a35358feb9e6223` |
| React Admin | `packages/ra-ui-materialui` | `051f511bb0afb5ea565c2d3728bf4dab0a6fa5e0` |
| MUI X | `packages/x-data-grid` | `17580d3dfe835b4d4b1290f50c4d95ed7b74de21` |
| Toolpad | `packages/toolpad-core` | `b2a4a69f343e98e6f3f7ebeba47dbc609c542e37` |
| Clash Verge Rev | `src` | `aadceba0642b8f58cf7c6e426ff29bf6846cbfe1` |

## Phase 6 → Phase 7 results

`Exercised` below is the aggregate number of reached contracts, including verified contracts, matching the package scoring model.

| Repository | Tests paired | Phase 6 discovered / reached / verified | Phase 7 discovered / reached / verified |
|---|---:|---:|---:|
| OpenCTI frontend | 55 | 1 / 0 / 0 | **5 / 0 / 0** |
| React Admin `ra-ui-materialui` | 118 | 3 / 1 / 0 | **4 / 2 / 1** |
| MUI X Data Grid | 36 | 0 / 0 / 0 | 0 / 0 / 0 |
| Toolpad Core | 16 | 0 / 0 / 0 | 0 / 0 / 0 |
| Clash Verge Rev | 1 | 0 / 0 / 0 | 0 / 0 / 0 |

Test pairing remains **226 files** across the five pinned scopes. Total conservative contracts increase from **4 to 9**. Phase 7 produces the benchmark's first production **VERIFIED** semantic contract.

## Manually audited production findings

### React Admin `BooleanInput`: VERIFIED form-controlled checked state

`BooleanInput` receives a public `source`, normalizes props through MUI `useThemeProps`, calls React Admin `useInput({ source })`, and ultimately renders its MUI `Switch` from `Boolean(field.value)`.

The production test declares a shared `defaultProps = { source: 'isPublished' }` in its enclosing `describe`, renders the input under `SimpleForm defaultValues={{ isPublished: true }}`, and asserts `expect(input.checked).toBe(true)`.

Phase 7 resolves the full evidence chain:

```text
BooleanInput source="isPublished"
        ↓
useInput({ source })
        ↓
field.value
        ↓
Switch checked={Boolean(field.value)}
        ↑
SimpleForm defaultValues.isPublished = true
        ↓
expect(input.checked).toBe(true)
```

The contract is therefore **VERIFIED** rather than merely reached.

React Admin also retains the independently audited Phase 6 verification gap in `DatagridRow`: `selectable=false` deterministically disables its MUI Checkbox, but the paired test verifies callback suppression rather than the disabled DOM state. That contract remains **EXERCISED**.

### OpenCTI: conservative visibility discovery

Phase 7 adds four direct public visibility contracts:

- `TabWithDropDownMenu.isOpen=false/true → MUI Menu open=false/true`;
- `ListFilters.isOpen=false/true → MUI Popover open=false/true`.

Manual source inspection confirms those are direct public-prop mappings. Their paired tests do not exercise those public conditions, so all four correctly remain **DISCOVERED** rather than being promoted to reached coverage.

OpenCTI also retains the Phase 6 `MarkdownFieldBase disabled=true → MUI Button disabled=true` contract.

## Important negative results

The benchmark did **not** surface additional production contracts for the new public-value or explicit-ARIA families in these five pinned scopes. That is not treated as a failure or converted into speculative coverage. Focused regression tests validate the value and visibility evidence paths; explicit ARIA inference remains source-explicit and conservative.

MUI X Data Grid, Toolpad Core, and Clash Verge Rev still produce zero currently supported public semantic contracts despite substantially improved Phase 6 test pairing. Zero means “no supported public contract was proven through this tested surface,” not “perfect behavioral coverage.”

## Validation

The final Phase 7 implementation passes CI on Node 20 and Node 22 with:

- `npm ci`;
- `npm run check`;
- full suite: **56 tests, 56 passed, 0 failed**;
- `npm run pack:check`.

Focused regression coverage includes:

- bound MUI `TextField` value verification;
- MUI `Dialog` visibility verification;
- React Admin-style form-controlled `checked` verification with `describe`-scope constants.

## Deliberate limitations

1. Form-state resolution is static and conservative: primitive values in object literals and resolvable const spreads are supported; runtime mutations and arbitrary setup callbacks are not executed.
2. Nested field paths such as `source="author.name"` are not yet dereferenced through nested object graphs.
3. `useInput` and `useController` are recognized as form bindings; arbitrary custom form hooks are opaque unless a future adapter models them.
4. Visibility is intentionally limited to reliable MUI `open` surfaces (`Dialog`, `Popover`, `Menu`, `Modal`). Transition-component `in` props are not equated with DOM visibility without stronger evidence.
5. Accessibility / expansion / selection contracts require explicit ARIA forwarding from a public prop. Phase 7 does not infer undocumented internal MUI ARIA ownership.
6. The analyzer remains static: it does not execute React, browser layout, portals, effects, or asynchronous state machines.
7. Cross-package/workspace wrappers may still require broader package-aware resolution beyond the current scan root.

## Next measurement target

The next improvement should focus on richer data-flow rather than more component names: nested form paths, context/provider-derived public contracts, conditional presence, and target-aware ARIA/query binding. Future work should continue rerunning these exact pinned SHAs and manually auditing every newly reached production contract.