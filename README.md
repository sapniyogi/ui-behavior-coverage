# ui-behavior-coverage

Behavioral verification coverage for UI component tests, with an emerging design-system conformance layer.

Traditional code coverage answers **"did this code execute?"** This project asks a different question:

> **Did the test explicitly verify the behavior it exercised?**

## Status

Early research-driven MVP (`0.1.0-alpha`). The implementation is deterministic and conservative: behavioral contracts are expanded only when they can be inferred with explainable evidence and guarded against false positives.

## Core metrics

- **Behavior Reach** — proportion of discovered behaviors exercised by tests.
- **Behavior Verification** — proportion explicitly verified by assertions.
- **Verification Gap** — reach minus verification; a signal that tests touch behavior without proving the result.

## CLI

```bash
npm install
npm run build

node dist/src/cli/index.js analyze \
  --component tests/fixtures/SaveButton.tsx \
  --test tests/fixtures/SaveButton.weak.test.tsx
```

After publication, the intended command is:

```bash
npx ui-behavior-coverage analyze --component Component.tsx --test Component.test.tsx
ubc scan .
ubc scan packages/ui --json
```

`scan` conservatively discovers tests that directly render relatively imported TSX components, groups matching tests for a component, and recognizes supported direct Material UI package imports.

## Material UI behavior support

The Material UI provider recognizes supported components statically from imports. `ui-behavior-coverage` does **not** depend on `@mui/material` at runtime.

Current contracts:

- `Button`: disabled and loading activation suppression.
- `Checkbox`: disabled suppression and controlled checked-state transitions.
- `Switch`: disabled suppression and controlled checked-state transitions.
- standalone `Radio`: disabled suppression and unchecked-to-checked selection.
- controlled `TextField`: typing must explicitly verify `onChange` `event.target.value`.
- controlled native-mode `Select`: `selectOptions` must explicitly verify `onChange` `event.target.value`.

For state/value contracts, callback presence alone is not enough:

```tsx
expect(onChange).toHaveBeenCalled(); // still EXERCISED
```

A stronger oracle verifies the documented event field:

```tsx
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ checked: true }),
  }),
);
```

or:

```tsx
expect(onChange).toHaveBeenLastCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ value: 'Ada' }),
  }),
);
```

Non-native Material UI Select is deliberately not assigned native `selectOptions` semantics yet; its popup/menu interaction model will get a separate rule.

See [`docs/providers.md`](docs/providers.md) for provider details.

## Realistic MUI evaluation

Phase 5 includes an application-style `PreferencesForm` fixture combining `Box`, `Switch`, `Radio`, `TextField`, and native `Select`. The accompanying test suite intentionally verifies only part of the inferred behavior space so a project scan exposes remaining coverage rather than producing a synthetic perfect score.

## Box and subtle design guidance

Visual/design-system policy is intentionally separate from behavioral test coverage.

Phase 5 starts a Material UI design-observation API with `Box` `sx.borderRadius`:

```tsx
<Box sx={{ borderRadius: 2 }} />
```

For MUI System, numeric border-radius values are theme multipliers. The extractor records the multiplier and, for convenience, the equivalent value under MUI's default 4px shape radius. Because applications can override the theme, that default-pixel value is informational only.

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

This design layer can later grow to spacing, colors, typography, shadows, responsive rules, and component variants without contaminating Behavior Reach or Behavior Verification.

See [`docs/design-guidance.md`](docs/design-guidance.md).

## Native HTML contract

The initial deterministic rule recognizes directly-bound native disabled semantics:

```tsx
<button disabled={disabled} onClick={onSave}>
```

and verifies suppression with assertions such as:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

## Project discovery boundaries

Local component discovery pairs a test with component source only when a runtime relative import resolves to TSX and the imported identifier is rendered directly. Type-only imports, unresolved files, namespace JSX, JavaScript/JSX files, framework-specific path aliases, and unsupported package imports remain outside the current boundary. Supported Material UI package imports are an explicit provider-backed exception.

## Research context and independence

This project is motivated by research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles. It is an independent implementation with its own terminology and architecture. Contributors should not copy paper prose, figures, prompts, datasets, supplemental artifacts, or source code unless a separate license has been verified to permit reuse.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Roadmap

1. Prove exercised-vs-verified measurement on precise native behavior.
2. Add richer assertion/data-flow matching.
3. Add project discovery, packaging, and CI quality gates.
4. Add provider-based Material UI Button/Checkbox support.
5. Expand to Switch, Radio, TextField, native Select, realistic MUI fixtures, and initial Box design guidance.
6. Add non-native Select semantics and broaden design-token analysis.
7. Evaluate against larger real-world open-source MUI suites.
8. Add additional providers such as Ant Design, Radix, Chakra, or internal enterprise design systems.
9. Only then consider optional semantic/LLM-assisted contract inference.

## License

MIT.
