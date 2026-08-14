# First npm publication status

Repository-side release preparation is complete through Phase 7.5. The remaining first-publication actions require maintainer npm authentication and package ownership on npmjs.com.

Current safeguards:

- `main` CI is green.
- No git release tags exist yet.
- `package.json` version is `0.1.0-alpha.0`.
- the tag-triggered publishing workflow is present under `.github/workflows/release-workflow.example.yml`.
- do not push `v0.1.0-alpha.0` before the first manual npm publication and Trusted Publishing bootstrap sequence described in `docs/release.md`.
