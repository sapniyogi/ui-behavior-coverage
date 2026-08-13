import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

const fixtureRoot = 'tests/fixtures/mui-realistic';

test('realistic MUI project scan surfaces the remaining behavioral verification gap', () => {
  const report = analyzeProject(fixtureRoot);

  assert.equal(report.componentsAnalyzed, 1);
  assert.equal(report.testFilesAnalyzed, 1);
  assert.equal(report.scores.discovered, 7);
  assert.equal(report.scores.exercised, 4);
  assert.equal(report.scores.verified, 4);
  assert.equal(report.scores.behaviorReach, 57.1);
  assert.equal(report.scores.behaviorVerification, 57.1);
  assert.equal(report.scores.verificationGap, 0);

  const statuses = report.reports[0]?.results.map((result) => [result.behavior.kind, result.status]);
  assert.ok(statuses?.some(([kind, status]) => kind === 'mui-switch-checked-toggle' && status === 'verified'));
  assert.ok(statuses?.some(([kind, status]) => kind === 'mui-switch-disabled-change-suppression' && status === 'discovered'));
});
