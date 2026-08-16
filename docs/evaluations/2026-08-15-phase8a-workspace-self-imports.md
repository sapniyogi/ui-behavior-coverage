# Phase 8A package self-import evaluation — 2026-08-15

This evaluation records the second Phase 8A precision/observability increment after target-aware interaction correlation. The change improves project discovery for packages that import their own public package name from tests, without adding any new behavior family or broadening the conditions for EXERCISED or VERIFIED.

## Change under test

Project discovery now reads the scanned package root's `package.json` and, when available, uses its `name` and `exports` metadata to resolve package self-references before treating a bare import as external.

The resolver is intentionally conservative:

- only the package being scanned is eligible for self-reference mapping;
- unrelated npm package imports remain external;
- exact root and subpath exports are supported;
- wildcard subpath exports are supported;
- conditional export values are searched for a source/import/default-compatible string target;
- `.js` export targets may resolve to existing TypeScript/JSX source siblings when the package publishes JS-shaped export paths over source files;
- a limited `src/<subpath>` fallback is used only after the import is already proven to be a self-package reference.

This allows repositories such as MUI Material to resolve imports like `@mui/material/Button` back to the local package source instead of counting them as external dependencies.

## Regression gates

The added project-discovery tests verify that:

1. a package-root self-import resolves through the package's root export;
2. a wildcard subpath export resolves a package self-import to local source;
3. an unrelated bare package import remains classified as external even when a self-package import appears in the same test.

The implementation does not change behavior inference, target-aware interaction correlation, oracle recognition, or status ranking.

## External evaluation

External evaluation run: `31922230473`

Analyzer/workflow commit evaluated: `11d71e11211725a4e99eb662cc510d52d45a2d4f`

The pinned repository SHAs are unchanged from Phase 8A increment 1, so this is a direct before/after discovery comparison.

### Corpus totals

| Metric | Increment 1 baseline | Self-import increment | Change |
|---|---:|---:|---:|
| External test files inventoried | 835 | 835 | 0 |
| Paired/analyzed test files | 304 | 527 | **+223 (+73.4%)** |
| Discovered production contracts | 14 | 14 | 0 |
| Exercised/reached | 2 | 2 | 0 |
| Verified | 1 | 1 | 0 |
| Known false VERIFIED in carried-forward audit | 0 | 0 | 0 |

The 223 additional paired tests come from MUI Material. No repository changed its behavior-contract score.

## MUI Material result

The largest discovery blind spot identified by increment 1 was MUI Material's use of its own package-level imports. The new resolver materially closes that gap:

| MUI Material metric | Before | After | Change |
|---|---:|---:|---:|
| Test files | 294 | 294 | 0 |
| Tests with runtime JSX | 255 | 255 | 0 |
| Tests with resolved project targets | 23 | 246 | **+223** |
| Paired/analyzed tests | 23 | 246 | **+223** |
| Rendered imports examined | 509 | 509 | 0 |
| Rendered imports resolved | 25 | 491 | **+466** |
| Rendered imports classified external | 484 | 18 | **-466 (-96.3%)** |
| Components analyzed | 23 | 148 | **+125** |
| Discovered contracts | 0 | 0 | 0 |
| Exercised | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 |

The important interpretation is observability, not a quality claim about MUI tests. The analyzer can now pair 246 of the 255 MUI tests that contain runtime JSX, but its currently supported public-behavior families still do not produce a contract in those analyzed MUI package sources. This must not be interpreted as evidence that MUI has no behaviors or that its tests verify nothing.

The remaining 18 rendered imports classified as external and the 9 runtime-JSX tests without resolved targets are useful follow-up discovery cases, but they are no longer the dominant limitation for this package.

## Stability across the rest of the corpus

All previously benchmarked scores remain unchanged:

- OpenCTI: 5 DISCOVERED, 0 EXERCISED, 0 VERIFIED;
- React Admin: 4 DISCOVERED, 2 EXERCISED, 1 VERIFIED;
- Refine MUI: 5 DISCOVERED, 0 EXERCISED, 0 VERIFIED;
- all other test-bearing benchmark scopes: 0 supported contracts.

Because no new positive contract, EXERCISED classification, or VERIFIED classification was introduced, there is no new positive finding requiring a precision adjudication in this increment. The carried-forward 14-contract manual audit remains applicable at the same pinned SHAs: 14/14 valid audited contracts, 2/2 correctly classified reached cases, 1/1 correctly classified VERIFIED case, and zero known false VERIFIED findings. These remain small-sample release-gate observations rather than statistically established precision.

## Per-repository paired-test counts

| Repository / scope | Test files | Paired/analyzed | Discovered | Exercised | Verified |
|---|---:|---:|---:|---:|---:|
| `clash-verge-rev/clash-verge-rev` / `src` | 8 | 1 | 0 | 0 | 0 |
| `dohomi/react-hook-form-mui` / `packages/rhf-mui` | 0 | 0 | 0 | 0 | 0 |
| `marmelab/react-admin` / `packages/ra-ui-materialui` | 118 | 118 | 4 | 2 | 1 |
| `mui/material-ui` / `packages/mui-material` | 294 | **246** | 0 | 0 | 0 |
| `mui/mui-x` / `packages/x-data-grid` | 45 | 36 | 0 | 0 | 0 |
| `mui/toolpad` / `packages/toolpad-core` | 19 | 16 | 0 | 0 | 0 |
| `OpenCTI-Platform/opencti` / `opencti-platform/opencti-front` | 191 | 55 | 5 | 0 | 0 |
| `react-hook-form/react-hook-form` / `src` | 114 | 29 | 0 | 0 | 0 |
| `refinedev/refine` / `packages/mui` | 39 | 24 | 5 | 0 | 0 |
| `rjsf-team/react-jsonschema-form` / `packages/mui` | 6 | 1 | 0 | 0 | 0 |
| `viclafouch/mui-file-input` / `src` | 1 | 1 | 0 | 0 | 0 |
| **Total** | **835** | **527** | **14** | **2** | **1** |

The zero-test `react-hook-form-mui` package scope remains explicitly visible but is not counted as test-bearing breadth.

## Phase 8A status after increment 2

Completed so far:

- target-aware interaction precision guard;
- assertion-order preservation for target-aware evidence;
- package-name-aware self-import discovery using package exports;
- 10 test-bearing external repositories plus one explicit zero-test scope;
- 835 external test files inventoried;
- **527 paired/analyzed test files**;
- stable 14/2/1 production classifications;
- zero known false VERIFIED findings in the carried-forward manual audit.

Still open relative to the broader Phase 8A evidence targets:

- 1,000+ paired/analyzed external tests;
- 50+ manually audited production contracts;
- substantially more reached/verified findings across independent repositories.

The next Phase 8A expansion should therefore add **test-bearing repositories and/or workspace scopes that exercise the existing supported behavior families**, rather than broadening semantics merely to increase the positive count. Discovery quality should continue to be reported separately from behavioral precision.
