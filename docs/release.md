# npm release procedure

Current release candidate: `0.1.0-rc.1`.

The authoritative release workflow is `.github/workflows/release.yml`. It is a manually dispatched GitHub Actions workflow that validates the exact package version and npm publish channel before publishing.

## Release channels

The package currently uses these channels:

- `alpha` for the original public alpha line;
- `rc` for release candidates such as `0.1.0-rc.1`;
- `latest` for the version that an unqualified `npm install ui-behavior-coverage` should install.

The package's `publishConfig.tag` remains `rc` while the package version is an RC. A maintainer may intentionally promote a validated RC to `latest` after publication when that RC should become the default install:

```bash
npm dist-tag add ui-behavior-coverage@0.1.0-rc.1 latest
npm dist-tag ls ui-behavior-coverage
```

Trusted Publishing/OIDC is used for `npm publish`; npm dist-tag changes require an authenticated npm session and are not performed by the OIDC release workflow.

## Required gates

Before a real publication, the workflow runs the same repository gates used by CI:

```bash
npm ci
npm run check
npm test
npm run pack:check
```

`npm test` includes the packed-consumer smoke test. It builds a tarball, installs that artifact into a temporary npm project, invokes the installed CLI, scans a fixture, and verifies CommonJS and ESM loading.

The workflow also validates that:

- `package.json`, `package-lock.json`, `CHANGELOG.md`, README release text, and `TOOL_VERSION` agree on the requested version;
- `publishConfig.access` is public and `publishConfig.tag` matches the selected publication channel;
- the release is run from the current `main` branch;
- the exact package tarball contains a non-empty `package/README.md` matching the intended release source;
- an already-published version is never published again;
- after publication, the exact version exists on npm and the selected publication dist-tag points to it.

Version-specific npm README metadata is checked only as a best-effort diagnostic after publication. It is not a release blocker because the packaged README is verified directly from the tarball before publication.

## Normal RC release

For a new release candidate:

1. update the package version, lockfile, changelog, README release text, and `TOOL_VERSION` together;
2. merge the release preparation to `main` only after CI is green;
3. run `.github/workflows/release.yml` with:
   - `version`: the exact RC version;
   - `npm_tag`: `rc`;
   - `dry_run`: `true`;
   - `release_commit`: leave blank;
4. inspect the dry-run artifact and logs;
5. run the same workflow again with `dry_run: false`;
6. verify the npm version/tag, Git tag, and GitHub prerelease.

For stable `0.1.0`, use `npm_tag: latest` only after the package metadata has been changed from the RC version to the stable version.

## Recovery after npm publication succeeded

A real publish can succeed on npm and still fail later while verifying registry metadata or creating GitHub release bookkeeping. Because npm package versions are immutable, **do not republish the same version**.

The workflow supports recovery through the optional `release_commit` input. Use it only for a version that already exists on npm.

For the `0.1.0-rc.1` recovery, the original release source commit is:

```text
e97b390d3499bbda40ee5e21383a40988a98f8ab
```

After the recovery-capable workflow is merged to `main`, first run a recovery dry run with:

```text
version: 0.1.0-rc.1
npm_tag: rc
dry_run: true
release_commit: e97b390d3499bbda40ee5e21383a40988a98f8ab
```

Recovery mode:

- requires the requested version to already exist on npm;
- validates that the original commit reports the requested package and tool version;
- downloads the already-published npm tarball instead of rebuilding an artifact for publication;
- verifies that the published tarball's version and README match the original release source;
- never calls `npm publish`;
- creates or verifies `v<version>` at the original release source commit;
- creates or updates the GitHub prerelease and attaches the published npm artifact.

If the recovery dry run succeeds, repeat with `dry_run: false` to backfill the missing Git tag and GitHub prerelease.

## Trusted Publishing

npm Trusted Publishing is configured for:

- GitHub owner: `sapniyogi`
- repository: `ui-behavior-coverage`
- workflow: `release.yml`
- publication command: `npm publish`

The workflow requires `id-token: write` and a GitHub-hosted runner. Keep the trusted-publisher workflow filename synchronized with npm package settings.

## Release checklist

- `main` contains the intended release preparation or recovery workflow.
- CI is green on supported Node versions.
- consumer tarball smoke passes.
- `npm pack --dry-run` contains only intended files for a new publication.
- the workflow dry run succeeds before a new real publication.
- package name/version availability is checked before publishing a new version.
- `publishConfig.tag` matches the publication channel (`rc` for the current RC line).
- README and changelog identify the intended release version.
- precision audit has no known false VERIFIED classifications that block release.
- the selected npm publication dist-tag points to the released version.
- if an RC is intentionally promoted as the default install, `latest` is moved separately with authenticated npm dist-tag tooling.
- the Git tag points to the exact source commit for the published package version.
- a GitHub prerelease exists for RC versions and includes the npm package artifact.
- npm package page/repository metadata point to this repository.
