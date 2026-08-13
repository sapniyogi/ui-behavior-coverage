# Alpha release procedure

Release candidate: `0.1.0-alpha.0`.

## Required gates

Before tagging a release:

```bash
npm ci
npm run check
npm test
npm run pack:check
node scripts/verify-release-tag.mjs v0.1.0-alpha.0
```

`npm test` includes the packed-consumer smoke test: it creates a tarball, installs that artifact into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

The release tag must exactly match `v${package.json.version}`.

## Publishing

For GitHub Actions publication, prefer npm Trusted Publishing (OIDC) rather than a long-lived write token. Configure the npm package's trusted publisher for this repository and the exact workflow filename. The publishing job should run on a GitHub-hosted runner, grant `id-token: write`, use a current Node/npm combination supported by npm Trusted Publishing, run all release gates, and then run `npm publish --access public`.

The connector used to prepare Phase 7.5 could not install or edit a `.github/workflows` publishing file, so `docs/release-workflow.example.yml` is provided for maintainer review rather than silently changing release permissions.

For a first publication where trusted-publisher configuration is not yet available, follow npm's current first-publication/account requirements, publish once under maintainer-controlled authentication, then configure Trusted Publishing for subsequent releases.

## Release checklist

- `main` contains the exact release source.
- CI is green on supported Node versions.
- consumer tarball smoke passes.
- `npm pack --dry-run` contains only intended files.
- `package.json` version and git tag match.
- README capability matrix and known limitations are current.
- precision audit has zero known false VERIFIED classifications.
- changelog entry exists.
- tag `v0.1.0-alpha.0` is created from the release commit.
- npm package page/repository metadata point to this repository.
