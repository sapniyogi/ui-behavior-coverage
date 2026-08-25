# Phase B Cytoscape RC.1 adjudication

Date: 2026-08-24

Target repository: `cytoscape/cytoscape-web`

Pinned upstream commit: `6bd1e50733155ea9f039457ef89b6c0e9595154a`

Analyzer under adjudication: published `ui-behavior-coverage@0.1.0-rc.1`

Raw RC.1 summary is preserved in `2026-08-24-phase-b-cytoscape-rc1-summary.json`. This document does not rewrite that result; it records a separate manual adjudication baseline for the 14 emitted contracts.

## Raw RC.1 result

| Metric | RC.1 raw result |
| --- | ---: |
| Discovered contracts | 14 |
| EXERCISED | 4 |
| VERIFIED | 0 |
| Behavior Reach | 28.6% |
| Behavior Verification | 0% |
| Verification Gap | 28.6% |

## Contract-by-contract adjudication

`SUPPRESS` means the emitted contract is an internal implementation-detail contract that should not participate in consumer-facing behavioral coverage when a meaningful public callback/effect is available.

| # | Component | Contract | RC.1 status | Adjudicated disposition | Rationale / pinned evidence |
| ---: | --- | --- | --- | --- | --- |
| 1 | `CytoscapeDesktopPermissionDialog` | `open=false -> visible=false` (`mui-dialog-visibility-render-state`) | DISCOVERED | **DISCOVERED** | The component binds `Dialog open={open}`. The pinned test renders only `open={true}`; no safe `open=false` reach was found. |
| 2 | `CytoscapeDesktopPermissionDialog` | `open=true -> visible=true` | EXERCISED | **EXERCISED** | The test directly renders `open={true}` and queries `cytoscape-desktop-permission-dialog`, but does not make an explicit visibility assertion such as `toBeVisible()`. |
| 3 | `ListValueEditorDialog` | `open=false -> visible=false` | DISCOVERED | **DISCOVERED** | The local `setup()` helper defaults the component to `open={true}` and no test overrides it to false. |
| 4 | `ListValueEditorDialog` | `open=true -> visible=true` | DISCOVERED | **EXERCISED** | `setup()` directly renders `<ListValueEditorDialog open={true} ... />` and is used throughout the UI tests. RC.1 loses the reached state across the local render helper. |
| 5 | `CreateTableColumnForm` | `open=false -> visible=false` | DISCOVERED | **EXERCISED** | The test explicitly calls `rerender(<CreateTableColumnForm open={false} ... />)`. RC.1 fails to propagate that rerendered state into reach. |
| 6 | `CreateTableColumnForm` | `open=true -> visible=true` | EXERCISED | **EXERCISED** | The test directly renders `open={true}` and later rerenders it true again. It does not explicitly verify Dialog visibility. |
| 7 | `DropdownMenu` | `disabled=true prevents handleClick activation` (`mui-button-disabled-event-suppression`) | DISCOVERED | **SUPPRESS** | `handleClick` is a local implementation function, not a public callback prop. The consumer-observable contract is represented separately through `onOpenChange`. |
| 8 | `DropdownMenu` | `disabled=true prevents onOpenChange activation` | EXERCISED | **EXERCISED** | The test reaches `disabled={true}`, clicks the button, and asserts `onOpenChange` was not called **with `true`**. That is useful evidence, but it is weaker than the emitted `callback-not-called` expectation because a call with another value is not excluded. |
| 9 | `DropdownMenu` | `disabled=true renders disabled=true` (`mui-button-disabled-render-state`) | EXERCISED | **VERIFIED** | The test resolves the MUI Button through `screen.getByTestId('toolbar-tools-menu-button')` and explicitly asserts `expect(button.disabled).toBe(true)`. This is exact DOM-property evidence for the contract. |
| 10 | `StylePickerDialog` | `open=false -> visible=false` | DISCOVERED | **DISCOVERED** | The helper always renders the dialog open; no closed render was identified. |
| 11 | `StylePickerDialog` | `open=true -> visible=true` | DISCOVERED | **EXERCISED** | `renderDialog()` renders `<StylePickerDialog open ... />`; JSX shorthand `open` is `open={true}`. RC.1 loses reach through the local helper. |
| 12 | `CustomGraphicDialog` | `isNewChart=true prevents handleRemoveChartsClick activation` | DISCOVERED | **SUPPRESS** | `handleRemoveChartsClick` is a local implementation function. It is not a public callback prop and should not be a consumer-facing callback-suppression contract. |
| 13 | `CustomGraphicDialog` | `open=false -> visible=false` | DISCOVERED | **DISCOVERED** | The pinned helper renders only `open={true}`; no closed render is present in this test file. |
| 14 | `CustomGraphicDialog` | `open=true -> visible=true` | DISCOVERED | **EXERCISED** | `renderDialog()` directly renders `<CustomGraphicDialog open={true} ... />`. RC.1 loses the reached state through the helper. |

## Adjudicated aggregate

The two `SUPPRESS` rows are excluded from consumer-facing coverage accounting, leaving 12 usable contracts.

| Adjudicated classification | Count |
| --- | ---: |
| DISCOVERED | 4 |
| EXERCISED | 7 |
| VERIFIED | 1 |
| SUPPRESS / non-public implementation contract | 2 |
| Usable contracts | 12 |

For the 12 usable contracts, the adjudicated comparison is approximately:

- Behavior Reach: `8 / 12 = 66.7%`
- Behavior Verification: `1 / 12 = 8.3%`
- Verification Gap: `58.4 percentage points`

These are manual adjudication figures for this pinned snapshot. They do **not** replace the immutable RC.1 raw result and should not be presented as analyzer output.

## Confirmed regression patterns to encode before analyzer changes

1. **Local render-helper reach propagation** — a test helper that calls `render(<Component open={true} />)` must count the `open=true` contract as reached when the test invokes that helper.
2. **`rerender()` state propagation** — explicit rerenders with a changed public prop must contribute reach for each safely resolvable state.
3. **Equivalent DOM-property verification** — exact assertions such as `expect(button.disabled).toBe(true)` on the correlated target must verify a `disabled=true` render-state contract, including the Cytoscape-shaped dynamic `data-testid` case.
4. **Internal-handler contract suppression** — local functions such as `handleClick` or `handleRemoveChartsClick` must not become consumer-facing callback contracts when they are implementation details; public callbacks/effects remain eligible.

## RC.2 acceptance gate for these cases

Before using a corrected analyzer for subsequent Phase B aggregate metrics:

- all four regression tests must pass;
- the existing regression suite must remain green;
- no new false VERIFIED result may be introduced by broader helper/rerender/target resolution;
- the original RC.1 Cytoscape result must remain preserved unchanged for before/after comparison;
- the pinned Cytoscape snapshot should be rerun with the corrected candidate and compared against this adjudication table.
