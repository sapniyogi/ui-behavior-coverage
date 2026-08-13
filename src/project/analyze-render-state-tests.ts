import ts from 'typescript';
import type {
  BehaviorResult,
  BehaviorStatus,
  RenderStateBehaviorContract,
} from '../core/model';

interface TestCase {
  name: string;
  body: ts.Node;
}

type ResolvedValue =
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'identifier'; text: string }
  | { kind: 'unknown' };

interface QueryBinding {
  variable: string;
  role?: string;
  position: number;
}

function collectTestCases(sourceFile: ts.SourceFile): TestCase[] {
  const result: TestCase[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'test' || node.expression.text === 'it')
    ) {
      const name = node.arguments[0];
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        result.push({
          name: name && ts.isStringLiteralLike(name) ? name.text : '<anonymous test>',
          body: callback.body,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function collectConstObjects(root: ts.Node): Map<string, ts.ObjectLiteralExpression> {
  const objects = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) === ts.NodeFlags.Const
    ) objects.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return objects;
}

function valueOf(expression: ts.Expression | undefined): ResolvedValue {
  if (!expression) return { kind: 'unknown' };
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true' };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'false' };
  if (ts.isIdentifier(expression)) return { kind: 'identifier', text: expression.text };
  return { kind: 'unknown' };
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function objectValue(object: ts.ObjectLiteralExpression, name: string): ResolvedValue | undefined {
  let result: ResolvedValue | undefined;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      result = { kind: 'unknown' };
      continue;
    }
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      result = valueOf(property.initializer);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      result = { kind: 'identifier', text: property.name.text };
    }
  }
  return result;
}

function jsxValue(attribute: ts.JsxAttribute): ResolvedValue {
  if (!attribute.initializer) return { kind: 'true' };
  if (!ts.isJsxExpression(attribute.initializer)) return { kind: 'unknown' };
  return valueOf(attribute.initializer.expression);
}

function resolveCondition(
  element: ts.JsxOpeningLikeElement,
  conditionProp: string,
  objects: Map<string, ts.ObjectLiteralExpression>,
): ResolvedValue | undefined {
  let resolved: ResolvedValue | undefined;
  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (!ts.isIdentifier(property.expression)) {
        resolved = { kind: 'unknown' };
        continue;
      }
      const object = objects.get(property.expression.text);
      if (!object) {
        resolved = { kind: 'unknown' };
        continue;
      }
      const value = objectValue(object, conditionProp);
      if (value) resolved = value;
      continue;
    }
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === conditionProp) {
      resolved = jsxValue(property);
    }
  }
  return resolved;
}

function conditionMatches(value: ResolvedValue | undefined, expected: boolean | 'bound'): boolean {
  if (expected === 'bound') return !!value && value.kind !== 'unknown';
  return expected ? value?.kind === 'true' : value?.kind === 'false';
}

function matchingElement(root: ts.Node, componentName: string): ts.JsxOpeningLikeElement | undefined {
  let match: ts.JsxOpeningLikeElement | undefined;
  const visit = (node: ts.Node): void => {
    if (match) return;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) && node.tagName.text === componentName) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return match;
}

