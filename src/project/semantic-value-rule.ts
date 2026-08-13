import ts from 'typescript';
import type { RenderStateBehaviorContract, RenderStateBehaviorKind } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import { attributeExpression, collectMuiImports, collectSemanticComponents, directPublicProp, forwardsProp } from './semantic-shared';

const kinds = new Map<string, RenderStateBehaviorKind>([
  ['TextField', 'mui-text-field-value-render-state'],
  ['Input', 'mui-input-value-render-state'],
  ['InputBase', 'mui-input-base-value-render-state'],
  ['OutlinedInput', 'mui-outlined-input-value-render-state'],
  ['FilledInput', 'mui-filled-input-value-render-state'],
  ['Select', 'mui-select-value-render-state'],
  ['Slider', 'mui-slider-value-render-state'],
]);

export function extractSemanticValueRule(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  const imports = collectMuiImports(sourceFile);
  const contexts = collectSemanticComponents(sourceFile);
  const out: RenderStateBehaviorContract[] = [];
  for (const context of contexts) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const kind = tag ? kinds.get(imports.get(tag) ?? '') : undefined;
        if (kind) {
          const expression = attributeExpression(node, 'value');
          const prop = expression ? directPublicProp(expression, context) : forwardsProp(node, 'value', context) ? 'value' : undefined;
          if (prop) out.push({
            id: context.name + ':value:' + prop,
            componentName: context.name,
            provider: 'material-ui',
            kind,
            title: prop + ' is reflected by the rendered input value',
            condition: { prop, value: 'bound' },
            event: { eventName: 'render' },
            expectation: { type: 'element-value-state', state: 'value', valueSource: 'condition' },
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
