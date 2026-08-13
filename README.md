# ui-behavior-coverage

Behavioral verification coverage for UI component tests.

Traditional code coverage answers **"did this code execute?"** This project asks a different question:

> **Did the test explicitly verify the behavior it exercised?**

## Status

Early research-driven MVP (`0.1.0-alpha`). The implementation is intentionally deterministic and conservative: supported behavioral contracts are expanded only when they can be inferred with explainable evidence and guarded against false positives.

## Example

Component:

```tsx
export function SaveButton({ disabled, onSave }) {
  return (
    <button disabled={disabled} onClick={onSave}>
      Save
    </button>
  );
}
```

Weak test:

```tsx
it('handles a disabled button', async () => {
  const onSave = vi.fn();
  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button'));
});
```

The behavior is reached, but the expected outcome is never asserted.

`ui-behavior-coverage` reports it as **EXERCISED**, not **VERIFIED**, and suggests:

```tsx
expect(onSave).not.toHaveBeenCalled();
```

## Metrics

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
```

JSON output:

```bash
ubc analyze --component Component.tsx --test Component.test.tsx --json
```

Project scan:

```bash
ubc scan .
ubc scan packages/ui --json
```

`scan` conservatively discovers tests that directly render relatively imported TSX components, groups all matching tests for a component, and also recognizes supported direct Material UI package imports. It reports project-level Behavior Reach, Behavior Verification, and Verification Gap.

## Material UI support

Phase 4 adds a framework-provider layer with first-class static support for selected Material UI contracts. `ui-behavior-coverage` does **not** add `@mui/material` as a runtime dependency; it recognizes supported MUI components from source imports.

Supported MUI contracts in this phase:

- `Button`: `disabled=true` suppresses `onClick` activation.
- `Button`: `loading=true` suppresses `onClick` activation.
- `Checkbox`: `disabled=true` suppresses change activation.
- controlled `Checkbox`: clicking from `checked=false` expects `event.target.checked=true`.
- controlled `Checkbox`: clicking from `checked=true` expects `event.target.checked=false`.

Both package-level and direct component imports are recognized, including local aliases:

```tsx
import { Button, Checkbox } from '@mui/material';
import MuiButton from '@mui/material/Button';
import MuiCheckbox from '@mui/material/Checkbox';
```

For controlled Checkbox behavior, a weak assertion such as:

```tsx
expect(onChange).toHaveBeenCalled();
```

is still **EXERCISED**, because it does not verify the correct next state. A stronger supported oracle is:

```tsx
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ checked: true }),
  }),
);
```

See [`docs/providers.md`](docs/providers.md) for the provider model and [`docs/architecture.md`](docs/architecture.md) for deliberate limitations.

## Native HTML contract

The initial deterministic rule recognizes directly-bound native disabled semantics:

```tsx
<button disabled={disabled} onClick={onSave}>
```

and test bindings of the form:

```tsx
<SaveButton disabled onSave={onSave} />
```

Suppression verification recognizes:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

## Project discovery boundaries

Local component discovery currently pairs a test with component source only when a runtime relative import resolves to TSX and the imported identifier is rendered directly. Type-only imports, unresolved files, namespace JSX, JavaScript/JSX files, framework-specific path aliases, and unsupported package imports remain outside the current discovery boundary. Supported Material UI package imports are an explicit exception handled by the MUI provider.

## Research context and independence

This project is motivated by recent research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles. It is an independent implementation with its own terminology and architecture. Project contributors should not copy paper prose, figures, prompts, datasets, supplemental artifacts, or source code unless a separate license has been verified to permit that reuse.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Roadmap

1. Prove the exercised-vs-verified model on precise native behaviors.
2. Add richer assertion/data-flow matching.
3. Add project discovery, reproducible packaging, and CI quality gates.
4. Add provider-based Material UI support for Button and Checkbox.
5. Expand framework contracts (Switch, Radio, TextField, Select) and evaluate on real open-source component libraries.
6. Add additional providers such as Ant Design, Radix, Chakra, or internal enterprise design systems.
7. Only then consider optional semantic/LLM-assisted contract inference.

## License

MIT.
