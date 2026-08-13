# Behavior providers

Behavior providers translate documented UI-platform or UI-framework semantics into deterministic `BehaviorContract` objects. Providers do not execute components and do not require the target UI framework at runtime.

## Built-in providers

### Native HTML

Recognizes directly bound disabled semantics on native controls, for example:

```tsx
<button disabled={disabled} onClick={onSave}>Save</button>
```

### Material UI

Recognizes imports from `@mui/material` plus direct component modules such as `@mui/material/Button` and `@mui/material/Checkbox`.

Phase 4 contracts:

- `Button`: `disabled=true` suppresses activation.
- `Button`: `loading=true` suppresses activation.
- `Checkbox`: `disabled=true` suppresses change activation.
- controlled `Checkbox`: a click from `checked=false` expects `event.target.checked=true`.
- controlled `Checkbox`: a click from `checked=true` expects `event.target.checked=false`.

The provider accepts default imports, named imports, and named imports aliased locally. A similarly named custom `<Button>` or `<Checkbox>` is never treated as MUI unless its import source identifies it as MUI.

## Verification strength

For Checkbox state transitions, `expect(onChange).toHaveBeenCalled()` is intentionally insufficient. The current deterministic strong oracle is an argument assertion such as:

```tsx
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    target: expect.objectContaining({ checked: true }),
  }),
);
```

The matcher also accepts the equivalent nested shape through `toHaveBeenLastCalledWith`.

## Direct MUI tests

`ubc scan` can analyze supported MUI components rendered directly in tests, without requiring a local wrapper component:

```tsx
import { Button } from '@mui/material';

render(<Button disabled onClick={onClick}>Save</Button>);
await user.click(screen.getByRole('button'));
expect(onClick).not.toHaveBeenCalled();
```

Direct-test inference is limited to concrete boolean states that are visible in the render expression; the scanner does not attempt package-source traversal.

## Custom providers

`extractComponentBehaviors()` accepts an optional provider list. The public `BehaviorProvider` interface is designed so later adapters for Ant Design, Radix, Chakra, or an internal enterprise design system can be added without changing the core scoring model.

Provider implementations should remain deterministic, identify their framework through runtime imports, cite/document the public semantics they encode, and include false-positive tests for similarly named non-framework components.
