# Phase 8A target-aware precision evaluation — 2026-08-15

This evaluation records the first Phase 8A precision increment after the public `0.1.0-alpha.0` release. It evaluates a conservative target-aware interaction correlation layer and expands the pinned external corpus without adding new behavior families.

## Change under test

Before this increment, callback-oriented behavior analysis correlated an interaction primarily by event method and ordering after the matching render. That could allow an unrelated interaction such as `user.click(screen.getByRole('checkbox'))` to provide `click` evidence for a button behavior in the same test.

The Phase 8A target-aware layer uses explicit Testing Library role evidence to reject interactions that are provably aimed at an incompatible target. Incompatible calls are masked before the existing event/oracle analysis, preserving assertion ordering. Unknown target styles remain eligible; the analyzer does not reject an interaction merely because it cannot resolve its role.

Examples of conservative compatibility sets include:

- native button: `button`
- MUI Button: `button` or `link`
- MUI Checkbox/Switch: `checkbox` or `switch`
- MUI Radio: `radio`
- MUI TextField: `textbox`, `searchbox`, or `spinbutton`
- native MUI Select: `combobox` or `listbox`

## Regression gates

The test suite now explicitly verifies that:

- a checkbox click cannot exercise a native disabled-button click contract;
- an incompatible role-bound target is rejected;
- a compatible role-bound target remains eligible;
- an unknown query style such as `getByText` remains eligible rather than becoming a false negative;
- a MUI Checkbox contract is not credited by a click on an unrelated button;
- an incompatible interaction before an oracle cannot verify a compatible interaction that occurs only after that oracle;
- the same sequence becomes VERIFIED when the compatible interaction precedes the oracle.

The final CI run for this increment passed type-check, tests, and package validation on Ubuntu Node 20, 22, and 24 and Windows Node 24.

## External corpus

External evaluation run: `31920453970`

Analyzer commit: `d1d157f1f22e151fe65bd651879608e2d28ba3de`

| Repository / scope | Pinned SHA | Test files | Paired/analyzed tests | Discovered | Exercised | Verified |
|---|---|---:|---:|---:|---:|---:|
| `clash-verge-rev/clash-verge-rev` / `src` | `aadceba0642b8f58cf7c6e426ff29bf6846cbfe1` | 8 | 1 | 0 | 0 | 0 |
| `dohomi/react-hook-form-mui` / `packages/rhf-mui` | `b19c844a3fb39778ece6f4ae19ed5c10b960346e` | 0 | 0 | 0 | 0 | 0 |
| `marmelab/react-admin` / `packages/ra-ui-materialui` | `051f511bb0afb5ea565c2d3728bf4dab0a6fa5e0` | 118 | 118 | 4 | 2 | 1 |
| `mui/material-ui` / `packages/mui-material` | `48c6663a66b7eacbd9c7c411863ab5d18dbeea88` | 294 | 23 | 0 | 0 | 0 |
| `mui/mui-x` / `packages/x-data-grid` | `17580d3dfe835b4d4b1290f50c4d95ed7b74de21` | 45 | 36 | 0 | 0 | 0 |
| `mui/toolpad` / `packages/toolpad-core` | `b2a4a69f343e98e6f3f7ebeba47dbc609c542e37` | 19 | 16 | 0 | 0 | 0 |
| `OpenCTI-Platform/opencti` / `opencti-platform/opencti-front` | `2dfbddd21c3316bfcd1b3d7e1a35358feb9e6223` | 191 | 55 | 5 | 0 | 0 |
| `react-hook-form/react-hook-form` / `src` | `06e4efdd28ec346196c38efd0909011e2f83064b` | 114 | 29 | 0 | 0 | 0 |
| `refinedev/refine` / `packages/mui` | `779d52a20e29b0307ac0df04d135beba434370dc` | 39 | 24 | 5 | 0 | 0 |
| `rjsf-team/react-jsonschema-form` / `packages/mui` | `a99a17b9ca64622ca8bcca2cca69df567d211aa8` | 6 | 1 | 0 | 0 | 0 |
| `viclafouch/mui-file-input` / `src` | `9cb067548f0fbb3ea91704aee03f5c088ab33264` | 1 | 1 | 0 | 0 | 0 |
| **Total** |  | **835** | **304** | **14** | **2** | **1** |

The corpus contains 10 repositories with at least one test file plus one explicitly retained zero-test package scope (`react-hook-form-mui`). The zero-test scope is not counted as test-bearing breadth; it is kept to make benchmark selection limitations visible.

## Stability versus the alpha audit

The supported production findings are unchanged from the pinned alpha precision audit:

- OpenCTI: 5 valid DISCOVERED contracts;
- React Admin: 4 contracts, of which 2 are reached and 1 is VERIFIED;
- Refine MUI: 5 valid DISCOVERED contracts.

Therefore the expanded corpus did not create new opportunistic positive classifications, and the target-aware interaction change did not demote the previously audited production findings.

The existing manual audit remains applicable because the original six repositories use the same pinned upstream SHAs. Its small-sample result remains 14/14 valid contracts, 2/2 correctly classified reached cases, 1/1 correctly classified VERIFIED case, and zero known false VERIFIED findings. This remains an observation on a small manually audited sample, not a statistical accuracy claim.

A fresh spot-check of the two reached React Admin classifications also matches the intended semantics: the BooleanInput test initializes `isPublished: true` and explicitly asserts the checked DOM state, while the DatagridRow `selectable={false}` test verifies callback suppression but does not assert that the selection checkbox is disabled.

## Discovery findings from the expanded corpus

The expansion is useful even where it produces no contracts because it exposes where the current analyzer cannot yet observe enough of a repository to make behavioral claims.

### MUI Material

The `packages/mui-material` scope contains 294 test files and 255 tests with runtime JSX, but only 23 test files resolve to local project targets. Of 509 rendered runtime imports examined, 484 are classified as external modules. The resulting zero-contract report must therefore **not** be interpreted as “MUI has no relevant behaviors” or “MUI tests verify nothing.” It primarily exposes a package/workspace self-import resolution limitation in the analyzer.

### React Hook Form

The `src` scope contains 114 tests; 48 contain runtime JSX and 29 resolve to local targets. The analyzer finds no supported public UI behavior contracts in those paired targets. This is a useful negative control: a large test suite does not automatically inflate discovered/reached/verified counts.

### RJSF MUI

The package contains 6 test files, but only 1 contains runtime JSX that resolves to a project target under the current discovery rules. Zero supported contracts here is therefore primarily a discovery-coverage result, not a test-quality conclusion.

## Phase 8A status after increment 1

Completed in this increment:

- target-aware interaction precision guard;
- assertion-order preservation for target-aware evidence;
- native and MUI regression coverage;
- 10 test-bearing external repositories in the pinned corpus;
- 835 external test files inventoried;
- 304 test files paired/analyzed;
- stable production classifications relative to the alpha audit;
- zero known false VERIFIED findings in the carried-forward manual audit.

Not yet achieved:

- 1,000+ paired/analyzed external tests;
- 50+ manually audited production contracts;
- a broader set of reached/verified findings across multiple independent repositories.

The benchmark indicates that the next Phase 8A engineering priority should be **package/workspace-aware self-import resolution**, especially for repositories such as MUI Material. Expanding semantic inference before improving this observability would make it harder to distinguish discovery blind spots from true absence of supported behavior contracts.
