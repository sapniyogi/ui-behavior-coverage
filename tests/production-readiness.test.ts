import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';
import { resolveProjectComponentBehaviors } from '../src/project/compose-project-behaviors';
import { discoverProject } from '../src/project/discover';
import { analyzeTestsAgainstBehaviors } from '../src/react/analyze-tests';
import { extractComponentBehaviors } from '../src/react/extract-component-behaviors';
import { normalizeTestHarnessSource } from '../src/react/normalize-test-harness';

function kindsFor(source: string, componentName: string) {
  return extractComponentBehaviors(source, 'fixture.tsx')
    .filter((behavior) => behavior.componentName === componentName);
}

test('infers suppression from public logical prop expressions', () => {
  const source = `
    import Button from '@mui/material/Button';
    export function Action({ disabled, readOnly, onClick }: any) {
      return <Button disabled={disabled || readOnly} onClick={onClick}>Save</Button>;
    }
  `;

  const behaviors = kindsFor(source, 'Action')
    .filter((behavior) => behavior.kind === 'mui-button-disabled-event-suppression');

  assert.equal(behaviors.length, 2);
  assert.deepEqual(
    behaviors.map((behavior) => behavior.condition.prop).sort(),
    ['disabled', 'readOnly'],
  );
});

test('inherits MUI Switch contracts through a styled props-forwarding wrapper', () => {
  const source = `
    import { styled } from '@mui/material/styles';
    import MuiSwitch from '@mui/material/Switch';
    type SwitchProps = { checked?: boolean; disabled?: boolean; onChange?: () => void };
    export const Switch = styled((props: SwitchProps) => (
      <MuiSwitch disableRipple {...props} />
    ))({});
  `;

  const behaviors = kindsFor(source, 'Switch');
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-switch-disabled-change-suppression'));
  assert.equal(
    behaviors.filter((behavior) => behavior.kind === 'mui-switch-checked-toggle').length,
    2,
  );
});

test('propagates contracts from an internal component to an exported wrapper', () => {
  const source = `
    import Button from '@mui/material/Button';
    function Inner({ disabled, onClick }: any) {
      return <Button disabled={disabled} onClick={onClick}>Save</Button>;
    }
    export function Outer(props: any) {
      return <Inner {...props} />;
    }
  `;

  const behaviors = kindsFor(source, 'Outer');
  assert.ok(behaviors.some((behavior) =>
    behavior.kind === 'mui-button-disabled-event-suppression' &&
    behavior.condition.prop === 'disabled' &&
    behavior.expectation.callbackProp === 'onClick'
  ));
});

test('normalizes configurable render helpers before behavioral matching', () => {
  const componentSource = `
    import Button from '@mui/material/Button';
    export function Action({ disabled, onClick }: any) {
      return <Button disabled={disabled} onClick={onClick}>Save</Button>;
    }
  `;
  const testSource = `
    test('suppresses', async () => {
      const onClick = vi.fn();
      renderInShell(<Action disabled onClick={onClick} />);
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  `;

  const behaviors = kindsFor(componentSource, 'Action');
  const normalized = normalizeTestHarnessSource(testSource, { renderHelpers: ['renderInShell'] });
  const results = analyzeTestsAgainstBehaviors(normalized, behaviors);

  assert.ok(results.some((result) => result.status === 'verified'));
});

