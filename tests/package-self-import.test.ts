import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { discoverProject } from '../src/project/discover';

function write(root: string, path: string, content: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function withPackageRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'ubc-self-import-'));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('resolves a package root self-import through package exports', () => {
  withPackageRoot((root) => {
    write(
      root,
      'package.json',
      JSON.stringify({ name: '@acme/ui', exports: { '.': './src/index.ts' } }),
    );
    write(root, 'src/index.ts', `export { SaveButton } from './SaveButton';`);
    write(
      root,
      'src/SaveButton.tsx',
      `export function SaveButton() { return <button>Save</button>; }`,
    );
    write(
      root,
      'src/SaveButton.test.tsx',
      `import { render } from '@testing-library/react';
       import { SaveButton } from '@acme/ui';
       test('renders', () => render(<SaveButton />));`,
    );

    const discovery = discoverProject(root);

    assert.equal(discovery.targets.length, 1);
    assert.equal(discovery.targets[0]?.componentNames[0], 'SaveButton');
    assert.match(discovery.targets[0]?.componentFile ?? '', /SaveButton\.tsx$/);
    assert.equal(discovery.telemetry.importsResolved, 1);
    assert.equal(discovery.telemetry.skipped['external-module'], 0);
  });
});

test('resolves wildcard package self-import exports to local source', () => {
  withPackageRoot((root) => {
    write(
      root,
      'package.json',
      JSON.stringify({ name: '@acme/ui', exports: { './*': './src/*/index.ts' } }),
    );
    write(root, 'src/Button/index.ts', `export { default } from './Button';`);
    write(
      root,
      'src/Button/Button.tsx',
      `export default function Button() { return <button>Save</button>; }`,
    );
    write(
      root,
      'src/Button/Button.test.tsx',
      `import { render } from '@testing-library/react';
       import Button from '@acme/ui/Button';
       test('renders', () => render(<Button />));`,
    );

    const discovery = discoverProject(root);

    assert.equal(discovery.targets.length, 1);
    assert.equal(discovery.targets[0]?.componentNames[0], 'Button');
    assert.match(discovery.targets[0]?.componentFile ?? '', /Button\.tsx$/);
    assert.equal(discovery.telemetry.importsResolved, 1);
    assert.equal(discovery.telemetry.skipped['external-module'], 0);
  });
});

test('does not treat unrelated external packages as package self-imports', () => {
  withPackageRoot((root) => {
    write(
      root,
      'package.json',
      JSON.stringify({ name: '@acme/ui', exports: { '.': './src/index.ts' } }),
    );
    write(root, 'src/index.ts', `export { SaveButton } from './SaveButton';`);
    write(
      root,
      'src/SaveButton.tsx',
      `export function SaveButton() { return <button>Save</button>; }`,
    );
    write(
      root,
      'src/mixed.test.tsx',
      `import External from '@other/ui';
       import { SaveButton } from '@acme/ui';
       test('renders both', () => <><SaveButton /><External /></>);`,
    );

    const discovery = discoverProject(root);

    assert.equal(discovery.targets.length, 1);
    assert.equal(discovery.telemetry.importsResolved, 1);
    assert.equal(discovery.telemetry.skipped['external-module'], 1);
  });
});
