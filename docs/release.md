# npm release procedure

Current stable release: `0.1.0`.

The authoritative release workflow is `.github/workflows/release.yml`. It is a manually dispatched GitHub Actions workflow that validates the exact package version and npm publish channel before publishing.

## Release channels

The package uses these channels:

* `alpha` for historical alpha prereleases;
* `rc` for release candidates such as `0.1.0-rc.2`;
* `latest` for stable releases and the version that an unqualified `npm install ui-behavior-coverage` should install.

For the stable `0.1.0` release, the package metadata must use:

```text
version: 0.1.0
publishConfig.tag: latest
```

After stable publication, the expected dist-tag state is:

```text
alpha:  0.1.0-alpha.0
rc:     0.1.0-rc.2
latest: 0.1.0
```

The prerelease versions remain available through their respective dist-tags. Publishing `0.1.0` with `npm_tag: latest` does not remove or overwrite the existing `rc` or `alpha` versions.

Trusted Publishing/OIDC is used for `npm publish`. Manual npm dist-tag changes, when ever required for release administration, require an authenticated npm session and are not performed by the OIDC publication step.

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

* `package.json`, `package-lock.json`, `CHANGELOG.md`, README release text, and `TOOL_VERSION` agree on the requested version;
* `publishConfig.access` is public and `publishConfig.tag` matches the selected publication channel;
* the release is run from the current `main` branch;
* the exact package tarball contains a non-empty `package/README.md` matching the intended release source;
* an already-published version is never published again;
* after publication, the exact version exists on npm and the selected publication dist-tag points to it.

Version-specific npm README metadata is checked only as a best-effort diagnostic after publication. It is not a release blocker because the packaged README is verified directly from the tarball before publication.

## Stable `0.1.0` release

Before running the stable release workflow, verify that `main` contains:

* `package.json` version `0.1.0`;
* root `package-lock.json` version `0.1.0`;
* `package-lock.json` root package version `0.1.0`;
* `src/report-schema.ts` with `TOOL_VERSION = '0.1.0'`;
* `package.json` with `publishConfig.tag = "latest"`;
* README release text describing `0.1.0` as the current stable release;
* a `0.1.0` changelog entry.

Run the repository quality gates:

```bash
npm ci
npm run check
npm test
npm run pack:check
npm pack --dry-run
```

Merge the stable release preparation to `main` only after CI is green.

Then run `.github/workflows/release.yml` as a dry run with:

```text
version: 0.1.0
npm_tag: latest
dry_run: true
release_commit: leave blank
```

Using the GitHub CLI from PowerShell:

```powershell
gh workflow run release.yml `
  --ref main `
  -f version=0.1.0 `
  -f npm_tag=latest `
  -f dry_run=true `
  -f release_commit=""
```

Inspect the dry-run logs and artifacts.

After the dry run succeeds, run the same workflow for the real publication:

```powershell
gh workflow run release.yml `
  --ref main `
  -f version=0.1.0 `
  -f npm_tag=latest `
  -f dry_run=false `
  -f release_commit=""
```

The workflow should publish `ui-behavior-coverage@0.1.0`, assign the `latest` npm dist-tag, create Git tag `v0.1.0`, and create a non-prerelease GitHub Release for the stable version.

Verify the npm publication:

```bash
npm view ui-behavior-coverage@0.1.0 version
npm view ui-behavior-coverage@latest version
npm view ui-behavior-coverage version
npm dist-tag ls ui-behavior-coverage
```

Expected stable version output:

```text
0.1.0
```

Expected dist-tag state:

```text
alpha: 0.1.0-alpha.0
rc: 0.1.0-rc.2
latest: 0.1.0
```

The ordering of `npm dist-tag ls` output may differ.

## Release candidates

For any future release candidate:

1. update the package version, lockfile, changelog, README release text, and `TOOL_VERSION` together;
2. set `publishConfig.tag` to `rc`;
3. merge the release preparation to `main` only after CI is green;
4. run `.github/workflows/release.yml` with:

   * `version`: the exact RC version;
   * `npm_tag`: `rc`;
   * `dry_run`: `true`;
   * `release_commit`: leave blank;
5. inspect the dry-run artifact and logs;
6. run the same workflow again with `dry_run: false`;
7. verify the npm version/tag, Git tag, and GitHub prerelease.

RC releases are prereleases. Stable releases use an exact stable version such as `0.1.0` together with `npm_tag: latest`.

## Historical recovery after npm publication succeeded

A real publish can succeed on npm and still fail later while verifying registry metadata or creating GitHub release bookkeeping. Because npm package versions are immutable, **do not republish the same version**.

The workflow supports recovery through the optional `release_commit` input. Use it only for a version that already exists on npm.

### Historical `0.1.0-rc.1` recovery

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

* requires the requested version to already exist on npm;
* validates that the original commit reports the requested package and tool version;
* downloads the already-published npm tarball instead of rebuilding an artifact for publication;
* verifies that the published tarball's version and README match the original release source;
* never calls `npm publish`;
* creates or verifies `v<version>` at the original release source commit;
* creates or updates the GitHub prerelease and attaches the published npm artifact.

If the recovery dry run succeeds, repeat with `dry_run: false` to backfill the missing Git tag and GitHub prerelease.

This section documents recovery for the historical RC.1 release and is not the normal stable `0.1.0` publication procedure.

## Trusted Publishing

npm Trusted Publishing is configured for:

* GitHub owner: `sapniyogi`
* repository: `ui-behavior-coverage`
* workflow: `release.yml`
* publication command: `npm publish`

The workflow requires `id-token: write` and a GitHub-hosted runner. Keep the trusted-publisher workflow filename synchronized with npm package settings.

## Release checklist

* `main` contains the intended release preparation or recovery workflow.
* CI is green on supported Node versions.
* consumer tarball smoke passes.
* `npm pack --dry-run` contains only intended files for a new publication.
* the workflow dry run succeeds before a new real publication.
* package name/version availability is checked before publishing a new version.
* `package.json` and `package-lock.json` contain the exact intended release version.
* `TOOL_VERSION` matches the intended release version.
* `publishConfig.tag` matches the publication channel (`latest` for stable, `rc` for an RC).
* README and changelog identify the intended release version.
* precision audit has no known false VERIFIED classifications that block release.
* the selected npm publication dist-tag points to the released version.
* the Git tag points to the exact source commit for the published package version.
* a stable release creates a non-prerelease GitHub Release.
* an RC creates a GitHub prerelease.
* npm package page/repository metadata point to this repository.

For stable `0.1.0`, the final expected state is:

```text
package version:     0.1.0
TOOL_VERSION:        0.1.0
publishConfig.tag:   latest
Git tag:             v0.1.0
npm latest:          0.1.0
npm rc:              0.1.0-rc.2
GitHub Release:      stable / non-prerelease
```
