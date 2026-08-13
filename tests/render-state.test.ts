import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';
import { resolveProjectRenderStateBehaviors } from '../src/project/compose-render-state-behaviors';

test('extracts public disabled state from logical MUI expressions', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-render-state-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    const file = join(root, 'src', 'Toggle.tsx');
    writeFileSync(file, `
      import Switch from '@mui/material/Switch';
      export function Toggle({ disabled, readOnly }: any) {
        return <Switch disabled={disabled || readOnly} />;
      }
    `);

    const behaviors = resolveProjectRenderStateBehaviors({
      rootDir: root,
      componentFile: file,
      componentNames: ['Toggle'],
    });

    const disabled = behaviors.filter((behavior) =>
      behavior.kind === 'mui-switch-disabled-render-state'
    );
    assert.equal(disabled.length, 2);
    assert.deepEqual(disabled.map((behavior) => behavior.condition.prop).sort(), ['disabled', 'readOnly']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('traces useThemeProps destructuring back to public disabled/readOnly props', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-theme-props-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    const file = join(root, 'src', 'BooleanInput.tsx');
    writeFileSync(file, `
      import Switch from '@mui/material/Switch';
      import { useThemeProps } from '@mui/material/styles';
      export const BooleanInput = (props: any) => {
        const { disabled, readOnly, options = {}, ...rest } = useThemeProps({
          props,
          name: 'RaBooleanInput',
        });
        return (
          <Switch
            {...rest}
            {...options}
            disabled={disabled || readOnly}
            readOnly={readOnly}
          />
        );
      };
    `);

    const behaviors = resolveProjectRenderStateBehaviors({
      rootDir: root,
      componentFile: file,
      componentNames: ['BooleanInput'],
    });
    const disabled = behaviors.filter((behavior) =>
      behavior.kind === 'mui-switch-disabled-render-state'
    );
    assert.deepEqual(
      disabled.map((behavior) => [behavior.condition.prop, behavior.condition.value]).sort(),
      [['disabled', true], ['readOnly', true]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifies checked render state through a Testing Library DOM assertion', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-render-verify-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'Toggle.tsx'), `
      import Switch from '@mui/material/Switch';
      export function Toggle({ checked }: any) {
        return <Switch checked={checked} />;
      }
    `);
    writeFileSync(join(root, 'src', 'Toggle.test.tsx'), `
      import { Toggle } from './Toggle';
      test('is checked', () => {
        render(<Toggle checked />);
        const input = screen.getByRole('checkbox');
        expect(input.checked).toBe(true);
      });
    `);

    const report = analyzeProject(root);
    const checked = report.reports.flatMap((item) => item.results).find((result) =>
      result.behavior.kind === 'mui-switch-checked-render-state' &&
      result.behavior.condition.value === true
    );
    assert.equal(checked?.status, 'verified');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports a render-state verification gap when state is reached but unasserted', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-render-gap-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'Action.tsx'), `
      import Button from '@mui/material/Button';
      export function Action({ disabled }: any) {
        return <Button disabled={disabled}>Save</Button>;
      }
    `);
    writeFileSync(join(root, 'src', 'Action.test.tsx'), `
      import { Action } from './Action';
      test('renders disabled action', () => {
        render(<Action disabled />);
        screen.getByRole('button');
      });
    `);

    const report = analyzeProject(root);
    const disabled = report.reports.flatMap((item) => item.results).find((result) =>
      result.behavior.kind === 'mui-button-disabled-render-state'
    );
    assert.equal(disabled?.status, 'exercised');
    assert.match(disabled?.suggestedAssertion ?? '', /toBeDisabled/);
    assert.ok(report.scores.behaviorReach > report.scores.behaviorVerification);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
