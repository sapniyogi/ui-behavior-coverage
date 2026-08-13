import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import { attributeExpression, booleanBinding, collectMuiImports, collectSemanticComponents, directPublicProp, forwardsProp } from './semantic-shared';

const attributes = ['aria-expanded', 'aria-selected', 'aria-invalid', 'aria-checked', 'aria-disabled', 'aria-pressed', 'aria-current', 'aria-label', 'aria-valuenow'];

export function extractSemanticAccessibilityRule(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
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
            if (prop) out.push({
              id: context.name + ':aria:' + attribute + ':' + prop,
              componentName: context.name,
              provider: 'material-ui',
              kind: 'mui-accessibility-attribute-render-state',
              title: prop + ' is exposed through ' + attribute,
              condition: { prop, value: 'bound' },
              event: { eventName: 'render' },
              expectation: { type: 'element-attribute-state', attribute, valueSource: 'condition' },
              evidence: { fileName: sourceFile.fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
            });
          }
          const config = component === 'Accordion'
            ? { prop: 'expanded', attribute: 'aria-expanded', kind: 'mui-accordion-expanded-render-state' as const }
            : component === 'ToggleButton'
              ? { prop: 'selected', attribute: 'aria-pressed', kind: 'mui-toggle-button-selected-render-state' as const }
              : undefined;
          if (config) {
            const expression = attributeExpression(node, config.prop);
            const binding = expression ? booleanBinding(expression, context) : forwardsProp(node, config.prop, context) ? { prop: config.prop, inverted: false } : undefined;
            if (binding && !binding.inverted) out.push({
              id: context.name + ':' + config.prop + ':' + binding.prop,
              componentName: context.name,
              provider: 'material-ui',
              kind: config.kind,
              title: binding.prop + ' is reflected by ' + config.attribute,
              condition: { prop: binding.prop, value: 'bound' },
              event: { eventName: 'render' },
              expectation: { type: 'element-attribute-state', attribute: config.attribute, valueSource: 'condition' },
              evidence: { fileName: sourceFile.fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
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
