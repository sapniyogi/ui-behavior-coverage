import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeReactSources } from '../src/react/analyze';

const componentSource = `
  export function SaveButton({ disabled, onSave }) {
    return <button disabled={disabled} onClick={onSave}>Save</button>;
  }
`;

test('discovers disabled native-button event suppression', () => {
  const report = analyzeReactSources({ componentSource, testSource: '' });
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]?.behavior.kind, 'native-disabled-event-suppression');
  assert.equal(report.results[0]?.status, 'discovered');
});

test('marks exercised behavior with a missing oracle as EXERCISED', () => {
  const testSource = `
    it('clicks disabled button', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
});

test('marks behavior VERIFIED when suppression is asserted after the click', () => {
  const testSource = `
    it('suppresses disabled click', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.scores.behaviorVerification, 100);
});

test('does not count render-only coverage as behavior reach', () => {
  const testSource = `
    it('renders disabled button', () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'discovered');
  assert.equal(report.scores.behaviorReach, 0);
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
  const report = analyzeReactSources({
    componentSource: `
      export function Card({ disabled, onClick }) {
        return <FancyCard disabled={disabled} onClick={onClick} />;
      }
    `,
    testSource: '',
  });
  assert.equal(report.results.length, 0);
});

test('text report makes the verification gap explicit', () => {
  const testSource = `
    it('clicks disabled button', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
    });
  `;
  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
  assert.equal(report.scores.verificationGap, 100);
});

test('aggregates evidence across tests and keeps the strongest verification status', () => {
  const testSource = `
    it('only clicks', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
    });

    it('verifies suppression', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.results[0]?.testName, 'verifies suppression');
});

test('resolves a const object spread into component props', () => {
  const testSource = `
    it('uses a const props object', async () => {
      const onSave = vi.fn();
      const props = { disabled: true, onSave };

      render(<SaveButton {...props} />);
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
});

test('resolves callback aliases from a const object spread', () => {
  const testSource = `
    it('uses a callback alias in props', async () => {
      const handler = vi.fn();
      const props = { disabled: true, onSave: handler };

      render(<SaveButton {...props} />);
      await user.click(screen.getByRole('button'));
      expect(handler).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.results[0]?.callbackVariable, 'handler');
});

test('honors explicit JSX props that override an earlier object spread', () => {
  const testSource = `
    it('overrides disabled', async () => {
      const onSave = vi.fn();
      const props = { disabled: true, onSave };

      render(<SaveButton {...props} disabled={false} />);
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'discovered');
  assert.equal(report.scores.behaviorReach, 0);
});

test('does not infer through an unresolved spread that may override known props', () => {
  const testSource = `
    it('has an unresolved trailing spread', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} {...otherProps} />);
      await user.click(screen.getByRole('button'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'discovered');
  assert.equal(report.scores.behaviorReach, 0);
});

test('withholds verification for an explicitly incompatible Testing Library role', () => {
  const testSource = `
    it('clicks an unrelated checkbox', async () => {
      const onSave = vi.fn();
      render(<><SaveButton disabled onSave={onSave} /><input type="checkbox" /></>);
      await user.click(screen.getByRole('checkbox'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
  assert.match(report.results[0]?.reason ?? '', /cannot be positively correlated/);
});

test('keeps a compatible Testing Library role as EXERCISED when the oracle is missing', () => {
  const testSource = `
    it('clicks the disabled button without an oracle', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByRole('button'));
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
});

test('keeps a compatible role-bound target as VERIFIED', () => {
  const testSource = `
    it('verifies a role-bound button target', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      const saveButton = screen.getByRole('button');
      await user.click(saveButton);
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'verified');
  assert.equal(report.scores.behaviorVerification, 100);
});

test('withholds verification for an incompatible role-bound target even when the oracle follows it', () => {
  const testSource = `
    it('uses a bound unrelated target', async () => {
      const onSave = vi.fn();
      render(<><SaveButton disabled onSave={onSave} /><input type="checkbox" /></>);
      const unrelated = screen.getByRole('checkbox');
      await user.click(unrelated);
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorReach, 100);
  assert.equal(report.scores.behaviorVerification, 0);
});

test('withholds verification when interaction target identity is unknown', () => {
  const testSource = `
    it('uses a text query that does not expose role evidence', async () => {
      const onSave = vi.fn();
      render(<SaveButton disabled onSave={onSave} />);
      await user.click(screen.getByText('Save'));
      expect(onSave).not.toHaveBeenCalled();
    });
  `;

  const report = analyzeReactSources({ componentSource, testSource });
  assert.equal(report.results[0]?.status, 'exercised');
  assert.equal(report.scores.behaviorVerification, 0);
});
