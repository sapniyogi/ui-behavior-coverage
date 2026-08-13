import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';

function runCli(args: string[]) {
  return spawnSync(process.execPath, ['dist/src/cli/index.js', ...args], { encoding: 'utf8' });
}

test('CLI analyze command reports an exercised verification gap', () => {
  const result = runCli([
    'analyze',
    '--component',
    'tests/fixtures/SaveButton.tsx',
    '--test',
    'tests/fixtures/SaveButton.weak.test.tsx',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /EXERCISED/);
  assert.match(result.stdout, /Verification Gap:\s+100 pp/);
});

test('CLI scan command discovers and aggregates project fixtures', () => {
  const result = runCli(['scan', 'tests/fixtures/project']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Project Scan/);
  assert.match(result.stdout, /Components:\s+1/);
  assert.match(result.stdout, /Behavior Verification:\s+100%/);
});

test('CLI scan command supports JSON output', () => {
  const result = runCli(['scan', 'tests/fixtures/project', '--json']);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as { componentsAnalyzed: number; testFilesAnalyzed: number };
  assert.equal(report.componentsAnalyzed, 1);
  assert.equal(report.testFilesAnalyzed, 2);
});
