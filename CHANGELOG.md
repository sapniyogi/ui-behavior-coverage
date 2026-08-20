# Changelog

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
