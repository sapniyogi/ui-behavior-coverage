# Alpha readiness summary

Completed: full Phase 7 source on the release branch, Node 20/22 CI, 66 regression tests, versioned JSON schema, packed-consumer install/CLI/import smoke, npm package dry-run, updated README/capability matrix, changelog, contribution guidance, release procedure, trusted-publishing workflow example, and a manually audited production precision record with zero known false VERIFIED findings.

The Phase 7.5 pull request must be merged to `main` because the earlier stacked merges did not actually place Phases 3–7 on `main`.

## External benchmark status

The release branch now reruns the original five pinned scopes and adds a sixth independent public MUI scope:

- Refine `packages/mui` at `779d52a20e29b0307ac0df04d135beba434370dc`.

Refine inventory/result on the pinned run:

- 39 test files;
- 87 TSX files;
- 42 files importing `@mui/material`;
- 24 test files paired/analyzed;
- 5 conservative contracts discovered;
- 0 reached;
- 0 verified.

The five Refine contracts are `loading=true -> disabled=true` render-state contracts for Refine MUI button wrappers. They are valid discovered public contracts, but the paired tests do not render those buttons with a statically resolvable `loading=true` condition, so the analyzer correctly leaves them DISCOVERED.

This broadens the pinned corpus, but it does **not** satisfy the desirable benchmark of two independent repositories with reached contracts. React Admin remains the only current benchmark repository with reached/verified contracts. We do not relax inference rules merely to turn a repository non-zero.

## Release blockers vs. benchmark goals

Engineering release gates are complete on the branch: clean install, CLI/API loading, schema versioning, regression tests, package dry-run, documentation, and zero known false VERIFIED classifications.

Maintainer-controlled follow-ups before publishing:

1. merge PR #8 to `main` so GitHub source and npm source match;
2. install/review the actual `.github/workflows` publish workflow (the connector cannot safely write workflow permission files);
3. perform the first npm publication under maintainer-controlled authentication if the package does not yet exist, then configure npm Trusted Publishing for subsequent releases;
4. tag the final `main` release commit as `v0.1.0-alpha.0` and run the release checklist.

A second independent repository with a reached contract remains a **benchmark-quality target**, not a reason to weaken conservative analysis or indefinitely block an explicitly experimental `0.1.0-alpha.0` release.
