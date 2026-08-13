import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

test('verifies Dialog visibility from public open state', () => {
  const file = ts.createSourceFile(
    'Confirm.tsx',
    `import Dialog from '@mui/material/Dialog';
     export function Confirm({ open }: any) { return <Dialog open={open}>Confirm</Dialog>; }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const behavior = extractMaterialUiSemanticBehaviors(file).find(
    (item) => item.kind === 'mui-dialog-visibility-render-state' && item.condition.value === true,
  );
  assert.ok(behavior);
  const [result] = analyzeRenderStateTests(`
    test('open', () => {
      render(<Confirm open />);
      expect(screen.getByRole('dialog')).toBeVisible();
    });
  `, [behavior]);
  assert.ok(result);
  assert.equal(result.status, 'verified');
});
