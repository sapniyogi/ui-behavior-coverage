import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProjectTextReport } from '../src/core/reporter';
import { analyzeProject } from '../src/project/analyze-project';
import { discoverProjectTargets } from '../src/project/discover';

const fixtureRoot = 'tests/fixtures/project';

test('discovers one component target and groups its runtime JSX tests', () => {
  const targets = discoverProjectTargets(fixtureRoot);

  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.componentNames.length, 1);
  assert.equal(targets[0]?.componentNames[0], 'SaveButton');
  assert.equal(targets[0]?.testFiles.length, 2);
  assert.ok(targets[0]?.testFiles.every((file) => !file.endsWith('type-only.test.tsx')));
});

test('project analysis combines matching tests before choosing verification status', () => {
  const report = analyzeProject(fixtureRoot);

  assert.equal(report.componentsAnalyzed, 1);
  assert.equal(report.testFilesAnalyzed, 2);
  assert.equal(report.reports[0]?.results[0]?.status, 'verified');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 100);
});

test('project text report exposes aggregate scores', () => {
  const output = formatProjectTextReport(analyzeProject(fixtureRoot));

  assert.match(output, /Project Scan/);
  assert.match(output, /Components:\s+1/);
  assert.match(output, /Test files:\s+2/);
  assert.match(output, /Behavior Verification:\s+100%/);
});
