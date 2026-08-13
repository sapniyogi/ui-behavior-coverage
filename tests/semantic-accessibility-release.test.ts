import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

function extract(source: string) {
  const file = ts.createSourceFile('Component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return extractMaterialUiSemanticBehaviors(file);
}

test('extracts explicit aria-expanded forwarding from a public prop', () => {
  const behaviors = extract(`
    import IconButton from '@mui/material/IconButton';
    export function Disclosure({ expanded }: { expanded: boolean }) {
      return <IconButton aria-expanded={expanded}>Details</IconButton>;
    }
  `);
  const behavior = behaviors.find((item) => item.expectation.type === 'element-attribute-state'
    && item.expectation.attribute === 'aria-expanded');
  assert.ok(behavior);
  assert.equal(behavior.condition.prop, 'expanded');
  assert.equal(behavior.condition.value, 'bound');
});

test('verifies aria-expanded when the rendered value and assertion agree', () => {
  const behavior = extract(`
    import IconButton from '@mui/material/IconButton';
    export function Disclosure({ expanded }: { expanded: boolean }) {
      return <IconButton aria-expanded={expanded}>Details</IconButton>;
    }
  `).find((item) => item.expectation.type === 'element-attribute-state'
    && item.expectation.attribute === 'aria-expanded');
  assert.ok(behavior);

  const [result] = analyzeRenderStateTests(`
    test('expanded state', () => {
      render(<Disclosure expanded />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'verified');
});

test('verifies aria-selected false without treating false as missing evidence', () => {
  const behavior = extract(`
    import ButtonBase from '@mui/material/ButtonBase';
    export function Option({ selected }: { selected: boolean }) {
      return <ButtonBase aria-selected={selected}>Option</ButtonBase>;
    }
  `).find((item) => item.expectation.type === 'element-attribute-state'
    && item.expectation.attribute === 'aria-selected');
  assert.ok(behavior);

  const [result] = analyzeRenderStateTests(`
    test('not selected', () => {
      render(<Option selected={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-selected', 'false');
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'verified');
});

test('keeps a wrong aria assertion at EXERCISED rather than VERIFIED', () => {
  const behavior = extract(`
    import IconButton from '@mui/material/IconButton';
    export function Disclosure({ expanded }: { expanded: boolean }) {
      return <IconButton aria-expanded={expanded}>Details</IconButton>;
    }
  `).find((item) => item.expectation.type === 'element-attribute-state'
    && item.expectation.attribute === 'aria-expanded');
  assert.ok(behavior);

  const [result] = analyzeRenderStateTests(`
    test('wrong oracle', () => {
      render(<Disclosure expanded />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'exercised');
});

test('supports public aria-label values as semantic evidence', () => {
  const behavior = extract(`
    import IconButton from '@mui/material/IconButton';
    export function LabeledButton({ label }: { label: string }) {
      return <IconButton aria-label={label}>X</IconButton>;
    }
  `).find((item) => item.expectation.type === 'element-attribute-state'
    && item.expectation.attribute === 'aria-label');
  assert.ok(behavior);

  const [result] = analyzeRenderStateTests(`
    test('label', () => {
      render(<LabeledButton label="Inbox" />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Inbox');
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'verified');
});

test('does not assign Material UI accessibility semantics to an unrelated custom component', () => {
  const behaviors = extract(`
    import IconButton from './IconButton';
    export function Disclosure({ expanded }: { expanded: boolean }) {
      return <IconButton aria-expanded={expanded}>Details</IconButton>;
    }
  `);
  assert.equal(behaviors.filter((item) => item.kind === 'mui-accessibility-attribute-render-state').length, 0);
});
