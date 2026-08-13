import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import {
  attributeExpression,
  collectMuiImports,
  collectSemanticComponents,
  directPublicProp,
} from './semantic-shared';

const attributes = [
  'aria-expanded',
  'aria-selected',
  'aria-invalid',
  'aria-checked',
  'aria-disabled',
  'aria-pressed',
  'aria-current',
  'aria-label',
  'aria-valuenow',
] as const;

export function extractSemanticAccessibilityRule(
  sourceFile: ts.SourceFile,
): RenderStateBehaviorContract[] {
  const imports = collectMuiImports(sourceFile);
  const out: RenderStateBehaviorContract[] = [];
  for (const context of collectSemanticComponents(sourceFile)) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const component = tag ? imports.get(tag) : undefined;
        if (component) {
          for (const attribute of attributes) {
            const expression = attributeExpression(node, attribute);
            const prop = expression ? directPublicProp(expression, context) : undefined;
            if (!prop) continue;
            out.push({
              id: `${context.name}:aria:${attribute}:${prop}`,
              componentName: context.name,
              provider: 'material-ui',
              kind: 'mui-accessibility-attribute-render-state',
              title: `${prop} is exposed through ${attribute}`,
              condition: { prop, value: 'bound' },
              event: { eventName: 'render' },
              expectation: {
                type: 'element-attribute-state',
                attribute,
                valueSource: 'condition',
              },
              evidence: {
                fileName: sourceFile.fileName,
                line: lineOf(sourceFile, node),
                snippet: node.getText(sourceFile),
              },
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (context.fn.body) visit(context.fn.body);
  }
  return out;
}
