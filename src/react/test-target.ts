import ts from 'typescript';
import type { BehaviorTarget } from '../core/model';

export type QueryTextMatcher =
  | { kind: 'string'; value: string }
  | { kind: 'regex'; source: string; flags: string };

export interface QueryTarget {
  queryName: string;
  role?: string;
  name?: QueryTextMatcher;
  label?: QueryTextMatcher;
  testId?: string;
  singular: boolean;
}

const queryPattern = /^(?:get|query|find)(All)?By(Role|LabelText|TestId|Text|DisplayValue)$/;

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAwaitExpression(current)
  ) current = current.expression;
  return current;
}

function queryName(call: ts.CallExpression): string | undefined {
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined;
}

function textMatcher(expression: ts.Expression | undefined): QueryTextMatcher | undefined {
  if (!expression) return undefined;
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current)) return { kind: 'string', value: current.text };
  if (current.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    const raw = current.getText();
    const match = raw.match(/^\/(.*)\/([a-z]*)$/i);
    return match ? { kind: 'regex', source: match[1] ?? '', flags: match[2] ?? '' } : undefined;
  }
  return undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function roleNameOption(expression: ts.Expression | undefined): QueryTextMatcher | undefined {
  if (!expression) return undefined;
  const current = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(current)) return undefined;
  for (const property of current.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== 'name') continue;
    return textMatcher(property.initializer);
  }
  return undefined;
}

export function queryTargetFromCall(call: ts.CallExpression): QueryTarget | undefined {
  const name = queryName(call);
  if (!name) return undefined;
  const parsed = name.match(queryPattern);
  if (!parsed) return undefined;
  const all = parsed[1] === 'All';
  const family = parsed[2];
  const first = call.arguments[0];

  if (family === 'Role') {
    return {
      queryName: name,
      role: first && ts.isStringLiteralLike(first) ? first.text : undefined,
      name: roleNameOption(call.arguments[1]),
      singular: !all,
    };
  }
  if (family === 'LabelText') {
    return { queryName: name, label: textMatcher(first), singular: !all };
  }
  if (family === 'TestId') {
    return {
      queryName: name,
      testId: first && ts.isStringLiteralLike(first) ? first.text : undefined,
      singular: !all,
    };
  }
  return { queryName: name, singular: !all };
}

export function collectQueryBindings(root: ts.Node): Map<string, QueryTarget> {
  const bindings = new Map<string, QueryTarget>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const current = unwrapExpression(node.initializer);
      if (ts.isCallExpression(current)) {
        const query = queryTargetFromCall(current);
        if (query) bindings.set(node.name.text, query);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return bindings;
}

function rootIdentifier(expression: ts.Expression): string | undefined {
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : undefined;
}

export function queryTargetFromExpression(
  expression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, QueryTarget>,
): QueryTarget | undefined {
  if (!expression) return undefined;
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return bindings.get(current.text);
  if (ts.isPropertyAccessExpression(current)) {
    const root = rootIdentifier(current);
    return root ? bindings.get(root) : undefined;
  }
  if (ts.isElementAccessExpression(current)) {
    return queryTargetFromExpression(current.expression, bindings);
  }
  if (!ts.isCallExpression(current)) return undefined;
  return queryTargetFromCall(current);
}

function matcherMatches(matcher: QueryTextMatcher | undefined, value: string): boolean {
  if (!matcher) return false;
  if (matcher.kind === 'string') return matcher.value === value;
  try {
    return new RegExp(matcher.source, matcher.flags).test(value);
  } catch {
    return false;
  }
}

function rolesOverlap(queryRole: string | undefined, targetRoles: readonly string[] | undefined): boolean {
  if (!queryRole || !targetRoles || targetRoles.length === 0) return true;
  return targetRoles.includes(queryRole);
}

/**
 * Positive identity proof for a Testing Library query and a production target.
 * Named/test-id evidence is strongest. A role-only query is accepted only when
 * production analysis proves that the governing component has one candidate of
 * that element family. Unknown/ambiguous identity never upgrades to VERIFIED.
 */
export function queryTargetCorrelates(
  query: QueryTarget | undefined,
  target: BehaviorTarget,
  dynamicAccessibleName?: string,
): boolean {
  if (!query || !query.singular) return false;
  if (!rolesOverlap(query.role, target.roles)) return false;

  if (query.testId) return !!target.testId && query.testId === target.testId;

  const expectedName = target.accessibleName ?? dynamicAccessibleName;
  if (query.name) return !!expectedName && matcherMatches(query.name, expectedName);
  if (query.label) return !!expectedName && matcherMatches(query.label, expectedName);

  // ByText/ByDisplayValue without a role/label/test-id is not a sufficiently
  // strong identity signal for element-state verification.
  if (!query.role) return false;

  return target.candidateCount === 1;
}
