import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateBoxBorderRadiusGuidance } from '../src/design/material-ui';
import {
  extractDirectMaterialUiTestBehaviors,
  extractMaterialUiDesignObservations,
} from '../src/providers/material-ui';
import { analyzeTestsAgainstBehaviors } from '../src/react/analyze-tests';
import { extractComponentBehaviors } from '../src/react/extract-component-behaviors';

const realisticFixture = 'tests/fixtures/mui-realistic/PreferencesForm.tsx';
const realisticSource = readFileSync(realisticFixture, 'utf8');

function behavior(kind: string, condition?: boolean | 'bound') {
  return extractComponentBehaviors(realisticSource, realisticFixture).find(
    (candidate) => candidate.kind === kind && (condition === undefined || candidate.condition.value === condition),
  );
}

test('realistic MUI settings form yields Switch, Radio, TextField, and native Select contracts', () => {
  const behaviors = extractComponentBehaviors(realisticSource, realisticFixture);
  const kinds = behaviors.map((candidate) => candidate.kind);

  assert.equal(behaviors.length, 7);
  assert.ok(kinds.includes('mui-switch-disabled-change-suppression'));
  assert.equal(kinds.filter((kind) => kind === 'mui-switch-checked-toggle').length, 2);
  assert.ok(kinds.includes('mui-radio-disabled-change-suppression'));
  assert.ok(kinds.includes('mui-radio-checked-select'));
  assert.ok(kinds.includes('mui-text-field-value-change'));
  assert.ok(kinds.includes('mui-select-native-value-change'));
});

test('Switch callback-called-only assertion remains EXERCISED', () => {
  const target = behavior('mui-switch-checked-toggle', false);
  assert.ok(target);

  const testSource = `
    test('enables notifications', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm enabled={false} onEnabledChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalled();
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [target]);
  assert.equal(result?.status, 'exercised');
  assert.match(result?.suggestedAssertion ?? '', /checked: true/);
});

test('Switch verifies the documented next checked state', () => {
  const target = behavior('mui-switch-checked-toggle', false);
  assert.ok(target);

  const testSource = `
    test('enables notifications', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm enabled={false} onEnabledChange={onChange} />);
      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [target]);
  assert.equal(result?.status, 'verified');
});

test('Radio selection verifies checked=true and never infers true-to-false toggling', () => {
  const all = extractComponentBehaviors(realisticSource, realisticFixture)
    .filter((candidate) => candidate.kind === 'mui-radio-checked-select');
  assert.equal(all.length, 1);
  assert.equal(all[0]?.condition.value, false);

  const testSource = `
    test('selects email', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm emailSelected={false} onEmailSelect={onChange} />);
      await user.click(screen.getByRole('radio'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ checked: true }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, all);
  assert.equal(result?.status, 'verified');
});

test('TextField requires event.target.value to be asserted, not merely callback invocation', () => {
  const target = behavior('mui-text-field-value-change', 'bound');
  assert.ok(target);

  const weakTest = `
    test('edits display name', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm displayName="" onDisplayNameChange={onChange} />);
      await user.type(screen.getByRole('textbox'), 'Ada');
      expect(onChange).toHaveBeenCalled();
    });
  `;
  const [weak] = analyzeTestsAgainstBehaviors(weakTest, [target]);
  assert.equal(weak?.status, 'exercised');

  const strongTest = `
    test('edits display name', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm displayName="" onDisplayNameChange={onChange} />);
      await user.type(screen.getByRole('textbox'), 'Ada');
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ value: 'Ada' }) })
      );
    });
  `;
  const [strong] = analyzeTestsAgainstBehaviors(strongTest, [target]);
  assert.equal(strong?.status, 'verified');
});

test('native MUI Select verifies onChange event.target.value after selectOptions', () => {
  const target = behavior('mui-select-native-value-change', 'bound');
  assert.ok(target);

  const testSource = `
    test('changes region', async () => {
      const onChange = vi.fn();
      render(<PreferencesForm region="us" onRegionChange={onChange} />);
      await user.selectOptions(screen.getByRole('combobox'), 'eu');
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.objectContaining({ value: 'eu' }) })
      );
    });
  `;

  const [result] = analyzeTestsAgainstBehaviors(testSource, [target]);
  assert.equal(result?.status, 'verified');
});

test('non-native Select is deliberately not assigned selectOptions semantics yet', () => {
  const testSource = `
    import Select from '@mui/material/Select';
    test('custom menu select', () => {
      const onChange = vi.fn();
      render(<Select value="us" onChange={onChange} />);
    });
  `;

  assert.equal(extractDirectMaterialUiTestBehaviors(testSource).length, 0);
});

test('direct MUI imports support Switch, Radio, and TextField behavior extraction', () => {
  const testSource = `
    import Switch from '@mui/material/Switch';
    import { Radio, TextField } from '@mui/material';

    test('controls', () => {
      const onSwitch = vi.fn();
      const onRadio = vi.fn();
      const onText = vi.fn();
      render(<>
        <Switch checked={false} onChange={onSwitch} />
        <Radio checked={false} onChange={onRadio} />
        <TextField value="" onChange={onText} />
      </>);
    });
  `;

  const behaviors = extractDirectMaterialUiTestBehaviors(testSource, 'Controls.test.tsx');
  assert.ok(behaviors.some((candidate) => candidate.kind === 'mui-switch-checked-toggle'));
  assert.ok(behaviors.some((candidate) => candidate.kind === 'mui-radio-checked-select'));
  assert.ok(behaviors.some((candidate) => candidate.kind === 'mui-text-field-value-change'));
});

test('Box borderRadius is extracted as a separate design observation', () => {
  const observations = extractMaterialUiDesignObservations(realisticSource, realisticFixture);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.kind, 'mui-box-border-radius');
  assert.equal(observations[0]?.value.kind, 'theme-multiplier');

  if (observations[0]?.value.kind === 'theme-multiplier') {
    assert.equal(observations[0].value.value, 2);
    assert.equal(observations[0].value.defaultThemePixels, 8);
  }
});

test('Box border-radius guidance can flag nonconforming design-token usage', () => {
  const observations = extractMaterialUiDesignObservations(realisticSource, realisticFixture);
  const allowed = evaluateBoxBorderRadiusGuidance(observations, {
    allowedThemeMultipliers: [1, 2],
  });
  assert.equal(allowed[0]?.status, 'compliant');

  const restricted = evaluateBoxBorderRadiusGuidance(observations, {
    allowedThemeMultipliers: [1],
  });
  assert.equal(restricted[0]?.status, 'noncompliant');
  assert.match(restricted[0]?.reason ?? '', /outside the allowed set/);
});

test('Box CSS literal radii are preserved and unrelated custom Box names are ignored', () => {
  const muiSource = `
    import Box from '@mui/material/Box';
    export function Card() {
      return <Box sx={{ borderRadius: '16px' }}>Content</Box>;
    }
  `;
  const observations = extractMaterialUiDesignObservations(muiSource, 'Card.tsx');
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.value.kind, 'css-literal');
  if (observations[0]?.value.kind === 'css-literal') {
    assert.equal(observations[0].value.value, '16px');
  }

  const customSource = `
    export function Card() {
      return <Box sx={{ borderRadius: 2 }}>Content</Box>;
    }
  `;
  assert.equal(extractMaterialUiDesignObservations(customSource).length, 0);
});
