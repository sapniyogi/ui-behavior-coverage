import ts from 'typescript';
import type { RenderStateBehaviorContract, RenderStateBehaviorKind } from '../core/model';
import { jsxTagName, lineOf } from '../providers/shared';
import { attributeExpression, booleanBinding, collectMuiImports, collectSemanticComponents, forwardsProp } from './semantic-shared';

const rules = new Map<string, { prop: 'open' | 'in'; kind: RenderStateBehaviorKind }>([
  ['Dialog', { prop: 'open', kind: 'mui-dialog-visibility-render-state' }],
  ['Popover', { prop: 'open', kind: 'mui-popover-visibility-render-state' }],
  ['Menu', { prop: 'open', kind: 'mui-menu-visibility-render-state' }],
  ['Modal', { prop: 'open', kind: 'mui-modal-visibility-render-state' }],
  ['Collapse', { prop: 'in', kind: 'mui-collapse-visibility-render-state' }],
  ['Fade', { prop: 'in', kind: 'mui-fade-visibility-render-state' }],
  ['Grow', { prop: 'in', kind: 'mui-grow-visibility-render-state' }],
  ['Slide', { prop: 'in', kind: 'mui-slide-visibility-render-state' }],
  ['Zoom', { prop: 'in', kind: 'mui-zoom-visibility-render-state' }],
]);

export function extractSemanticVisibilityRule(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  const imports = collectMuiImports(sourceFile);
  const out: RenderStateBehaviorContract[] = [];
  for (const context of collectSemanticComponents(sourceFile)) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const rule = tag ? rules.get(imports.get(tag) ?? '') : undefined;
        if (rule) {
          const expression = attributeExpression(node, rule.prop);
          const binding = expression ? booleanBinding(expression, context) : forwardsProp(node, rule.prop, context) ? { prop: rule.prop, inverted: false } : undefined;
          if (binding) for (const value of [false, true] as const) {
            const visible = binding.inverted ? !value : value;
            out.push({
              id: context.name + ':visible:' + binding.prop + ':' + value,
              componentName: context.name,
              provider: 'material-ui',
              kind: rule.kind,
              title: binding.prop + '=' + value + ' renders visible=' + visible,
              condition: { prop: binding.prop, value },
              event: { eventName: 'render' },
              expectation: { type: 'element-visibility-state', visible },
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
