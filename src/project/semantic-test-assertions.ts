import ts from 'typescript';
import type { RenderStateBehaviorContract, SemanticPrimitive } from '../core/model';
import {
  collectTestEnvironment,
  primitiveValue,
  unwrapExpression,
  type RenderEvidence,
  type TestEnvironment,
} from './semantic-test-environment';
import {
  collectQueryBindings,
  queryTargetCorrelates,
  queryTargetFromExpression,
  type QueryTarget,
} from '../react/test-target';

interface ExpectTarget {
  variable?: string;
  property?: string;
  query?: QueryTarget;
  inlineQuery: boolean;
  negated: boolean;
}

function inspectExpect(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, QueryTarget>,
): ExpectTarget {
  let current = expression;
  let negated = false;
  while (ts.isPropertyAccessExpression(current)) {
    if (current.name.text === 'not') negated = true;
    current = current.expression;
  }
  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression) || current.expression.text !== 'expect') {
    return { inlineQuery: false, negated };
  }
  const raw = current.arguments[0];
  if (!raw) return { inlineQuery: false, negated };
  const target = unwrapExpression(raw);
  if (ts.isIdentifier(target)) {
    return {
      variable: target.text,
      query: bindings.get(target.text),
      inlineQuery: false,
      negated,
    };
  }
  if (ts.isPropertyAccessExpression(target)) {
    return {
      property: target.name.text,
      query: queryTargetFromExpression(target, bindings),
      inlineQuery: !ts.isIdentifier(target.expression),
      negated,
    };
  }
  return {
    query: queryTargetFromExpression(target, bindings),
    inlineQuery: true,
    negated,
  };
}

function roleCompatible(role: string | undefined, state: 'disabled' | 'checked'): boolean {
  if (!role) return true;
  return state === 'checked'
    ? ['checkbox', 'radio', 'switch'].includes(role)
    : ['button', 'checkbox', 'radio', 'switch', 'textbox', 'combobox'].includes(role);
}

function samePrimitive(a: SemanticPrimitive | undefined, b: SemanticPrimitive | undefined): boolean {
  return a !== undefined && b !== undefined && a === b;
}

function targetCorrelates(
  target: ExpectTarget,
  behavior: RenderStateBehaviorContract,
  evidence: RenderEvidence,
): boolean {
  if (!behavior.target) return true;
  const expectation = behavior.expectation;
  const dynamicAccessibleName =
    expectation.type === 'element-attribute-state' &&
    expectation.attribute === 'aria-label' &&
    evidence.expectedValue !== undefined
      ? String(evidence.expectedValue)
      : undefined;
  return queryTargetCorrelates(target.query, behavior.target, dynamicAccessibleName);
}

function assertionMatches(
  call: ts.CallExpression,
  behavior: RenderStateBehaviorContract,
  evidence: RenderEvidence,
  bindings: ReadonlyMap<string, QueryTarget>,
  env: TestEnvironment,
): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  const matcher = call.expression.name.text;
  const target = inspectExpect(call.expression.expression, bindings);
  if (target.variable && !bindings.has(target.variable)) return false;
  if (!targetCorrelates(target, behavior, evidence)) return false;

  const arg0 = primitiveValue(call.arguments[0], env.values);
  const arg1 = primitiveValue(call.arguments[1], env.values);
  const expectation = behavior.expectation;

  if (expectation.type === 'element-boolean-state') {
    if (!behavior.target && !roleCompatible(target.query?.role, expectation.state)) return false;
    if (target.property === expectation.state && (matcher === 'toBe' || matcher === 'toEqual')) {
      return arg0.known && arg0.value === expectation.value && !target.negated;
    }
    if (matcher === 'toHaveProperty' && call.arguments[0] && ts.isStringLiteralLike(call.arguments[0]) && call.arguments[0].text === expectation.state) {
      return arg1.known && arg1.value === expectation.value && !target.negated;
    }
    if (expectation.state === 'disabled') {
      if (matcher === 'toBeDisabled') return target.negated ? !expectation.value : expectation.value;
      if (matcher === 'toBeEnabled') return target.negated ? expectation.value : !expectation.value;
    }
    return expectation.state === 'checked' && matcher === 'toBeChecked'
      ? target.negated ? !expectation.value : expectation.value
      : false;
  }

  if (expectation.type === 'element-value-state' || (expectation.type === 'form-controlled-state' && expectation.state === 'value')) {
    if (target.property === 'value' && (matcher === 'toBe' || matcher === 'toEqual')) {
      return arg0.known && samePrimitive(arg0.value, evidence.expectedValue) && !target.negated;
    }
    return (matcher === 'toHaveValue' || matcher === 'toHaveDisplayValue') && arg0.known && samePrimitive(arg0.value, evidence.expectedValue) && !target.negated;
  }

  if (expectation.type === 'form-controlled-state' && expectation.state === 'checked') {
    if (typeof evidence.expectedValue !== 'boolean') return false;
    if (target.property === 'checked' && (matcher === 'toBe' || matcher === 'toEqual')) {
      return arg0.known && arg0.value === evidence.expectedValue && !target.negated;
    }
    return matcher === 'toBeChecked'
      ? target.negated ? !evidence.expectedValue : evidence.expectedValue
      : false;
  }

  if (expectation.type === 'element-attribute-state') {
    if (evidence.expectedValue === undefined || matcher !== 'toHaveAttribute' || target.negated) return false;
    const attribute = call.arguments[0];
    return !!attribute && ts.isStringLiteralLike(attribute) && attribute.text === expectation.attribute && arg1.known && String(arg1.value) === String(evidence.expectedValue);
  }

  if (expectation.type === 'element-visibility-state') {
    if (matcher === 'toBeVisible') return target.negated ? !expectation.visible : expectation.visible;
    if (!expectation.visible && matcher === 'toBeInTheDocument') return target.negated;
    if (!expectation.visible && matcher === 'toBeNull') return !target.negated && target.inlineQuery;
  }
  return false;
}

export function findVerificationPosition(
  testBody: ts.Node,
  behavior: RenderStateBehaviorContract,
  evidence: RenderEvidence,
  seed?: TestEnvironment,
): number | undefined {
  const bindings = collectQueryBindings(testBody);
  const env = collectTestEnvironment(testBody, seed);
  let result: number | undefined;
  const visit = (node: ts.Node): void => {
    if (result !== undefined) return;
    if (ts.isCallExpression(node) && node.getStart() > evidence.position && assertionMatches(node, behavior, evidence, bindings, env)) {
      result = node.getStart();
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return result;
}
