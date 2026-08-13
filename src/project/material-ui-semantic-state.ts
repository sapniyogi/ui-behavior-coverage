import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import { extractSemanticAccessibilityRule } from './semantic-accessibility-rule';
import { extractSemanticFormCheckedRule } from './semantic-form-checked-rule';
import { extractSemanticFormValueRule } from './semantic-form-value-rule';
import { extractSemanticValueRule } from './semantic-value-rule';
import { extractSemanticVisibilityRule } from './semantic-visibility-rule';

const conservativeVisibilityKinds = new Set([
  'mui-dialog-visibility-render-state',
  'mui-popover-visibility-render-state',
  'mui-menu-visibility-render-state',
  'mui-modal-visibility-render-state',
]);

export function extractMaterialUiSemanticBehaviors(sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  const visibility = extractSemanticVisibilityRule(sourceFile).filter((behavior) =>
    conservativeVisibilityKinds.has(behavior.kind)
  );
  const behaviors = [
    ...extractSemanticValueRule(sourceFile),
    ...extractSemanticFormCheckedRule(sourceFile),
    ...extractSemanticFormValueRule(sourceFile),
    ...visibility,
    ...extractSemanticAccessibilityRule(sourceFile),
  ];
  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    const key = [
      behavior.componentName,
      behavior.kind,
      behavior.condition.prop,
      String(behavior.condition.value),
      JSON.stringify(behavior.expectation),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
