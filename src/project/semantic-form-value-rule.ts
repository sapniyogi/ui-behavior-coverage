import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import { attributeExpression, collectMuiImports, collectSemanticComponents, formFieldBinding, forwardsFormField } from './semantic-shared';

export function extractSemanticFormValueRule(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  const imports = collectMuiImports(sourceFile);
  const supported = new Set(['TextField', 'Input', 'InputBase', 'OutlinedInput', 'FilledInput', 'Select']);
  const out: RenderStateBehaviorContract[] = [];
  for (const context of collectSemanticComponents(sourceFile)) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const component = tag ? imports.get(tag) : undefined;
        if (component && supported.has(component)) {
          const expression = attributeExpression(node, 'value');
          const field = expression ? formFieldBinding(expression, context) : forwardsFormField(node, context);
          if (field) out.push({
            id: context.name + ':form-value:' + field.fieldKeyProp,
            componentName: context.name,
            provider: 'material-ui',
            kind: 'mui-form-controlled-value-render-state',
            title: 'form field controls rendered value',
            condition: { prop: field.fieldKeyProp, value: 'bound' },
            event: { eventName: 'render' },
            expectation: { type: 'form-controlled-state', state: 'value', fieldKeyProp: field.fieldKeyProp, containers: ['defaultValues', 'record', 'values'] },
            evidence: { fileName: sourceFile.fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    if (context.fn.body) visit(context.fn.body);
  }
  return out;
}
