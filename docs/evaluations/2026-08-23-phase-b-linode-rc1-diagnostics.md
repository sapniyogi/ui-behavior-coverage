# Phase B Linode RC.1 diagnostics

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
  "repository": "linode/apl-console",
  "scope": "src",
  "upstreamSha": "961e3a24fc9fa5ee3294370f9a25dbf911a4ec01",
  "analyzer": {
    "package": "ui-behavior-coverage",
    "version": "0.1.0-rc.1",
    "source": "published npm package"
  },
  "schemaVersion": "1",
  "toolVersion": "0.1.0-rc.1",
  "summary": {
    "discovered": 1,
    "exercised": 0,
    "verified": 0,
    "behaviorReach": 0,
    "behaviorVerification": 0,
    "verificationGap": 0
  },
  "discovery": {
    "totalTestFiles": 25,
    "testFilesWithRuntimeJsx": 13,
    "testFilesWithTargets": 12,
    "importsExamined": 16,
    "importsResolved": 12,
    "skipped": {
      "no-runtime-jsx": 12,
      "no-rendered-component-import": 1,
      "external-module": 4,
      "unresolved-module": 0,
      "unresolved-barrel-export": 0
    }
  }
}
```
