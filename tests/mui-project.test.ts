import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

const fixtureRoot = 'tests/fixtures/project-mui';

test('project scan analyzes direct Material UI package imports', () => {
  const report = analyzeProject(fixtureRoot);

  assert.equal(report.testFilesAnalyzed, 2);
  assert.equal(report.reports.length, 2);
  assert.equal(report.scores.discovered, 2);
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 50);
  assert.equal(report.scores.verificationGap, 50);
});
