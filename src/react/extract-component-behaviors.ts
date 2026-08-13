import ts from 'typescript';
import type { BehaviorContract, BehaviorExpectation } from '../core/model';
import { materialUiBehaviorProvider } from '../providers/material-ui';
import { materialUiCompositionProvider } from '../providers/material-ui-composition';
import { nativeHtmlBehaviorProvider } from '../providers/native-html';
import type { BehaviorProvider } from '../providers/types';

export const defaultBehaviorProviders: readonly BehaviorProvider[] = [
  nativeHtmlBehaviorProvider,
  materialUiBehaviorProvider,
  materialUiCompositionProvider,
];

function expectationKey(expectation: BehaviorExpectation): string {
  if (expectation.type === 'callback-not-called') {
    return `${expectation.type}:${expectation.callbackProp}`;
  }

  if (expectation.type === 'callback-event-boolean') {
    return [
      expectation.type,
      expectation.callbackProp,
      expectation.path.join('.'),
      String(expectation.value),
    ].join(':');
  }

  if (expectation.type === 'callback-event-path') {
    return [
      expectation.type,
      expectation.callbackProp,
      expectation.path.join('.'),
    ].join(':');
  }

  return `${expectation.type}:${expectation.state}:${expectation.value}`;
}

/**
 * Provider IDs are intentionally implementation-specific. Multiple providers may
 * discover the same public contract through different evidence paths, so merge
 * by observable semantics instead. Provider order is precedence order: the
 * established direct provider wins over the broader composition provider when
 * both describe the same behavior.
 */
function semanticBehaviorKey(behavior: BehaviorContract): string {
  return [
    behavior.provider,
    behavior.componentName,
    behavior.kind,
    behavior.condition.prop,
    String(behavior.condition.value),
    behavior.event.handlerProp,
    behavior.event.eventName,
    expectationKey(behavior.expectation),
  ].join('|');
}

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

  const merged: BehaviorContract[] = [];
  const seenIds = new Set<string>();
  const seenSemantics = new Set<string>();

  for (const provider of providers) {
    for (const behavior of provider.extract(sourceFile)) {
      const semanticKey = semanticBehaviorKey(behavior);
      if (seenIds.has(behavior.id) || seenSemantics.has(semanticKey)) continue;
      seenIds.add(behavior.id);
      seenSemantics.add(semanticKey);
      merged.push(behavior);
    }
  }

  return merged;
}
