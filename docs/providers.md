# Behavior providers

Behavior providers translate documented UI-platform or UI-framework semantics into deterministic `BehaviorContract` objects. Providers do not execute components and do not require the target UI framework at runtime.

## Built-in providers

### Native HTML

Recognizes directly bound disabled semantics on native controls, for example:

```tsx
<button disabled={disabled} onClick={onSave}>Save</button>
```

### Material UI

Recognizes supported imports from `@mui/material` plus direct component modules such as `@mui/material/Button`, `@mui/material/Switch`, and `@mui/material/TextField`.

Current behavior contracts:

- `Button`: `disabled=true` suppresses activation.
- `Button`: `loading=true` suppresses activation.
- `Checkbox`: `disabled=true` suppresses change activation.
- controlled `Checkbox`: clicks verify the expected `event.target.checked` transition in both directions.
- `Switch`: `disabled=true` suppresses change activation.
- controlled `Switch`: clicks verify the expected `event.target.checked` transition in both directions.
- standalone `Radio`: `disabled=true` suppresses change activation.
- controlled standalone `Radio`: clicking from `checked=false` expects `event.target.checked=true`; no true-to-false toggle contract is inferred.
- controlled `TextField`: typing requires an oracle on `onChange` `event.target.value`.
- controlled native-mode `Select`: `selectOptions` requires an oracle on `onChange` `event.target.value`.

The provider accepts default imports, named imports, and named imports aliased locally. A similarly named custom component is never treated as MUI unless its runtime import source identifies it as MUI.

## Verification strength

For boolean state transitions, `expect(onChange).toHaveBeenCalled()` is intentionally insufficient. A strong deterministic oracle is an argument assertion such as:

```tsx
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ checked: true }),
  }),
);
```

For controlled text/value components, callback invocation alone is also insufficient. The current value oracle requires the documented event path to be asserted:

```tsx
expect(onChange).toHaveBeenLastCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ value: 'Ada' }),
  }),
);
```

The Phase 5 value matcher verifies that `target.value` is explicitly asserted. It does not yet prove that the asserted literal is the mathematically/semantically correct result of the preceding typing or selection sequence; deriving exact value flow is future work.

## Select boundary

Phase 5 intentionally supports `Select` only when `native` is statically true. This maps cleanly to Testing Library `selectOptions` semantics. Non-native Material UI Select uses a popup/menu interaction model and is deliberately left unsupported rather than treating it like a native `<select>` and risking false positives.

## Direct MUI tests

`ubc scan` can analyze supported MUI components rendered directly in tests, without requiring a local wrapper component. Direct inference now includes Button, Checkbox, Switch, Radio, TextField, and native-mode Select when the required state/callback props are visible in the render expression.

The scanner does not traverse package source code and does not require `@mui/material` as a dependency of `ui-behavior-coverage` itself.

## Realistic fixture evaluation

`tests/fixtures/mui-realistic/PreferencesForm.tsx` mixes Box, Switch, Radio, TextField, and native Select in one application-style form. Its project test intentionally verifies only a subset of inferred behaviors so the project scan can demonstrate a real verification gap instead of a synthetic 100% result.

## Design guidance is separate

Material UI `Box` is recognized by the design-observation layer for selected `sx` properties rather than by behavioral coverage. Phase 5 starts with `sx.borderRadius`. See [`design-guidance.md`](design-guidance.md).

## Custom providers

`extractComponentBehaviors()` accepts an optional provider list. The public `BehaviorProvider` interface is designed so later adapters for Ant Design, Radix, Chakra, or an internal enterprise design system can be added without changing the core scoring model.

Provider implementations should remain deterministic, identify their framework through runtime imports, encode documented public semantics, and include false-positive tests for similarly named non-framework components.
