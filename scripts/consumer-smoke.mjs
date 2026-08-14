import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const npmExecPath = process.env.npm_execpath;

assert.ok(
  npmExecPath,
  'consumer smoke must be invoked from an npm lifecycle script so npm_execpath is available',
);

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error([
      `Command failed (${result.status ?? 'spawn-error'}): ${command} ${args.join(' ')}`,
      result.error?.stack ?? result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

function runNpm(args, cwd = repoRoot) {
  return run(process.execPath, [npmExecPath, ...args], cwd);
}

const packOutput = runNpm(['pack', '--json']);
const packed = JSON.parse(packOutput);
assert.ok(Array.isArray(packed) && packed.length === 1, 'npm pack must return one tarball');
const tarball = resolve(repoRoot, packed[0].filename);
const consumerRoot = mkdtempSync(join(tmpdir(), 'ui-behavior-coverage-consumer-'));

try {
  runNpm(['init', '-y'], consumerRoot);
  runNpm(['install', tarball, '--no-audit', '--no-fund'], consumerRoot);

  const fixtureRoot = join(consumerRoot, 'fixture');
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(join(fixtureRoot, 'SaveButton.tsx'), `
    export function SaveButton({ disabled, onSave }: { disabled: boolean; onSave: () => void }) {
      return <button disabled={disabled} onClick={onSave}>Save</button>;
    }
  `);
  writeFileSync(join(fixtureRoot, 'SaveButton.test.tsx'), `
    import { render, screen } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import { SaveButton } from './SaveButton';

    test('disabled save is suppressed', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await userEvent.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `);

  const version = runNpm(
    ['exec', '--', 'ui-behavior-coverage', '--version'],
    consumerRoot,
  ).trim();
  assert.equal(version, '0.1.0-alpha.0');

  const help = runNpm(
    ['exec', '--', 'ui-behavior-coverage', '--help'],
    consumerRoot,
  );
  assert.match(help, /ubc scan/);
  assert.match(help, /schemaVersion/);

  const scanOutput = runNpm(
    ['exec', '--', 'ui-behavior-coverage', 'scan', 'fixture', '--json'],
    consumerRoot,
  );
  const scan = JSON.parse(scanOutput);
  assert.equal(scan.schemaVersion, '1');
  assert.equal(scan.toolVersion, '0.1.0-alpha.0');
  assert.equal(scan.reportType, 'project');
  assert.ok(scan.report.scores.discovered >= 1, 'installed package should discover fixture behavior');

  run(
    process.execPath,
    ['-e', "const ubc=require('ui-behavior-coverage'); if(typeof ubc.analyzeProject!=='function'||ubc.REPORT_SCHEMA_VERSION!=='1') process.exit(1);"],
    consumerRoot,
  );
  run(
    process.execPath,
    ['--input-type=module', '-e', "const ubc=await import('ui-behavior-coverage'); if(typeof ubc.analyzeProject!=='function'||ubc.TOOL_VERSION!=='0.1.0-alpha.0') process.exit(1);"],
    consumerRoot,
  );

  process.stdout.write('Consumer tarball smoke test passed.\n');
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
