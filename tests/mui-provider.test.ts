import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractComponentBehaviors,
} from '../src/react/extract-component-behaviors';
import { analyzeTestsAgainstBehaviors } from '../src/react/analyze-tests-target-aware';
import {
  extractDirectMaterialUiTestBehaviors,
  extractMaterialUiDesignObservations,
} from '../src/providers/material-ui';
import { evaluateBoxBorderRadiusGuidance } from '../src/design/material-ui';

const muiButtonWrapper = `
  import { Button } from '@mui/material';

  export function SaveButton({ disabled, loading, onSave }) {
    return <Button disabled={disabled} loading={loading} onClick={onSave}>Save</Button>;
  }
`;

const muiCheckboxWrapper = `
  import Checkbox from '@mui/material/Checkbox';

  export function ConsentCheckbox({ disabled, checked, onChange }) {
    return <Checkbox disabled={disabled} checked={checked} onChange={onChange} />;
  }
`;

test('MUI Button provider infers disabled and loading suppression contracts', () => {
  const behaviors = extractComponentBehaviors(muiButtonWrapper);
  assert.equal(behaviors.length, 2);
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-button-disabled-event-suppression'));
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-button-loading-event-suppression'));
});

test('MUI provider supports named imports aliased locally', () => {
  const behaviors = extractComponentBehaviors(`
    import { Button as MuiButton } from '@mui/material';
    export function SaveButton({ disabled, onSave }) {
      return <MuiButton disabled={disabled} onClick={onSave}>Save</MuiButton>;
    }
  `);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0]?.kind, 'mui-button-disabled-event-suppression');
});

test('does not infer Material UI semantics from an unrelated custom Button', () => {
  const behaviors = extractComponentBehaviors(`
    import { Button } from './button';
    export function SaveButton({ disabled, onSave }) {
      return <Button disabled={disabled} onClick={onSave}>Save</Button>;
    }
  `);
  assert.equal(behaviors.length, 0);
});

test('MUI Checkbox provider emits disabled suppression and both controlled toggle directions', () => {
  const behaviors = extractComponentBehaviors(muiCheckboxWrapper);
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-checkbox-disabled-change-suppression'));
  assert.ok(behaviors.some((behavior) =>
    behavior.kind === 'mui-checkbox-checked-toggle' && behavior.condition.value === false
  ));
  assert.ok(behaviors.some((behavior) =>
    behavior.kind === 'mui-checkbox-checked-toggle' && behavior.condition.value === true
  ));
});

test('MUI Checkbox callback-called-only assertion remains EXERCISED', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('calls onChange', async () => {
      const onChange = vi.fn();
      render(<ConsentCheckbox checked={false} disabled={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalled();
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'exercised');
});

test('MUI Checkbox exact event.target.checked assertion is VERIFIED', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('checks the next state', async () => {
      const onChange = vi.fn();
      render(<ConsentCheckbox checked={false} disabled={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'verified');
});

test('MUI Checkbox assertion for the wrong next state is not sufficient', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('asserts the wrong state', async () => {
      const onChange = vi.fn();
      render(<ConsentCheckbox checked={false} disabled={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: false }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'exercised');
});

test('target-aware MUI Checkbox analysis withholds verification for a click on an unrelated button', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('clicks something else', async () => {
      const onChange = vi.fn();
      render(<><ConsentCheckbox checked={false} disabled={false} onChange={onChange} /><button>Save</button></>);
      await user.click(screen.getByRole('button'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'exercised');
  assert.match(result?.reason ?? '', /cannot be positively correlated/);
});

test('direct Material UI Button tests can be analyzed without a wrapper component', () => {
  const testSource = `
    import { Button } from '@mui/material';

    test('disabled MUI button', async () => {
      const onClick = vi.fn();
      render(<Button disabled onClick={onClick}>Save</Button>);
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  `;

  const behaviors = extractDirectMaterialUiTestBehaviors(testSource, 'Button.test.tsx');
  assert.equal(behaviors.length, 1);
  const [result] = analyzeTestsAgainstBehaviors(testSource, behaviors);
  assert.equal(result?.status, 'verified');
});

test('direct Material UI Checkbox test verifies the documented checked transition', () => {
  const testSource = `
    import { Checkbox } from '@mui/material';

    test('checked transition', async () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const behavior = extractDirectMaterialUiTestBehaviors(testSource, 'Checkbox.test.tsx')
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle');
  assert.ok(behavior);
  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'verified');
});

test('direct MUI extraction ignores imported components without a relevant render contract', () => {
  const behaviors = extractDirectMaterialUiTestBehaviors(`
    import { Box } from '@mui/material';
    test('renders', () => render(<Box />));
  `);
  assert.equal(behaviors.length, 0);
});

test('Box borderRadius is extracted as a separate design observation', () => {
  const observations = extractMaterialUiDesignObservations(`
    import Box from '@mui/material/Box';
    export function Panel() {
      return <Box sx={{ borderRadius: 2 }}>Panel</Box>;
    }
  `);
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0]?.value, {
    kind: 'theme-multiplier',
    value: 2,
    defaultThemePixels: 8,
  });
});

test('Box border-radius guidance can flag nonconforming design-token usage', () => {
  const [observation] = extractMaterialUiDesignObservations(`
    import { Box } from '@mui/material';
    export function Panel() {
      return <Box sx={{ borderRadius: 3 }}>Panel</Box>;
    }
  `);
  assert.ok(observation);
  const result = evaluateBoxBorderRadiusGuidance(observation, { allowedThemeMultipliers: [1, 2] });
  assert.equal(result.status, 'noncompliant');
});

test('Box CSS literal radii are preserved and unrelated custom Box names are ignored', () => {
  const observations = extractMaterialUiDesignObservations(`
    import { Box as MuiBox } from '@mui/material';
    import { Box } from './custom';
    export function Panel() {
      return <><MuiBox sx={{ borderRadius: '12px' }} /><Box sx={{ borderRadius: 9 }} /></>;
    }
  `);
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0]?.value, { kind: 'css-literal', value: '12px' });
});
