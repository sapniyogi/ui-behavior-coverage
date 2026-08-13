import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

const fixtureRoot = 'tests/fixtures/mui-realistic';

test('realistic MUI project scan surfaces callback, render-state, and semantic verification gaps', () => {
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

  // Preserve the six Phase 6 boolean render-state contracts.
  const booleanStateResults = stateResults.filter((result) =>
    result.behavior.expectation.type === 'element-boolean-state'
  );
  assert.equal(booleanStateResults.length, 6);
  assert.equal(booleanStateResults.filter((result) => result.status === 'exercised').length, 3);

  // Phase 7 adds two public value contracts for TextField and Select.
  const valueStateResults = stateResults.filter((result) =>
    result.behavior.expectation.type === 'element-value-state'
  );
  assert.equal(valueStateResults.length, 2);
  assert.equal(valueStateResults.filter((result) => result.status === 'exercised').length, 2);
  assert.equal(stateResults.filter((result) => result.status === 'verified').length, 0);

  assert.equal(report.scores.discovered, 15);
  assert.equal(report.scores.exercised, 10);
  assert.equal(report.scores.verified, 4);
  assert.equal(report.scores.behaviorReach, 66.7);
  assert.equal(report.scores.behaviorVerification, 26.7);
  assert.equal(report.scores.verificationGap, 40);

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
      result.behavior.kind === 'mui-text-field-value-render-state' &&
      result.status === 'exercised',
  ));
  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-select-value-render-state' &&
      result.status === 'exercised',
  ));
  assert.ok(results.some(
    (result) =>
      result.behavior.kind === 'mui-switch-disabled-change-suppression' &&
      result.status === 'discovered',
  ));
});
