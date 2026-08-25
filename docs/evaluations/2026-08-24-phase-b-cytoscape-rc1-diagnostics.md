# Phase B Cytoscape RC.1 diagnostics

- finalStatus: `success`
- installStatus: `0`
- provenanceStatus: `0`
- analyzerStatus: `0`
- parseStatus: `0`

## npm install tail
```text

added 2 packages in 1s
```

## provenance
```text
Published package verified: ui-behavior-coverage@0.1.0-rc.1
TOOL_VERSION verified: 0.1.0-rc.1
```

## analyzer stderr tail
```text
```

## parse output
```text
{
  "phase": "B — RC.1 empirical validation",
  "repository": "cytoscape/cytoscape-web",
  "scope": "src",
  "upstreamSha": "6bd1e50733155ea9f039457ef89b6c0e9595154a",
  "analyzer": {
    "package": "ui-behavior-coverage",
    "version": "0.1.0-rc.1",
    "source": "published npm package"
  },
  "schemaVersion": "1",
  "toolVersion": "0.1.0-rc.1",
  "summary": {
    "discovered": 14,
    "exercised": 4,
    "verified": 0,
    "behaviorReach": 28.6,
    "behaviorVerification": 0,
    "verificationGap": 28.6
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
