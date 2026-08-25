# Changelog

## 0.1.0-rc.2

Accuracy-focused release candidate incorporating corrections identified during pinned Phase B validation against `cytoscape/cytoscape-web`.

Highlights:
- suppresses consumer-facing callback contracts for internal implementation handlers when a meaningful public callback/effect is the observable behavior;
- propagates render-state reach through statically safe local test helpers with exactly one unconditional `render(...)` path;
- treats proven Testing Library `rerender(...)` calls as additional render-state evidence for safely resolvable public prop states;
- recognizes exact DOM-property assertions such as `expect(button.disabled).toBe(true)` when a singular Testing Library query can be positively correlated with a unique dynamic `data-testid` target;
- adds Cytoscape-derived regression fixtures and a preserved contract-by-contract adjudication baseline before analyzer changes;
- retains the original published RC.1 empirical result for before/after comparison rather than rewriting historical evidence;
- hardens release recovery so an already-published npm version can complete missing Git/GitHub release bookkeeping without republishing, while keeping packaged README validation as the hard content gate and treating npm package-level README metadata as informational after publication.

Validation for the analyzer correction set includes the full TypeScript check, 93/93 unit tests, consumer tarball smoke, the normal CI matrix, external evaluation, and a rerun of the pinned Cytoscape snapshot. On that pinned snapshot, the corrected candidate matched the independently recorded adjudicated aggregate: 12 consumer-facing contracts, 66.7% Behavior Reach, 8.3% Behavior Verification, and a 58.4 percentage-point Verification Gap. These figures are specific to that pinned validation target and are not a universal accuracy claim.

## 0.1.0-rc.1

Metadata and documentation hardening release. Analyzer behavior is unchanged from `0.1.0-rc.0`.

Highlights:
- broadened the package description around behavioral verification coverage rather than a Material UI-specific identity;
- refreshed the README for the RC channel and `0.1.0-rc.1`;
- added an AI-generated-test motivation section while keeping the analyzer generation-agnostic;
- strengthened the manual release workflow to verify that the packaged README is present, non-empty, and identical to the repository README;
- added post-publish registry verification that the version-specific npm `readme` metadata is populated before Git tagging and GitHub Release creation.

## 0.1.0-rc.0

First release-candidate release.

Highlights:
- expanded external validation across independent React and Material UI application scopes;
- strengthened assertion-to-element and interaction-target correlation;
- hardened callback event-payload inference so boolean event contracts require direct public callback forwarding;
- eliminated false callback-event contracts caused by payload-transforming local wrappers;
- removed unreachable internal-handler contract noise from public behavior metrics;
- deduplicated equivalent observable behavior contracts;
- added adversarial regression coverage for previously identified soundness failures;
- retained conservative verification when target identity or control-flow evidence is ambiguous.

Release validation includes the full TypeScript check, unit and consumer smoke tests, package-content inspection, and the pinned external evaluation workflow.

## 0.1.0-alpha.0

Initial public alpha release candidate.

Highlights:
- behavioral verification coverage for native React controls and supported Material UI components;
- project scanning, composition tracing, and discovery telemetry;
- rendered state, value, visibility, ARIA, and limited form-controlled semantic evidence;
- versioned JSON schema v1;
- separate Material UI Box design-guidance observations;
- pinned external evaluation and consumer tarball smoke testing.

Known alpha limitations include non-native MUI Select interactions, arbitrary runtime hooks/effects/context, browser-computed styles, and broader cross-workspace resolution. The external precision sample is intentionally small and should not be treated as a statistically established accuracy rate.
