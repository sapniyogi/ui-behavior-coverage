# Alpha release procedure

Release candidate: `0.1.0-alpha.0`.

## Required gates

Before publishing or tagging a release:

```bash
npm ci
npm run check
npm test
npm run pack:check
node scripts/verify-release-tag.mjs v0.1.0-alpha.0
npm publish --dry-run
```

`npm test` includes the packed-consumer smoke test: it creates a tarball, installs that artifact into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

The release tag must exactly match `v${package.json.version}`.

## First-publication bootstrap

The publishing workflow currently exists at `.github/workflows/release-workflow.example.yml`. Despite its historical filename/comments, GitHub treats it as a live workflow because it is stored under `.github/workflows`, and it is configured to run for `v*` tag pushes.

For the first npm publication, do **not** push `v0.1.0-alpha.0` until the package has been published once and npm Trusted Publishing has been configured. The first publication should be done from a maintainer-controlled authenticated CLI session:

```bash
npm whoami
npm config get registry
npm view ui-behavior-coverage version
npm publish --dry-run
npm publish --access public
```

Before `npm publish`, `npm view ui-behavior-coverage version` should report that the package/version is not present. If it returns an existing package version unexpectedly, stop and investigate before publishing.

After the first publication, verify the registry entry:

```bash
npm view ui-behavior-coverage@0.1.0-alpha.0 name version repository.url
```

Then configure npm Trusted Publishing for:

- GitHub owner/user: `sapniyogi`
- Repository: `ui-behavior-coverage`
- Workflow filename: `release-workflow.example.yml` (or the exact replacement filename if the workflow is renamed before configuration)
- Allowed action: `npm publish`

The trusted-publisher workflow uses a GitHub-hosted runner with `id-token: write` and Node 24.

Because `0.1.0-alpha.0` is already present after the manual bootstrap publish, do not immediately push the same release tag while the workflow still unconditionally runs `npm publish`; that would attempt to republish the already-existing version. Before pushing the alpha.0 tag, either make the publish workflow idempotent for an already-published version, or temporarily disable its tag-triggered publish step. Subsequent versions can be published normally through Trusted Publishing.

## Publishing after bootstrap

For subsequent releases, prefer npm Trusted Publishing (OIDC) rather than a long-lived write token. The npm package trusted publisher must use the exact workflow filename. The publishing job should run on a GitHub-hosted runner, grant `id-token: write`, use a current Node/npm combination supported by npm Trusted Publishing, run all release gates, and then run `npm publish --access public`.

## Release checklist

- `main` contains the exact release source.
- CI is green on supported Node versions.
- consumer tarball smoke passes.
- `npm pack --dry-run` contains only intended files.
- `npm publish --dry-run` shows the intended package/version/content.
- npm CLI authentication is verified with `npm whoami`.
- registry is `https://registry.npmjs.org/`.
- package-name/version availability is checked before the first publish.
- README capability matrix and known limitations are current.
- precision audit has zero known false VERIFIED classifications.
- changelog entry exists.
- first publication is verified with `npm view`.
- Trusted Publishing is configured for the exact workflow filename before automated releases.
- git tag matches `package.json` version and is only pushed when the publish workflow cannot duplicate-publish the same version.
- npm package page/repository metadata point to this repository.
