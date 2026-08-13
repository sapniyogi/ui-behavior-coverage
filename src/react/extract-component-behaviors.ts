import ts from 'typescript';
import type { BehaviorContract } from '../core/model';
import { materialUiBehaviorProvider } from '../providers/material-ui';
import { materialUiCompositionProvider } from '../providers/material-ui-composition';
import { nativeHtmlBehaviorProvider } from '../providers/native-html';
import type { BehaviorProvider } from '../providers/types';

export const defaultBehaviorProviders: readonly BehaviorProvider[] = [
  nativeHtmlBehaviorProvider,
  materialUiBehaviorProvider,
  materialUiCompositionProvider,
];

export function extractComponentBehaviors(
  sourceText: string,
  fileName = 'component.tsx',
  providers: readonly BehaviorProvider[] = defaultBehaviorProviders,
): BehaviorContract[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const behaviors = providers.flatMap((provider) => provider.extract(sourceFile));
  const seen = new Set<string>();

  return behaviors.filter((behavior) => {
    if (seen.has(behavior.id)) return false;
    seen.add(behavior.id);
    return true;
  });
}
