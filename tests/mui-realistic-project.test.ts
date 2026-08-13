import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

const fixtureRoot = 'tests/fixtures/mui-realistic';

test('realistic MUI project scan surfaces callback and render-state verification gaps', () => {
  const report = analyzeProject(fixtureRoot);

  assert.equal(report.componentsAnalyzed, 1);
  assert.equal(report.testFilesAnalyzed, 1);

  const results = report.reports[0]?.results ?? [];
  const stateResults = results.filter((result) => result.behavior.event.eventName === 'render');
  const callbackResults = results.filter((result) => result.behavior.event.eventName !== 'render');

  // Preserve the Phase 5 callback signal exactly.
  assert.equal(callbackResults.length, 7);
  assert.equal(callbackResults.filter((result) => result.status !== 'discovered').length, 5);
  assert.equal(callbackResults.filter((result) => result.status === 'verified').length, 4);

  // Phase 6 adds deterministic rendered-state contracts without changing callback inference.
  assert.equal(stateResults.length, 6);
  assert.equal(stateResults.filter((result) => result.status === 'exercised').length, 3);
  assert.equal(stateResults.filter((result) => result.status === 'verified').length, 0);

  assert.equal(report.scores.discovered, 13);
  assert.equal(report.scores.exercised, 8);
  assert.equal(report.scores.verified, 4);
  assert.equal(report.scores.behaviorReach, 61.5);
  assert.equal(report.scores.behaviorVerification, 30.8);
  assert.equal(report.scores.verificationGap, 30.7);

  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-switch-checked-toggle' &&
      result.behavior.condition.value === false &&
      result.status === 'verified',
  ));
  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-switch-checked-toggle' &&
      result.behavior.condition.value === true &&
      result.status === 'exercised',
  ));
  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-switch-checked-render-state' &&
      result.behavior.condition.value === true &&
      result.status === 'exercised',
  ));
  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-switch-disabled-change-suppression' &&
      result.status === 'discovered',
  ));
});
