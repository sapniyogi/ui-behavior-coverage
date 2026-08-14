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
npm publish --dry-run --tag alpha
```

`npm test` includes the packed-consumer smoke test: it creates a tarball, installs that artifact into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

The release tag must exactly match `v${package.json.version}`. Alpha builds are published under the npm `alpha` dist-tag. The npm registry also requires package metadata to contain a `latest` dist-tag; for a package whose only published version is the first alpha, `latest` can point to that same alpha even though publication used `--tag alpha`. Do not try to delete `latest`; move it to the first stable release when one exists.

## First-publication bootstrap

The release workflow lives at `.github/workflows/release-workflow.example.yml` and runs for `v*` tag pushes. It is idempotent: if the exact package version already exists on npm, it skips the duplicate publish.

For the first publication, verify the local npm session and registry, confirm the package name/version is not already present, run the dry-run gates, and publish `0.1.0-alpha.0` under the `alpha` dist-tag.

After the package exists, configure npm Trusted Publishing for GitHub owner `sapniyogi`, repository `ui-behavior-coverage`, workflow filename `release-workflow.example.yml`, with `npm publish` allowed.

After Trusted Publishing is configured, push `v0.1.0-alpha.0`. The workflow will run all release checks and skip a duplicate registry publish if the bootstrap version is already present.

## Subsequent prereleases

For later alpha versions, update `package.json`, merge the release change to `main`, and push the matching `v*` tag. The workflow publishes new versions under the `alpha` dist-tag.

Reserve `latest` for a stable release once a stable version exists. Until then, the registry may keep `latest` pointing at the only published alpha version.

## Release checklist

- `main` contains the exact release source.
- CI is green on supported Node versions.
- consumer tarball smoke passes.
- `npm pack --dry-run` contains only intended files.
- `npm publish --dry-run --tag alpha` shows the intended package/version/content.
- npm CLI authentication and registry are verified.
- package-name/version availability is checked before the first publish.
- `publishConfig.tag` is `alpha` for the prerelease.
- README installs the prerelease with `ui-behavior-coverage@alpha`.
- precision audit has zero known false VERIFIED classifications.
- changelog entry exists.
- first publication is verified in the npm registry.
- `alpha` points to the prerelease; if `latest` also points to the first alpha because no stable version exists yet, leave it in place and move it when the first stable version is published.
- Trusted Publishing is configured for the exact workflow filename before automated future publishes.
- git tag matches `package.json` version.
- npm package page/repository metadata point to this repository.
