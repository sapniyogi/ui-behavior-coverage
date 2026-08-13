import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

test('verifies a bound TextField value', () => {
  const file = ts.createSourceFile(
    'NameField.tsx',
    `import TextField from '@mui/material/TextField';
     export function NameField({ value }: any) { return <TextField value={value} />; }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const behavior = extractMaterialUiSemanticBehaviors(file).find(
    (item) => item.kind === 'mui-text-field-value-render-state',
  );
  assert.ok(behavior);
  const [result] = analyzeRenderStateTests(`
    test('value', () => {
      render(<NameField value="Ada" />);
      expect(screen.getByRole('textbox')).toHaveValue('Ada');
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'verified');
});
