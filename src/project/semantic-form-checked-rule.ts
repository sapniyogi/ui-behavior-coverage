import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import { attributeExpression, collectMuiImports, collectSemanticComponents, formFieldBinding } from './semantic-shared';

export function extractSemanticFormCheckedRule(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  const imports = collectMuiImports(sourceFile);
  const out: RenderStateBehaviorContract[] = [];
  for (const context of collectSemanticComponents(sourceFile)) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const component = tag ? imports.get(tag) : undefined;
        if (component && ['Checkbox', 'Switch', 'Radio'].includes(component)) {
          const checked = attributeExpression(node, 'checked');
          const field = checked ? formFieldBinding(checked, context) : undefined;
          if (field) out.push({
            id: context.name + ':form-checked:' + field.fieldKeyProp,
            componentName: context.name,
            provider: 'material-ui',
            kind: 'mui-form-controlled-checked-render-state',
            title: 'form field controls checked state',
            condition: { prop: field.fieldKeyProp, value: 'bound' },
            event: { eventName: 'render' },
            expectation: { type: 'form-controlled-state', state: 'checked', fieldKeyProp: field.fieldKeyProp, containers: ['defaultValues', 'record', 'values'] },
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
