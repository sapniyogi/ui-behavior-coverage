import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeReactSources } from '../src/react/analyze';
import { extractComponentBehaviors } from '../src/react/extract-component-behaviors';
import { formatTextReport } from '../src/core/reporter';

const componentSource = readFileSync('tests/fixtures/SaveButton.tsx', 'utf8');

function fixture(name: string): string {
  return readFileSync(`tests/fixtures/${name}`, 'utf8');
}

test('discovers disabled native-button event suppression', () => {
  const behaviors = extractComponentBehaviors(componentSource, 'SaveButton.tsx');

  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0]?.componentName, 'SaveButton');
  assert.equal(behaviors[0]?.condition.prop, 'disabled');
  assert.equal(behaviors[0]?.expectation.callbackProp, 'onSave');
});

test('marks exercised behavior with a missing oracle as EXERCISED', () => {
  const report = analyzeReactSources({
    componentSource,
    testSource: fixture('SaveButton.weak.test.tsx'),
  });

  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
  assert.equal(report.scores.verificationGap, 100);
  assert.equal(report.results[0]?.suggestedAssertion, 'expect(onSave).not.toHaveBeenCalled();');
});

test('marks behavior VERIFIED when suppression is asserted after the click', () => {
  const report = analyzeReactSources({
    componentSource,
    testSource: fixture('SaveButton.verified.test.tsx'),
  });

  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 100);
  assert.equal(report.scores.verificationGap, 0);
});

test('does not count render-only coverage as behavior reach', () => {
  const report = analyzeReactSources({
    componentSource,
    testSource: fixture('SaveButton.unexercised.test.tsx'),
  });

  assert.equal(report.results[0]?.status, 'discovered');
  assert.equal(report.scores.behaviorReach, 0);
  assert.equal(report.scores.behaviorVerification, 0);
});

test('requires the verification assertion to occur after the interaction', () => {
  const testSource = `
    it('asserts too early', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      expect(onSave).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button'));
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
});

test('does not infer native disabled semantics from custom components', () => {
  const customComponent = `
    export function FancyButton({ disabled, onSave }) {
      return <Button disabled={disabled} onClick={onSave}>Save</Button>;
    }
  `;

  assert.equal(extractComponentBehaviors(customComponent).length, 0);
});

test('text report makes the verification gap explicit', () => {
  const report = analyzeReactSources({
    componentSource,
    testSource: fixture('SaveButton.weak.test.tsx'),
  });
  const output = formatTextReport(report);

  assert.match(output, /EXERCISED/);
  assert.match(output, /Verification Gap:\s+100 pp/);
  assert.match(output, /expect\(onSave\)\.not\.toHaveBeenCalled\(\)/);
});
