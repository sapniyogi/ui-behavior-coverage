import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTestsAgainstBehaviors } from '../src/react/analyze-tests-target-aware';
import { extractComponentBehaviors } from '../src/react/extract-component-behaviors';
import { extractDirectMaterialUiTestBehaviors } from '../src/providers/material-ui';

const muiButtonWrapper = `
  import Button from '@mui/material/Button';

  export function SaveButton({ disabled, loading, onSave }) {
    return <Button disabled={disabled} loading={loading} onClick={onSave}>Save</Button>;
  }
`;

const muiCheckboxWrapper = `
  import { Checkbox } from '@mui/material';

  export function ConsentCheckbox({ checked, disabled, onChange }) {
    return <Checkbox checked={checked} disabled={disabled} onChange={onChange} />;
  }
`;

test('MUI Button provider infers disabled and loading suppression contracts', () => {
  const behaviors = extractComponentBehaviors(muiButtonWrapper, 'SaveButton.tsx');

  assert.equal(behaviors.length, 2);
  assert.ok(behaviors.every((behavior) => behavior.provider === 'material-ui'));
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-button-disabled-event-suppression'));
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-button-loading-event-suppression'));
});

test('MUI provider supports named imports aliased locally', () => {
  const source = `
    import { Button as MuiButton } from '@mui/material';
    export const Submit = ({ loading, onSubmit }) => (
      <MuiButton loading={loading} onClick={onSubmit}>Submit</MuiButton>
    );
  `;

  const behaviors = extractComponentBehaviors(source, 'Submit.tsx');
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0]?.kind, 'mui-button-loading-event-suppression');
  assert.equal(behaviors[0]?.componentName, 'Submit');
});

test('does not infer Material UI semantics from an unrelated custom Button', () => {
  const source = `
    export function SaveButton({ disabled, onSave }) {
      return <Button disabled={disabled} onClick={onSave}>Save</Button>;
    }
  `;

  assert.equal(extractComponentBehaviors(source).length, 0);
});

test('MUI Checkbox provider emits disabled suppression and both controlled toggle directions', () => {
  const behaviors = extractComponentBehaviors(muiCheckboxWrapper, 'ConsentCheckbox.tsx');

  assert.equal(behaviors.length, 3);
  assert.ok(behaviors.some((behavior) => behavior.kind === 'mui-checkbox-disabled-change-suppression'));

  const toggles = behaviors.filter((behavior) => behavior.kind === 'mui-checkbox-checked-toggle');
  assert.equal(toggles.length, 2);
  assert.ok(toggles.some((behavior) => behavior.condition.value === false));
  assert.ok(toggles.some((behavior) => behavior.condition.value === true));
});

test('MUI Checkbox callback-called-only assertion remains EXERCISED', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('toggles consent', async () => {
      const onChange = vi.fn();
      render(<ConsentCheckbox checked={false} disabled={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalled();
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [behavior]);
  assert.equal(result?.status, 'exercised');
  assert.match(result?.suggestedAssertion ?? '', /target.*checked.*true/);
});

test('MUI Checkbox exact event.target.checked assertion is VERIFIED', () => {
  const behavior = extractComponentBehaviors(muiCheckboxWrapper)
    .find((candidate) => candidate.kind === 'mui-checkbox-checked-toggle' && candidate.condition.value === false);
  assert.ok(behavior);

  const testSource = `
    test('toggles consent', async () => {
      const onChange = vi.fn();
      render(<ConsentCheckbox checked={false} disabled={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ checked: true })
        })
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

test('target-aware MUI Checkbox analysis rejects a click on an unrelated button', () => {
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
  assert.equal(result?.status, 'discovered');
  assert.match(result?.reason ?? '', /checkbox or switch/);
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
    import Checkbox from '@mui/material/Checkbox';

    test('unchecked to checked', async () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const behaviors = extractDirectMaterialUiTestBehaviors(testSource, 'Checkbox.test.tsx');
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0]?.kind, 'mui-checkbox-checked-toggle');
  const [result] = analyzeTestsAgainstBehaviors(testSource, behaviors);
  assert.equal(result?.status, 'verified');
});

test('direct MUI extraction ignores imported components without a relevant render contract', () => {
  const testSource = `
    import { Button } from '@mui/material';
    test('plain button', () => {
      render(<Button>Save</Button>);
    });
  `;

  assert.equal(extractDirectMaterialUiTestBehaviors(testSource).length, 0);
});
