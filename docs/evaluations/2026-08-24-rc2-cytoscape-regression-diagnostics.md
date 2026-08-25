# RC.2 Cytoscape regression validation

- candidate: `ed6153d1e7ce0c54db66c2358568c35de4420068`
- finalStatus: `success`
- checkStatus: `0`
- testStatus: `0`
- targetPinStatus: `0`
- analyzerStatus: `0`
- parseStatus: `0`

## Type-check tail
```text

> ui-behavior-coverage@0.1.0-rc.1 check
> tsc -p tsconfig.json --noEmit

```

## Test tail
```text
  ...
# Subtest: extracts public disabled state from logical MUI expressions
ok 73 - extracts public disabled state from logical MUI expressions
  ---
  duration_ms: 17.219223
  ...
# Subtest: traces useThemeProps destructuring back to public disabled/readOnly props
ok 74 - traces useThemeProps destructuring back to public disabled/readOnly props
  ---
  duration_ms: 7.281809
  ...
# Subtest: verifies checked render state through a Testing Library DOM assertion
ok 75 - verifies checked render state through a Testing Library DOM assertion
  ---
  duration_ms: 23.941842
  ...
# Subtest: reports a render-state verification gap when state is reached but unasserted
ok 76 - reports a render-state verification gap when state is reached but unasserted
  ---
  duration_ms: 8.583283
  ...
# Subtest: report schema and tool versions are stable for the RC release
ok 77 - report schema and tool versions are stable for the RC release
  ---
  duration_ms: 1.872736
  ...
# Subtest: component JSON envelope identifies schema, tool, type, and summary
ok 78 - component JSON envelope identifies schema, tool, type, and summary
  ---
  duration_ms: 0.695836
  ...
# Subtest: project JSON envelope identifies schema, tool, type, and summary
ok 79 - project JSON envelope identifies schema, tool, type, and summary
  ---
  duration_ms: 0.26085
  ...
# Subtest: versioned report helpers are available through the public package API
ok 80 - versioned report helpers are available through the public package API
  ---
  duration_ms: 0.219893
  ...
# Subtest: extracts explicit aria-expanded forwarding from a public prop
ok 81 - extracts explicit aria-expanded forwarding from a public prop
  ---
  duration_ms: 11.318047
  ...
# Subtest: verifies aria-expanded when the rendered value and assertion agree
ok 82 - verifies aria-expanded when the rendered value and assertion agree
  ---
  duration_ms: 5.441876
  ...
# Subtest: verifies aria-selected false without treating false as missing evidence
ok 83 - verifies aria-selected false without treating false as missing evidence
  ---
  duration_ms: 2.03429
  ...
# Subtest: keeps a wrong aria assertion at EXERCISED rather than VERIFIED
ok 84 - keeps a wrong aria assertion at EXERCISED rather than VERIFIED
  ---
  duration_ms: 1.677379
  ...
# Subtest: supports public aria-label values as semantic evidence
ok 85 - supports public aria-label values as semantic evidence
  ---
  duration_ms: 1.971951
  ...
# Subtest: does not assign Material UI accessibility semantics to an unrelated custom component
ok 86 - does not assign Material UI accessibility semantics to an unrelated custom component
  ---
  duration_ms: 0.801234
  ...
# Subtest: verifies form-controlled checked state using enclosing describe constants
ok 87 - verifies form-controlled checked state using enclosing describe constants
  ---
  duration_ms: 27.072222
  ...
# Subtest: verifies a bound TextField value
ok 88 - verifies a bound TextField value
  ---
  duration_ms: 20.885127
  ...
# Subtest: verifies Dialog visibility from public open state
ok 89 - verifies Dialog visibility from public open state
  ---
  duration_ms: 14.993357
  ...
# Subtest: does not let an incompatible interaction before the oracle verify a later compatible target
ok 90 - does not let an incompatible interaction before the oracle verify a later compatible target
  ---
  duration_ms: 19.362979
  ...
# Subtest: accepts verification when the compatible target interaction precedes the oracle
ok 91 - accepts verification when the compatible target interaction precedes the oracle
  ---
  duration_ms: 4.513573
  ...
# Subtest: reaches render-state behavior through a one-level test-local wrapper
ok 92 - reaches render-state behavior through a one-level test-local wrapper
  ---
  duration_ms: 34.602348
  ...
# Subtest: respects an explicit wrapper prop override when resolving the wrapped component
ok 93 - respects an explicit wrapper prop override when resolving the wrapped component
  ---
  duration_ms: 10.825422
  ...
1..93
# tests 93
# suites 0
# pass 93
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2739.29372

> ui-behavior-coverage@0.1.0-rc.1 consumer:smoke
> node scripts/consumer-smoke.mjs

Consumer tarball smoke test passed.
```

## Cytoscape analyzer stderr tail
```text
```

## Cytoscape compact summary
```text
{
  "phase": "B — corrected candidate comparison",
  "repository": "cytoscape/cytoscape-web",
  "scope": "src",
  "upstreamSha": "6bd1e50733155ea9f039457ef89b6c0e9595154a",
  "analyzer": {
    "source": "agent/rc2-cytoscape-regressions",
    "commit": "ed6153d1e7ce0c54db66c2358568c35de4420068",
    "reportedToolVersion": "0.1.0-rc.1"
  },
  "summary": {
    "discovered": 12,
    "exercised": 8,
    "verified": 1,
    "behaviorReach": 66.7,
    "behaviorVerification": 8.3,
    "verificationGap": 58.4
  },
  "discovery": {
    "totalTestFiles": 300,
    "testFilesWithRuntimeJsx": 30,
    "testFilesWithTargets": 30,
    "importsExamined": 32,
    "importsResolved": 30,
    "skipped": {
      "no-runtime-jsx": 270,
      "no-rendered-component-import": 0,
      "external-module": 2,
      "unresolved-module": 0,
      "unresolved-barrel-export": 0
    }
  }
}
```
