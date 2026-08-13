import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

const fixtureRoot = 'tests/fixtures/mui-realistic';

test('realistic MUI project scan surfaces a weak-oracle verification gap', () => {
  const report = analyzeProject(fixtureRoot);

  assert.equal(report.componentsAnalyzed, 1);
  assert.equal(report.testFilesAnalyzed, 1);
  assert.equal(report.scores.discovered, 7);
  assert.equal(report.scores.exercised, 5);
  assert.equal(report.scores.verified, 4);
  assert.equal(report.scores.behaviorReach, 71.4);
  assert.equal(report.scores.behaviorVerification, 57.1);
  assert.equal(report.scores.verificationGap, 14.3);

  const results = report.reports[0]?.results ?? [];
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
      result.behavior.kind === 'mui-switch-disabled-change-suppression' &&
      result.status === 'discovered',
  ));
});
