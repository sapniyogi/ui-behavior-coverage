# Design guidance

`ui-behavior-coverage` keeps visual/design-system conformance separate from behavioral test coverage.

Behavioral coverage asks whether a test exercises and verifies an interaction contract. Design guidance asks whether source-level UI choices conform to a declared design-system policy. Mixing the two would make Behavior Reach and Behavior Verification harder to interpret, so design observations and guidance results use separate types and APIs.

## Material UI Box border radius

Phase 5 introduces the first design observation: `Box` `sx.borderRadius`.

```tsx
import { Box } from '@mui/material';

export function Card() {
  return <Box sx={{ borderRadius: 2 }}>Content</Box>;
}
```

MUI System treats a numeric `borderRadius` as a multiplier of `theme.shape.borderRadius`. The default Material UI theme currently uses a 4px base radius, so `borderRadius: 2` corresponds to 8px under the default theme. Applications may override the theme shape, so `defaultThemePixels` in the observation is informational rather than a guaranteed computed runtime value.

Extraction:

```ts
import { extractMaterialUiDesignObservations } from 'ui-behavior-coverage';

const observations = extractMaterialUiDesignObservations(source, 'Card.tsx');
```

A numeric value produces a theme-relative observation:

```ts
{
  kind: 'mui-box-border-radius',
  property: 'borderRadius',
  value: {
    kind: 'theme-multiplier',
    value: 2,
    defaultThemePixels: 8,
  },
}
```

A CSS literal is preserved as a literal:

```tsx
<Box sx={{ borderRadius: '16px' }} />
```

```ts
{
  kind: 'css-literal',
  value: '16px',
}
```

## Policy evaluation

A project or design system can define allowed values independently of behavioral coverage:

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

Each result is `compliant` or `noncompliant` and includes a deterministic reason.

## Why this can grow beyond corner radius

The same design-observation layer can later cover spacing, palette tokens, shadows, typography, responsive breakpoints, component variants, density, focus styles, and accessibility-related visual states without changing behavioral coverage metrics.

## Current limits

Phase 5 intentionally recognizes only object-literal `sx` values such as:

```tsx
<Box sx={{ borderRadius: 2 }} />
<Box sx={{ borderRadius: '16px' }} />
```

It does not yet resolve:

- `sx` arrays;
- theme callback functions;
- spread-composed style objects;
- `styled()` definitions;
- theme `components.styleOverrides`;
- CSS classes or external stylesheets;
- responsive radius objects;
- the application's actual custom `theme.shape.borderRadius` at runtime;
- rendered/computed CSS or screenshot-level visual differences.

Those require additional static resolution or an optional runtime/browser adapter and should be added with explicit false-positive tests.

## MUI references

- MUI System borders: https://mui.com/system/borders/
- Material UI shape customization: https://mui.com/material-ui/customization/shape/
