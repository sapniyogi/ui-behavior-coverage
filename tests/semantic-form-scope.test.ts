import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

test('verifies form-controlled checked state using enclosing describe constants', () => {
  const source = `
    import Switch from '@mui/material/Switch';
    export function BooleanInput(props: any) {
      const { source } = useThemeProps({ props, name: 'BooleanInput' });
      const { field } = useInput({ source });
      return <Switch checked={Boolean(field.value)} />;
    }
  `;
  const file = ts.createSourceFile('BooleanInput.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const behavior = extractMaterialUiSemanticBehaviors(file).find(
    (item) => item.kind === 'mui-form-controlled-checked-render-state',
  );
  assert.ok(behavior);

  const [result] = analyzeRenderStateTests(`
    describe('BooleanInput', () => {
      const defaultProps = { source: 'isPublished' };
      test('uses form defaults', () => {
        render(
          <SimpleForm defaultValues={{ isPublished: true }}>
            <BooleanInput {...defaultProps} />
          </SimpleForm>
        );
        const input = screen.getByLabelText('Published') as HTMLInputElement;
        expect(input.checked).toBe(true);
      });
    });
  `, [behavior]);

  assert.ok(result);
  assert.equal(result.status, 'verified');
});
