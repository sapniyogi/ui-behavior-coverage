# Alpha precision audit — 2026-08-13

Every production contract included in the current pinned alpha benchmark has been manually reviewed before the first npm alpha.

| Scope | Finding | Status | Audit |
|---|---|---|---|
| OpenCTI | two `TabWithDropDownMenu.isOpen → Menu.open` states | DISCOVERED | valid |
| OpenCTI | two `ListFilters.isOpen → Popover.open` states | DISCOVERED | valid |
| OpenCTI | `MarkdownFieldBase.disabled → Button.disabled` | DISCOVERED | valid |
| React Admin | `BooleanInput.disabled → Switch.disabled` | DISCOVERED | valid |
| React Admin | `BooleanInput.readOnly → Switch.disabled` | DISCOVERED | valid |
| React Admin | `DatagridRow.selectable=false → Checkbox.disabled` | EXERCISED | valid; disabled DOM state is not asserted |
| React Admin | form default `isPublished=true → Switch.checked=true` | VERIFIED | valid; test asserts checked state |
| Refine MUI | `CloneButton.loading=true → MUI Button disabled=true` | DISCOVERED | valid; MUI Button props are forwarded to the underlying Button |
| Refine MUI | `CreateButton.loading=true → MUI Button disabled=true` | DISCOVERED | valid; MUI Button props are forwarded to the underlying Button |
| Refine MUI | `EditButton.loading=true → MUI Button disabled=true` | DISCOVERED | valid; MUI Button props are forwarded to the underlying Button |
| Refine MUI | `ListButton.loading=true → MUI Button disabled=true` | DISCOVERED | valid; MUI Button props are forwarded to the underlying Button |
| Refine MUI | `ShowButton.loading=true → MUI Button disabled=true` | DISCOVERED | valid; MUI Button props are forwarded to the underlying Button |

The five Refine wrappers use Refine button prop types parameterized with Material UI `ButtonProps` and forward their remaining MUI props to the underlying `<Button>`. The analyzer does not mark those contracts reached because the paired tests do not establish `loading=true` in a statically resolvable render.

Small-sample results: **14/14 valid contracts**, **2/2 correctly classified reached cases**, **1/1 correctly classified VERIFIED case**, and **0 known false VERIFIED findings**.

These percentages are release-gate observations, not statistically established accuracy claims. The sample remains intentionally small. A known false VERIFIED classification is release-blocking for this alpha.