function renderPosition(testBody: ts.Node, behavior: RenderStateBehaviorContract): number | undefined {
  const objects = collectConstObjects(testBody);
  let position: number | undefined;
  const visit = (node: ts.Node): void => {
    if (position !== undefined) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render' &&
      node.arguments[0]
    ) {
      const element = matchingElement(node.arguments[0], behavior.componentName);
      if (element && conditionMatches(resolveCondition(element, behavior.condition.prop, objects), behavior.condition.value)) {
        position = node.getStart();
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return position;
}

function queryRole(call: ts.CallExpression): string | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  const name = call.expression.name.text;
  if (!/^(?:get|query|find)(?:All)?ByRole$/.test(name)) return undefined;
  const first = call.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : undefined;
}

function isDomQuery(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  return /^(?:get|query|find)(?:All)?By(?:Role|LabelText|TestId|Text)$/.test(call.expression.name.text);
}

function collectQueryBindings(testBody: ts.Node): Map<string, QueryBinding> {
  const bindings = new Map<string, QueryBinding>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      isDomQuery(node.initializer)
    ) {
      bindings.set(node.name.text, {
        variable: node.name.text,
        role: queryRole(node.initializer),
        position: node.getStart(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return bindings;
}

interface ExpectTarget {
  variable?: string;
  property?: string;
  negated: boolean;
}

function rootIdentifier(expression: ts.Expression): string | undefined {
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : undefined;
}

function inspectExpect(expression: ts.Expression): ExpectTarget {
  let current = expression;
  let negated = false;
  while (ts.isPropertyAccessExpression(current)) {
    if (current.name.text === 'not') negated = true;
    current = current.expression;
  }
  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression) || current.expression.text !== 'expect') {
    return { negated };
  }
  const target = current.arguments[0];
  if (!target) return { negated };
  if (ts.isIdentifier(target)) return { variable: target.text, negated };
  if (ts.isPropertyAccessExpression(target)) {
    return {
      variable: rootIdentifier(target),
      property: target.name.text,
      negated,
    };
  }
  return { negated };
}

function literalBoolean(expression: ts.Expression | undefined): boolean | undefined {
  if (!expression) return undefined;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function roleCompatible(binding: QueryBinding, state: 'disabled' | 'checked'): boolean {
  if (!binding.role) return true;
  if (state === 'checked') return ['checkbox', 'radio', 'switch'].includes(binding.role);
  return ['button', 'checkbox', 'radio', 'switch', 'textbox', 'combobox'].includes(binding.role);
}

function stateAssertionMatches(
  call: ts.CallExpression,
  behavior: RenderStateBehaviorContract,
  bindings: Map<string, QueryBinding>,
): boolean {
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  const matcher = call.expression.name.text;
  const target = inspectExpect(call.expression.expression);
  if (!target.variable) return false;
  const binding = bindings.get(target.variable);
  if (!binding || !roleCompatible(binding, behavior.expectation.state)) return false;

  const expected = behavior.expectation.value;
  const state = behavior.expectation.state;

  if (target.property === state && (matcher === 'toBe' || matcher === 'toEqual')) {
    const actualExpected = literalBoolean(call.arguments[0]);
    return actualExpected !== undefined && actualExpected === expected && !target.negated;
  }

  if (matcher === 'toHaveProperty' && call.arguments[0] && ts.isStringLiteralLike(call.arguments[0])) {
    if (call.arguments[0].text !== state) return false;
    const actualExpected = literalBoolean(call.arguments[1]);
    return actualExpected !== undefined && actualExpected === expected && !target.negated;
  }

  if (state === 'disabled') {
    if (matcher === 'toBeDisabled') return target.negated ? !expected : expected;
    if (matcher === 'toBeEnabled') return target.negated ? expected : !expected;
  }

  if (state === 'checked' && matcher === 'toBeChecked') {
    return target.negated ? !expected : expected;
  }

  return false;
}

function verificationPosition(
  testBody: ts.Node,
  behavior: RenderStateBehaviorContract,
  after: number,
): number | undefined {
  const bindings = collectQueryBindings(testBody);
  let result: number | undefined;
  const visit = (node: ts.Node): void => {
    if (result !== undefined) return;
    if (ts.isCallExpression(node) && node.getStart() > after && stateAssertionMatches(node, behavior, bindings)) {
      result = node.getStart();
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return result;
}

function conditionText(behavior: RenderStateBehaviorContract): string {
  return `${behavior.condition.prop}=${String(behavior.condition.value)}`;
}

function suggestion(behavior: RenderStateBehaviorContract): string {
  const { state, value } = behavior.expectation;
  if (state === 'disabled') return value
    ? 'expect(<element>).toBeDisabled();'
    : 'expect(<element>).toBeEnabled();';
  return value
    ? 'expect(<element>).toBeChecked();'
    : 'expect(<element>).not.toBeChecked();';
}

function resultForTest(
  testCase: TestCase,
  behavior: RenderStateBehaviorContract,
): BehaviorResult | undefined {
  const renderedAt = renderPosition(testCase.body, behavior);
  if (renderedAt === undefined) return undefined;

  const verifiedAt = verificationPosition(testCase.body, behavior, renderedAt);
  if (verifiedAt !== undefined) {
    return {
      behavior,
      status: 'verified',
      testName: testCase.name,
      reason: `The test renders ${conditionText(behavior)} and explicitly verifies ${behavior.expectation.state}=${behavior.expectation.value}.`,
    };
  }

  return {
    behavior,
    status: 'exercised',
    testName: testCase.name,
    reason: `The test renders ${conditionText(behavior)}, reaching the state contract, but never explicitly verifies ${behavior.expectation.state}=${behavior.expectation.value}.`,
    suggestedAssertion: suggestion(behavior),
  };
}

const rank: Record<BehaviorStatus, number> = { discovered: 0, exercised: 1, verified: 2 };

export function analyzeRenderStateTests(
  testSource: string,
  behaviors: RenderStateBehaviorContract[],
  fileName = 'component.test.tsx',
): BehaviorResult[] {
  const sourceFile = ts.createSourceFile(fileName, testSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tests = collectTestCases(sourceFile);

  return behaviors.map((behavior) => {
    let strongest: BehaviorResult | undefined;
    for (const testCase of tests) {
      const candidate = resultForTest(testCase, behavior);
      if (!candidate) continue;
      if (!strongest || rank[candidate.status] > rank[strongest.status]) strongest = candidate;
      if (strongest.status === 'verified') break;
    }
    return strongest ?? {
      behavior,
      status: 'discovered',
      reason: `No test renders ${behavior.componentName} with ${conditionText(behavior)} in a resolvable form.`,
    };
  });
}
