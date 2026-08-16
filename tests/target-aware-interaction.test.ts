import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeReactSources } from '../src/react/analyze';

const componentSource = `
  export function SaveButton({ disabled, onSave }: { disabled: boolean; onSave: () => void }) {
    return <button disabled={disabled} onClick={onSave}>Save</button>;
  }
`;

test('does not let an incompatible interaction before the oracle verify a later compatible target', () => {
  const testSource = `
    test('ordering matters', async () => {
      const onSave = vi.fn();
      render(<><SaveButton disabled onSave={onSave} /><input type="checkbox" /></>);

      await user.click(screen.getByRole('checkbox'));
      expect(onSave).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button'));
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
});

test('accepts verification when the compatible target interaction precedes the oracle', () => {
  const testSource = `
    test('correct ordering', async () => {
      const onSave = vi.fn();
      render(<><SaveButton disabled onSave={onSave} /><input type="checkbox" /></>);

      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.scores.behaviorVerification, 100);
});
