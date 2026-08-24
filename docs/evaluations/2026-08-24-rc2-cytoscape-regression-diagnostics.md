# RC.2 Cytoscape regression validation

- candidate: `7ce7e417ed6d0decdc26a816cd34eedfeea9856e`
- finalStatus: `failed`
- checkStatus: `2`
- testStatus: `2`
- targetPinStatus: `-1`
- analyzerStatus: `-1`
- parseStatus: `-1`

## Type-check tail
```text

> ui-behavior-coverage@0.1.0-rc.1 check
> tsc -p tsconfig.json --noEmit

src/react/expand-test-render-evidence.ts(128,9): error TS2345: Argument of type 'ConciseBody | undefined' is not assignable to parameter of type 'Node'.
  Type 'undefined' is not assignable to type 'Node'.
src/react/expand-test-render-evidence.ts(152,27): error TS2345: Argument of type 'ConciseBody | undefined' is not assignable to parameter of type 'Node'.
  Type 'undefined' is not assignable to type 'Node'.
src/react/expand-test-render-evidence.ts(154,17): error TS18048: 'fn.body' is possibly 'undefined'.
```

## Test tail
```text

> ui-behavior-coverage@0.1.0-rc.1 test
> npm run test:unit && npm run consumer:smoke


> ui-behavior-coverage@0.1.0-rc.1 test:unit
> npm run build && node --test dist/tests/*.test.js


> ui-behavior-coverage@0.1.0-rc.1 build
> npm run clean && tsc -p tsconfig.json


> ui-behavior-coverage@0.1.0-rc.1 clean
> node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})"

src/react/expand-test-render-evidence.ts(128,9): error TS2345: Argument of type 'ConciseBody | undefined' is not assignable to parameter of type 'Node'.
  Type 'undefined' is not assignable to type 'Node'.
src/react/expand-test-render-evidence.ts(152,27): error TS2345: Argument of type 'ConciseBody | undefined' is not assignable to parameter of type 'Node'.
  Type 'undefined' is not assignable to type 'Node'.
src/react/expand-test-render-evidence.ts(154,17): error TS18048: 'fn.body' is possibly 'undefined'.
```

## Cytoscape analyzer stderr tail
```text
```

## Cytoscape compact summary
```text
```
