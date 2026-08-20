import type { AnyBehaviorContract } from './model';

function eventIdentity(behavior: AnyBehaviorContract): string {
  return 'handlerProp' in behavior.event
    ? `${behavior.event.eventName}:${behavior.event.handlerProp}`
    : behavior.event.eventName;
}

/**
 * Rule kind is intentionally excluded. Different inference rules may arrive at
 * the same externally observable proposition; metrics should count that contract
 * once when its source element, condition, event, and expectation are identical.
 */
export function behaviorContractIdentity(behavior: AnyBehaviorContract): string {
  return [
    behavior.componentName,
    behavior.evidence.fileName,
    String(behavior.evidence.line),
    behavior.evidence.snippet,
    behavior.condition.prop,
    String(behavior.condition.value),
    eventIdentity(behavior),
    JSON.stringify(behavior.expectation),
  ].join('|');
}

export function dedupeBehaviorContracts<T extends AnyBehaviorContract>(
  behaviors: readonly T[],
): T[] {
  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    const key = behaviorContractIdentity(behavior);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
