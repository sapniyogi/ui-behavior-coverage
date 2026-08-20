import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

function withProject(testSource: string, callback: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'uibc-local-wrapper-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'AlertModal.tsx'), `
      import Dialog from '@mui/material/Dialog';
      export function AlertModal({ open }: any) {
        return <Dialog open={open}>Hello</Dialog>;
      }
    `);
    writeFileSync(join(root, 'src', 'AlertModal.test.tsx'), testSource);
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('reaches render-state behavior through a one-level test-local wrapper', () => {
  withProject(`
    import { AlertModal } from './AlertModal';

    function Modal(props: any) {
      return <AlertModal open={true} {...props} />;
    }

    test('renders through helper', () => {
      render(<Modal />);
      screen.getByText('Hello');
    });
  `, (root) => {
    const report = analyzeProject(root);
    const visible = report.reports.flatMap((item) => item.results).find((result) =>
      result.behavior.kind === 'mui-dialog-visibility-render-state' &&
      result.behavior.condition.value === true
    );
    assert.equal(visible?.status, 'exercised');
  });
});

test('respects an explicit wrapper prop override when resolving the wrapped component', () => {
  withProject(`
    import { AlertModal } from './AlertModal';

    const Modal = (props: any) => <AlertModal open={true} {...props} />;

    test('renders closed through helper override', () => {
      render(<Modal open={false} />);
      screen.queryByText('Hello');
    });
  `, (root) => {
    const report = analyzeProject(root);
    const results = report.reports.flatMap((item) => item.results);
    const visible = results.find((result) =>
      result.behavior.kind === 'mui-dialog-visibility-render-state' &&
      result.behavior.condition.value === true
    );
    const hidden = results.find((result) =>
      result.behavior.kind === 'mui-dialog-visibility-render-state' &&
      result.behavior.condition.value === false
    );
    assert.equal(visible?.status, 'discovered');
    assert.equal(hidden?.status, 'exercised');
  });
});
