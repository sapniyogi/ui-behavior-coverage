# Five-repository external evaluation — 2026-08-13

This evaluation ran the Phase 5 `ui-behavior-coverage` analyzer against five substantial public Material UI codebases using a GitHub Actions matrix. Each target was shallow-cloned at a recorded upstream commit and scanned without installing the target repository's dependencies.

## Results

| Repository | Scope | Test files in scope | TSX files | Files importing `@mui/material` | Test files analyzed | Behaviors discovered | Behaviors exercised | Behaviors verified |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| OpenCTI-Platform/opencti | `opencti-platform/opencti-front` | 190 | 1,865 | 1,133 | 51 | 0 | 0 | 0 |
| marmelab/react-admin | `packages/ra-ui-materialui` | 118 | 487 | 332 | 78 | 0 | 0 | 0 |
| mui/mui-x | `packages/x-data-grid` | 45 | 180 | 49 | 1 | 0 | 0 | 0 |
| mui/toolpad | `packages/toolpad-core` | 19 | 95 | 31 | 16 | 0 | 0 | 0 |
| clash-verge-rev/clash-verge-rev | `src` | 8 | 124 | 108 | 1 | 0 | 0 | 0 |

The zero behavior counts must **not** be interpreted as 100% quality or as evidence that the repositories contain no relevant UI behavior. They show that the Phase 5 production discovery/inference boundary is still too narrow for mature codebases.

## Reproducibility

Upstream SHAs:

- OpenCTI-Platform/opencti: `2dfbddd21c3316bfcd1b3d7e1a35358feb9e6223`
- marmelab/react-admin: `051f511bb0afb5ea565c2d3728bf4dab0a6fa5e0`
- mui/mui-x: `17580d3dfe835b4d4b1290f50c4d95ed7b74de21`
- mui/toolpad: `b2a4a69f343e98e6f3f7ebeba47dbc609c542e37`
- clash-verge-rev/clash-verge-rev: `aadceba0642b8f58cf7c6e426ff29bf6846cbfe1`

The evaluation workflow is `.github/workflows/external-evaluation.yml`; raw benchmark data is stored beside this report in `2026-08-13-five-repo-evaluation.json`.

## Root-cause observations

### 1. Real JSX conditions are expressions, not just direct identifiers

The Phase 5 provider intentionally recognizes narrow forms such as `checked={checked}` or `disabled={disabled}`. Mature repositories frequently use expressions such as:

```tsx
<Switch
  checked={filigran_chatbot_ai_cgu_status === CGUStatus.enabled}
  onChange={handleCGUStatusChange}
/>
```

or:

```tsx
<Switch
  checked={Boolean(field.value)}
  disabled={disabled || readOnly}
  onChange={handleChange}
/>
```

These are semantically understandable but currently outside the provider's direct-binding model.

### 2. Wrapper propagation is required

Production code commonly hides MUI semantics behind wrappers and styling layers. Clash Verge Rev, for example, creates a styled wrapper that forwards all props into `MuiSwitch`:

```tsx
export const Switch = styled((props: SwitchProps) => (
  <MuiSwitch {...props} />
))(...);
```

The analyzer currently does not infer that the exported wrapper preserves the underlying MUI Switch contract.

### 3. Internal subcomponent behavior is filtered away at exported boundaries

Some files define behavior inside an internal component but export/test a wrapper component. The project scanner currently filters inferred contracts to component names directly imported and rendered by tests, so behavior discovered inside an internal implementation component is not propagated to the exported wrapper.

### 4. Project discovery coverage is too low in monorepos

The inventory/analyzed-test delta is especially large in MUI X (45 test files in scope, 1 analyzed) and Clash Verge Rev (8 test files, 1 analyzed). Current discovery requires relatively imported TSX sources rendered directly in JSX and deliberately skips many alias/barrel/helper patterns common in production repositories.

### 5. Real test harnesses often use custom render helpers and indirection

Large repositories frequently wrap Testing Library `render`, use context/provider harnesses, render through story/test utilities, or reach components through index/barrel exports. The current analyzer recognizes direct `render()` patterns only.

## Recommended production-readiness phase

Before adding more MUI component types, prioritize the following:

1. expression-aware prop conditions: boolean coercion, logical expressions, equality expressions, property access;
2. wrapper/prop-forwarding propagation through `...props` and simple `styled()` wrappers;
3. contract propagation from internal implementation components to exported wrappers;
4. project resolution for barrel exports, aliases, extensionless/index imports, and tsconfig paths;
5. configurable render-helper recognition (`renderWithProviders`, custom test harnesses);
6. discovery telemetry that reports why files/contracts were skipped;
7. re-run this exact five-repository benchmark after each production-readiness milestone.

This external benchmark should remain a regression target: the goal is not merely to increase discovered counts, but to increase useful findings while preserving a low false-positive rate.
