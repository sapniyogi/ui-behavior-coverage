import type { RenderStateBehaviorContract } from '../core/model';

/**
 * Behavior kinds are implementation details. If two rules describe the same
 * observable proposition at the same source element, count it once.
 */
export function renderStateContractIdentity(
  behavior: RenderStateBehaviorContract,
): string {
  return [
    behavior.componentName,
    behavior.evidence.fileName,
    String(behavior.evidence.line),
    behavior.evidence.snippet,
    behavior.condition.prop,
    String(behavior.condition.value),
    JSON.stringify(behavior.expectation),
  ].join('|');
}

export function dedupeRenderStateBehaviors<T extends RenderStateBehaviorContract>(
  behaviors: readonly T[],
): T[] {
  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    const key = renderStateContractIdentity(behavior);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