test('resolves barrel exports, named aliases, JS/JSX tests, and tsconfig paths with telemetry', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-phase6-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'tests'), { recursive: true });

    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@ui/*': ['src/*'] },
        jsx: 'react-jsx',
      },
    }));
    writeFileSync(join(root, 'src', 'SaveButton.tsx'), `
      export function SaveButton({ disabled, onClick }: any) {
        return <button disabled={disabled} onClick={onClick}>Save</button>;
      }
    `);
    writeFileSync(join(root, 'src', 'index.ts'), `
      export { SaveButton as Action } from './SaveButton';
    `);
    writeFileSync(join(root, 'tests', 'barrel.test.jsx'), `
      import { Action as Renamed } from '../src';
      test('renders', () => renderWithProviders(<Renamed disabled onClick={() => {}} />));
    `);
    writeFileSync(join(root, 'tests', 'alias.test.tsx'), `
      import { SaveButton } from '@ui/SaveButton';
      test('renders', () => render(<SaveButton disabled onClick={() => {}} />));
    `);

    const discovery = discoverProject(root);
    assert.equal(discovery.telemetry.totalTestFiles, 2);
    assert.equal(discovery.telemetry.testFilesWithTargets, 2);
    assert.equal(discovery.telemetry.importsResolved, 2);
    assert.ok(discovery.targets.some((target) => target.componentNames.includes('SaveButton')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('propagates MUI behavior recursively across component files and barrel imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-composition-'));
  try {
    mkdirSync(join(root, 'src', 'controls'), { recursive: true });
    mkdirSync(join(root, 'tests'), { recursive: true });

    writeFileSync(join(root, 'src', 'controls', 'MuiSwitchWrapper.tsx'), `
      import MuiSwitch from '@mui/material/Switch';
      export function MuiSwitchWrapper(props: any) {
        return <MuiSwitch {...props} />;
      }
    `);
    writeFileSync(join(root, 'src', 'controls', 'index.ts'), `
      export { MuiSwitchWrapper } from './MuiSwitchWrapper';
    `);
    writeFileSync(join(root, 'src', 'FeatureToggle.tsx'), `
      import { MuiSwitchWrapper } from './controls';
      export function FeatureToggle(props: any) {
        return <MuiSwitchWrapper {...props} />;
      }
    `);
    writeFileSync(join(root, 'tests', 'FeatureToggle.test.tsx'), `
      import { FeatureToggle } from '../src/FeatureToggle';
      test('reports the next checked state', async () => {
        const onChange = vi.fn();
        render(<FeatureToggle checked={false} onChange={onChange} />);
        await user.click(screen.getByRole('checkbox'));
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
        );
      });
    `);

    const report = analyzeProject(root);
    assert.ok(report.scores.discovered >= 3);
    assert.ok(report.scores.verified >= 1);
    assert.ok(report.reports.some((item) =>
      item.results.some((result) =>
        result.behavior.componentName === 'FeatureToggle' &&
        result.behavior.kind === 'mui-switch-checked-toggle'
      )
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('remaps child behavior to renamed parent props and callbacks across files', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-rename-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });

    writeFileSync(join(root, 'src', 'ActionButton.tsx'), `
      import Button from '@mui/material/Button';
      export function ActionButton({ disabled, onClick }: any) {
        return <Button disabled={disabled} onClick={onClick}>Run</Button>;
      }
    `);
    writeFileSync(join(root, 'src', 'PanelAction.tsx'), `
      import { ActionButton } from './ActionButton';
      export function PanelAction({ inactive, onActivate }: any) {
        return <ActionButton disabled={inactive} onClick={onActivate} />;
      }
    `);

    const behaviors = resolveProjectComponentBehaviors({
      rootDir: root,
      componentFile: join(root, 'src', 'PanelAction.tsx'),
      componentNames: ['PanelAction'],
    });

    assert.ok(behaviors.some((behavior) =>
      behavior.kind === 'mui-button-disabled-event-suppression' &&
      behavior.condition.prop === 'inactive' &&
      behavior.condition.value === true &&
      behavior.expectation.callbackProp === 'onActivate'
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not propagate a spread contract when a later explicit prop overrides it', () => {
  const root = mkdtempSync(join(tmpdir(), 'uibc-override-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });

    writeFileSync(join(root, 'src', 'ActionButton.tsx'), `
      import Button from '@mui/material/Button';
      export function ActionButton({ disabled, onClick }: any) {
        return <Button disabled={disabled} onClick={onClick}>Run</Button>;
      }
    `);
    writeFileSync(join(root, 'src', 'AlwaysEnabled.tsx'), `
      import { ActionButton } from './ActionButton';
      export function AlwaysEnabled(props: any) {
        return <ActionButton {...props} disabled={false} />;
      }
    `);

    const behaviors = resolveProjectComponentBehaviors({
      rootDir: root,
      componentFile: join(root, 'src', 'AlwaysEnabled.tsx'),
      componentNames: ['AlwaysEnabled'],
    });

    assert.equal(
      behaviors.filter((behavior) => behavior.kind === 'mui-button-disabled-event-suppression').length,
      0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
