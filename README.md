# ui-behavior-coverage

Behavioral verification coverage for UI component tests.

Traditional code coverage answers **"did this code execute?"** This project asks a different question:

> **Did the test explicitly verify the behavior it exercised?**

## Status

Early research-driven MVP (`0.1.0-alpha`). The initial implementation intentionally supports a narrow React/TSX behavior so the core measurement can be validated before broadening inference.

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

`scan` conservatively discovers test files that directly render a relatively imported TSX component, groups all matching tests for that component, and reports project-level Behavior Reach, Behavior Verification, and Verification Gap. Type-only imports, unresolved package imports, and aliased named component imports are intentionally ignored in this phase to avoid false positives.

## v0.1 supported contract

The first deterministic rule recognizes directly-bound native disabled semantics:

```tsx
<button disabled={disabled} onClick={onSave}>
```

and test bindings of the form:

```tsx
<SaveButton disabled onSave={onSave} />
```

Verification currently recognizes:

```tsx
expect(onSave).not.toHaveBeenCalled();
expect(onSave).toHaveBeenCalledTimes(0);
```

See [`docs/architecture.md`](docs/architecture.md) for deliberate limitations.

## Research context and independence

This project is motivated by recent research on behavioral test adequacy, metamorphic relations, UI-component testing, and weak test oracles. It is an independent implementation with its own terminology and architecture. Project contributors should not copy paper prose, figures, prompts, datasets, supplemental artifacts, or source code unless a separate license has been verified to permit that reuse.

A key research inspiration is:

> Pei, Y., Zhang, C., Sohn, J., & Papadakis, M. *Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic Relations.* arXiv:2608.03337 (2026).

The project is not affiliated with or endorsed by the paper's authors.

## Roadmap

1. Prove the exercised-vs-verified model on precise native behaviors.
2. Add richer assertion/data-flow matching.
3. Add more native behavioral contracts: keyboard activation, checked/selected state, ARIA state coupling, and controlled input behavior.
4. Harden project discovery and add framework-native Vitest/Jest integrations.
5. Evaluate on real open-source component libraries.
6. Only then consider optional semantic/LLM-assisted contract inference.

## License

MIT.
