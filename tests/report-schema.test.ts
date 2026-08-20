import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisReport, ProjectAnalysisReport } from '../src/core/model';
import { calculateScores } from '../src/core/scoring';
import {
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
  createAnalysisJsonReport,
  createProjectJsonReport,
} from '../src/report-schema';
import * as publicApi from '../src/index';

const emptyScores = calculateScores([]);

const componentReport: AnalysisReport = {
  componentFile: 'Button.tsx',
  testFile: 'Button.test.tsx',
  results: [],
  scores: emptyScores,
};

const projectReport: ProjectAnalysisReport = {
  rootDir: '/project',
  componentsAnalyzed: 0,
  testFilesAnalyzed: 0,
  reports: [],
  scores: emptyScores,
};

test('report schema and tool versions are stable for the RC release', () => {
  assert.equal(REPORT_SCHEMA_VERSION, '1');
  assert.equal(TOOL_VERSION, '0.1.0-rc.1');
});

test('component JSON envelope identifies schema, tool, type, and summary', () => {
  const json = createAnalysisJsonReport(componentReport);
  assert.equal(json.schemaVersion, '1');
  assert.equal(json.toolVersion, '0.1.0-rc.1');
  assert.equal(json.reportType, 'component');
  assert.deepEqual(json.summary, emptyScores);
  assert.equal(json.report, componentReport);
});

test('project JSON envelope identifies schema, tool, type, and summary', () => {
  const json = createProjectJsonReport(projectReport);
  assert.equal(json.schemaVersion, '1');
  assert.equal(json.toolVersion, '0.1.0-rc.1');
  assert.equal(json.reportType, 'project');
  assert.deepEqual(json.summary, emptyScores);
  assert.equal(json.report, projectReport);
});

test('versioned report helpers are available through the public package API', () => {
  assert.equal(publicApi.REPORT_SCHEMA_VERSION, '1');
  assert.equal(publicApi.TOOL_VERSION, '0.1.0-rc.1');
  assert.equal(typeof publicApi.createProjectJsonReport, 'function');
  assert.equal(typeof publicApi.createAnalysisJsonReport, 'function');
});
