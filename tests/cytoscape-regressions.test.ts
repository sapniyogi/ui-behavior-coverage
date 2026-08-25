import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

type ProjectFiles = Record<string, string>;

function withProject(files: ProjectFiles, run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'uibc-cytoscape-regression-'));
  const src = join(root, 'src');
  mkdirSync(src, { recursive: true });

  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(src, name), content);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function resultsFor(root: string) {
  return analyzeProject(root).reports.flatMap((entry) => entry.results);
}

test('Cytoscape regression: local render helper propagates reached Dialog state', () => {
  withProject(
    {
      'HelperDialog.tsx': `
        import Dialog from '@mui/material/Dialog';

        export function HelperDialog({ open }: any) {
          return (
            <Dialog open={open} data-testid="helper-dialog">
              <div>Body</div>
            </Dialog>
          );
        }
      `,
      'HelperDialog.test.tsx': `
        import { render, screen } from '@testing-library/react';
        import { HelperDialog } from './HelperDialog';

        const setup = () => {
          render(<HelperDialog open={true} />);
        };

        test('renders through a local setup helper', () => {
          setup();
          screen.getByText('Body');
        });
      `,
    },
    (root) => {
      const openTrue = resultsFor(root).find(
        (result) =>
          result.behavior.kind === 'mui-dialog-visibility-render-state' &&
          result.behavior.condition.prop === 'open' &&
          result.behavior.condition.value === true,
      );

      assert.ok(openTrue, 'expected open=true Dialog contract');
      assert.equal(openTrue.status, 'exercised');
    },
  );
});

test('Cytoscape regression: rerender contributes reach for the changed Dialog state', () => {
  withProject(
    {
      'RerenderDialog.tsx': `
        import Dialog from '@mui/material/Dialog';

        export function RerenderDialog({ open }: any) {
          return (
            <Dialog open={open} data-testid="rerender-dialog">
              <div>Body</div>
            </Dialog>
          );
        }
      `,
      'RerenderDialog.test.tsx': `
        import { render } from '@testing-library/react';
        import { RerenderDialog } from './RerenderDialog';

        test('closes and reopens the dialog', () => {
          const { rerender } = render(<RerenderDialog open={true} />);
          rerender(<RerenderDialog open={false} />);
          rerender(<RerenderDialog open={true} />);
        });
      `,
    },
    (root) => {
      const results = resultsFor(root).filter(
        (result) => result.behavior.kind === 'mui-dialog-visibility-render-state',
      );
      const openTrue = results.find((result) => result.behavior.condition.value === true);
      const openFalse = results.find((result) => result.behavior.condition.value === false);

      assert.ok(openTrue, 'expected open=true Dialog contract');
      assert.ok(openFalse, 'expected open=false Dialog contract');
      assert.equal(openTrue.status, 'exercised');
      assert.equal(openFalse.status, 'exercised');
    },
  );
});

test('Cytoscape regression: exact disabled DOM property assertion verifies a dynamic-test-id MUI Button', () => {
  withProject(
    {
      'MenuButton.tsx': `
        import Button from '@mui/material/Button';

        export function MenuButton({ id, disabled }: any) {
          return (
            <Button
              data-testid={\`toolbar-\${id}-menu-button\`}
              disabled={disabled}
            >
              Tools
            </Button>
          );
        }
      `,
      'MenuButton.test.tsx': `
        import { render, screen } from '@testing-library/react';
        import { MenuButton } from './MenuButton';

        test('renders the disabled menu button', () => {
          render(<MenuButton id="tools" disabled={true} />);
          const button = screen.getByTestId('toolbar-tools-menu-button') as HTMLButtonElement;
          expect(button.disabled).toBe(true);
        });
      `,
    },
    (root) => {
      const disabled = resultsFor(root).find(
        (result) =>
          result.behavior.kind === 'mui-button-disabled-render-state' &&
          result.behavior.condition.prop === 'disabled' &&
          result.behavior.condition.value === true,
      );

      assert.ok(disabled, 'expected disabled=true MUI Button render-state contract');
      assert.equal(disabled.status, 'verified');
    },
  );
});

test('Cytoscape regression: local MUI event handler is not emitted as a consumer callback contract', () => {
  withProject(
    {
      'DropdownMenu.tsx': `
        import Button from '@mui/material/Button';

        export function DropdownMenu({ disabled = false, onOpenChange }: any) {
          const handleClick = () => {
            if (disabled) return;
            onOpenChange?.(true);
          };

          return (
            <Button disabled={disabled} onClick={handleClick}>
              Tools
            </Button>
          );
        }
      `,
      'DropdownMenu.test.tsx': `
        import { fireEvent, render, screen } from '@testing-library/react';
        import { vi } from 'vitest';
        import { DropdownMenu } from './DropdownMenu';

        test('does not request open while disabled', () => {
          const onOpenChange = vi.fn();
          render(<DropdownMenu disabled={true} onOpenChange={onOpenChange} />);
          fireEvent.click(screen.getByRole('button'));
          expect(onOpenChange).not.toHaveBeenCalledWith(true);
        });
      `,
    },
    (root) => {
      const results = resultsFor(root);
      const callbackContracts = results.filter(
        (result) => result.behavior.expectation.type === 'callback-not-called',
      );

      assert.equal(
        callbackContracts.some(
          (result) =>
            result.behavior.expectation.type === 'callback-not-called' &&
            result.behavior.expectation.callbackProp === 'handleClick',
        ),
        false,
        'local handleClick must not be exposed as a consumer callback contract',
      );

      assert.equal(
        callbackContracts.some(
          (result) =>
            result.behavior.expectation.type === 'callback-not-called' &&
            result.behavior.expectation.callbackProp === 'onOpenChange',
        ),
        true,
        'public onOpenChange behavior should remain eligible',
      );
    },
  );
});
