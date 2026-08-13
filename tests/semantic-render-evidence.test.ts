import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

function extract(source: string) {
  const file = ts.createSourceFile('Component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return extractMaterialUiSemanticBehaviors(file);
}

test('verifies bound TextField value and Dialog visibility', () => {
  const valueBehavior = extract(`
    import TextField from '@mui/material/TextField';
    export function NameField({ value }: any) { return <TextField value={value} />; }
  `).find((item) => item.kind === 'mui-text-field-value-render-state');
  assert.ok(valueBehavior);
  assert.equal(analyzeRenderStateTests(`
    test('value', () => {
      render(<NameField value="Ada" />);
      expect(screen.getByRole('textbox')).toHaveValue('Ada');
    });
  `, [valueBehavior])[0].status, 'verified');

  const visibleBehavior = extract(`
    import Dialog from '@mui/material/Dialog';
    export function Confirm({ open }: any) { return <Dialog open={open}>Confirm</Dialog>; }
  `).find((item) => item.kind === 'mui-dialog-visibility-render-state' && item.condition.value === true);
  assert.ok(visibleBehavior);
  assert.equal(analyzeRenderStateTests(`
    test('visible', () => {
      render(<Confirm open />);
      expect(screen.getByRole('dialog')).toBeVisible();
    });
  `, [visibleBehavior])[0].status, 'verified');
});

test('verifies explicit accessibility expansion and selection state', () => {
  const behaviors = extract(`
    import IconButton from '@mui/material/IconButton';
    export function StateButton({ expanded, selected }: any) {
      return <IconButton aria-expanded={expanded} aria-selected={selected}>State</IconButton>;
    }
  `).filter((item) => item.kind === 'mui-accessibility-attribute-render-state');
  assert.equal(behaviors.length, 2);

  const results = analyzeRenderStateTests(`
    test('state', () => {
      render(<StateButton expanded selected={false} />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveAttribute('aria-selected', 'false');
    });
  `, behaviors);

  assert.deepEqual(results.map((result) => result.status), ['verified', 'verified']);
});
