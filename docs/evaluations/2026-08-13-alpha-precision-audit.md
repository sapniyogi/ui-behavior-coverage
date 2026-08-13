# Alpha precision audit — 2026-08-13

Every production contract from the pinned Phase 7 benchmark was manually reviewed before the first npm alpha.

| Scope | Finding | Status | Audit |
|---|---|---|---|
| OpenCTI | two `TabWithDropDownMenu.isOpen → Menu.open` states | DISCOVERED | valid |
| OpenCTI | two `ListFilters.isOpen → Popover.open` states | DISCOVERED | valid |
| OpenCTI | `MarkdownFieldBase.disabled → Button.disabled` | DISCOVERED | valid |
| React Admin | `BooleanInput.disabled → Switch.disabled` | DISCOVERED | valid |
| React Admin | `BooleanInput.readOnly → Switch.disabled` | DISCOVERED | valid |
| React Admin | `DatagridRow.selectable=false → Checkbox.disabled` | EXERCISED | valid; disabled DOM state is not asserted |
| React Admin | form default `isPublished=true → Switch.checked=true` | VERIFIED | valid; test asserts checked state |

Small-sample results: **9/9 valid contracts**, **2/2 correctly classified reached cases**, **1/1 correctly classified VERIFIED case**, and **0 known false VERIFIED findings**.

These percentages are release-gate observations, not statistically established accuracy claims. The sample is intentionally small. A known false VERIFIED classification is release-blocking for this alpha.
