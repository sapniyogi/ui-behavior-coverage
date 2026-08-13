import ts from 'typescript';
import type {
  BehaviorContract,
  BehaviorExpectation,
  BehaviorResult,
  BehaviorStatus,
} from '../core/model';

interface RenderBinding {
  callbackVariable: string;
  renderPosition: number;
}

interface TestCase {
  name: string;
  body: ts.Node;
}

type ResolvedValue =
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'identifier'; text: string }
  | { kind: 'string'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'unknown' };

interface PropResolution {
  condition: ResolvedValue | undefined;
  callback: ResolvedValue | undefined;
}

function isTestCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && (node.expression.text === 'it' || node.expression.text === 'test');
}

function testName(node: ts.CallExpression): string {
  const first = node.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : '<anonymous test>';
}

function collectTestCases(sourceFile: ts.SourceFile): TestCase[] {
  const cases: TestCase[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCall(node)) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        cases.push({ name: testName(node), body: callback.body });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return cases;
}

function isConstVariableDeclaration(node: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) === ts.NodeFlags.Const
  );
}

function collectConstObjectLiterals(root: ts.Node): Map<string, ts.ObjectLiteralExpression> {
  const objects = new Map<string, ts.ObjectLiteralExpression>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      isConstVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      objects.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(root);
  return objects;
}

function expressionValue(expression: ts.Expression | undefined): ResolvedValue {
  if (!expression) return { kind: 'unknown' };
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true' };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'false' };
  if (ts.isIdentifier(expression)) return { kind: 'identifier', text: expression.text };
  if (ts.isStringLiteralLike(expression)) return { kind: 'string', text: expression.text };
  if (ts.isNumericLiteral(expression)) return { kind: 'number', value: Number(expression.text) };
  return { kind: 'unknown' };
}

function jsxAttributeValue(attribute: ts.JsxAttribute): ResolvedValue {
  if (!attribute.initializer) return { kind: 'true' };
  if (ts.isStringLiteralLike(attribute.initializer)) {
    return { kind: 'string', text: attribute.initializer.text };
  }
  if (!ts.isJsxExpression(attribute.initializer)) return { kind: 'unknown' };
  return expressionValue(attribute.initializer.expression);
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function objectPropertyValue(
  object: ts.ObjectLiteralExpression,
  propertyName: string,
): ResolvedValue | undefined {
  let value: ResolvedValue | undefined;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      value = { kind: 'unknown' };
      continue;
    }

    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName) {
      value = expressionValue(property.initializer);
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName) {
      value = { kind: 'identifier', text: property.name.text };
    }
  }

  return value;
}

function resolveComponentProps(
  element: ts.JsxOpeningLikeElement,
  behavior: BehaviorContract,
  objects: Map<string, ts.ObjectLiteralExpression>,
): PropResolution {
  let condition: ResolvedValue | undefined;
  let callback: ResolvedValue | undefined;

  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (!ts.isIdentifier(property.expression)) {
        condition = { kind: 'unknown' };
        callback = { kind: 'unknown' };
        continue;
      }

      const object = objects.get(property.expression.text);
      if (!object) {
        condition = { kind: 'unknown' };
        callback = { kind: 'unknown' };
        continue;
      }

      const spreadCondition = objectPropertyValue(object, behavior.condition.prop);
      const spreadCallback = objectPropertyValue(object, behavior.expectation.callbackProp);
      if (spreadCondition) condition = spreadCondition;
      if (spreadCallback) callback = spreadCallback;
      continue;
    }

    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;

    if (property.name.text === behavior.condition.prop) {
      condition = jsxAttributeValue(property);
    } else if (property.name.text === behavior.expectation.callbackProp) {
      callback = jsxAttributeValue(property);
    }
  }

  return { condition, callback };
}

function resolvedConditionMatches(value: ResolvedValue | undefined, expected: boolean | 'bound'): boolean {
  if (expected === 'bound') return !!value && value.kind !== 'unknown';
  return expected ? value?.kind === 'true' : value?.kind === 'false';
}

function matchingComponentElement(
  root: ts.Node,
  componentName: string,
): ts.JsxOpeningLikeElement | undefined {
  let match: ts.JsxOpeningLikeElement | undefined;

  const visit = (node: ts.Node): void => {
    if (match) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && node.tagName.text === componentName) {
        match = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(root);
  return match;
}

function findRenderBinding(testBody: ts.Node, behavior: BehaviorContract): RenderBinding | undefined {
  let binding: RenderBinding | undefined;
  const objects = collectConstObjectLiterals(testBody);

  const visit = (node: ts.Node): void => {
    if (binding) return;

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render' &&
      node.arguments[0]
    ) {
      const component = matchingComponentElement(node.arguments[0], behavior.componentName);
      if (component) {
        const props = resolveComponentProps(component, behavior, objects);

        if (
          resolvedConditionMatches(props.condition, behavior.condition.value) &&
          props.callback?.kind === 'identifier'
        ) {
          binding = {
            callbackVariable: props.callback.text,
            renderPosition: node.getStart(),
          };
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return binding;
}

function interactionPositions(testBody: ts.Node, eventName: string): number[] {
  const positions: number[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === eventName) positions.push(node.getStart());
    }
    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return positions;
}

interface ExpectChain {
  target?: string;
  negated: boolean;
}

function inspectExpectChain(expression: ts.Expression): ExpectChain {
  let current: ts.Expression = expression;
  let negated = false;

  while (ts.isPropertyAccessExpression(current)) {
    if (current.name.text === 'not') negated = true;
    current = current.expression;
  }

  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === 'expect' &&
    current.arguments[0] &&
    ts.isIdentifier(current.arguments[0])
  ) {
    return { target: current.arguments[0].text, negated };
  }

  return { negated };
}

function isZeroLiteral(node: ts.Expression | undefined): boolean {
  return !!node && ts.isNumericLiteral(node) && Number(node.text) === 0;
}

function unwrapObjectContaining(expression: ts.Expression): ts.ObjectLiteralExpression | undefined {
  if (ts.isObjectLiteralExpression(expression)) return expression;
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'expect' &&
    expression.expression.name.text === 'objectContaining' &&
    expression.arguments[0] &&
    ts.isObjectLiteralExpression(expression.arguments[0])
  ) {
    return expression.arguments[0];
  }
  return undefined;
}

function booleanLiteralMatches(expression: ts.Expression, expected: boolean): boolean {
  return expected
    ? expression.kind === ts.SyntaxKind.TrueKeyword
    : expression.kind === ts.SyntaxKind.FalseKeyword;
}

function objectContainsBooleanPath(
  expression: ts.Expression,
  path: readonly string[],
  expected: boolean,
): boolean {
  const object = unwrapObjectContaining(expression);
  if (!object || path.length === 0) return false;

  const [head, ...tail] = path;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || propertyNameText(property.name) !== head) continue;
    if (tail.length === 0) return booleanLiteralMatches(property.initializer, expected);
    return objectContainsBooleanPath(property.initializer, tail, expected);
  }

  return false;
}

function objectContainsPath(expression: ts.Expression, path: readonly string[]): boolean {
  const object = unwrapObjectContaining(expression);
  if (!object || path.length === 0) return false;

  const [head, ...tail] = path;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || propertyNameText(property.name) !== head) continue;
    if (tail.length === 0) return true;
    return objectContainsPath(property.initializer, tail);
  }

  return false;
}

function callbackSuppressionVerification(
  call: ts.CallExpression,
  matcher: string,
  chain: ExpectChain,
): boolean {
  const negativeCalled = matcher === 'toHaveBeenCalled' && chain.negated;
  const zeroCalls = matcher === 'toHaveBeenCalledTimes' && isZeroLiteral(call.arguments[0]);
  return negativeCalled || zeroCalls;
}

function callbackEventBooleanVerification(
  call: ts.CallExpression,
  matcher: string,
  expectation: Extract<BehaviorExpectation, { type: 'callback-event-boolean' }>,
): boolean {
  if (matcher !== 'toHaveBeenCalledWith' && matcher !== 'toHaveBeenLastCalledWith') return false;
  return call.arguments.some((argument) =>
    objectContainsBooleanPath(argument, expectation.path, expectation.value),
  );
}

function callbackEventPathVerification(
  call: ts.CallExpression,
  matcher: string,
  expectation: Extract<BehaviorExpectation, { type: 'callback-event-path' }>,
): boolean {
  if (matcher !== 'toHaveBeenCalledWith' && matcher !== 'toHaveBeenLastCalledWith') return false;
  return call.arguments.some((argument) => objectContainsPath(argument, expectation.path));
}

function verificationPositions(
  testBody: ts.Node,
  behavior: BehaviorContract,
  callbackVariable: string,
): number[] {
  const positions: number[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      const chain = inspectExpectChain(node.expression.expression);

      if (chain.target === callbackVariable) {
        let sufficient = false;
        if (behavior.expectation.type === 'callback-not-called') {
          sufficient = callbackSuppressionVerification(node, matcher, chain);
        } else if (behavior.expectation.type === 'callback-event-boolean') {
          sufficient = callbackEventBooleanVerification(node, matcher, behavior.expectation);
        } else {
          sufficient = callbackEventPathVerification(node, matcher, behavior.expectation);
        }

        if (sufficient) positions.push(node.getStart());
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return positions;
}

function conditionText(behavior: BehaviorContract): string {
  return behavior.condition.value === 'bound'
    ? `${behavior.condition.prop} is bound`
    : `${behavior.condition.prop}=${behavior.condition.value}`;
}

function suggestedAssertion(behavior: BehaviorContract, callbackVariable: string): string {
  if (behavior.expectation.type === 'callback-not-called') {
    return `expect(${callbackVariable}).not.toHaveBeenCalled();`;
  }

  const [first, second] = behavior.expectation.path;
  if (behavior.expectation.type === 'callback-event-boolean' && first && second) {
    return `expect(${callbackVariable}).toHaveBeenCalledWith(expect.objectContaining({ ${first}: expect.objectContaining({ ${second}: ${behavior.expectation.value} }) }));`;
  }

  if (first && second) {
    return `expect(${callbackVariable}).toHaveBeenCalledWith(expect.objectContaining({ ${first}: expect.objectContaining({ ${second}: <expected> }) }));`;
  }

  return `Verify ${callbackVariable} asserts ${behavior.expectation.path.join('.')} on the callback event.`;
}

function verificationReason(behavior: BehaviorContract): string {
  if (behavior.expectation.type === 'callback-not-called') {
    return 'The behavior is exercised and callback suppression is explicitly asserted after the interaction.';
  }
  if (behavior.expectation.type === 'callback-event-boolean') {
    return `The behavior is exercised and ${behavior.expectation.path.join('.')}=${behavior.expectation.value} is explicitly asserted on the callback event.`;
  }
  return `The behavior is exercised and ${behavior.expectation.path.join('.')} is explicitly asserted on the callback event.`;
}

function exercisedReason(behavior: BehaviorContract, callbackVariable: string): string {
  if (behavior.expectation.type === 'callback-not-called') {
    return `The test renders ${conditionText(behavior)} and exercises ${behavior.event.eventName}, but never verifies that ${callbackVariable} was suppressed.`;
  }
  if (behavior.expectation.type === 'callback-event-boolean') {
    return `The test renders ${conditionText(behavior)} and exercises ${behavior.event.eventName}, but never verifies ${behavior.expectation.path.join('.')}=${behavior.expectation.value} on ${callbackVariable}.`;
  }
  return `The test renders ${conditionText(behavior)} and exercises ${behavior.event.eventName}, but never verifies ${behavior.expectation.path.join('.')} on ${callbackVariable}.`;
}

function resultForTestCase(testCase: TestCase, behavior: BehaviorContract): BehaviorResult | undefined {
  const binding = findRenderBinding(testCase.body, behavior);
  if (!binding) return undefined;

  const interactions = interactionPositions(testCase.body, behavior.event.eventName)
    .filter((position) => position > binding.renderPosition)
    .sort((a, b) => a - b);

  if (interactions.length === 0) {
    return {
      behavior,
      status: 'discovered',
      testName: testCase.name,
      callbackVariable: binding.callbackVariable,
      reason: `The test renders ${conditionText(behavior)} but does not exercise the ${behavior.event.eventName} interaction.`,
    };
  }

  const firstInteraction = interactions[0]!;
  const verifications = verificationPositions(testCase.body, behavior, binding.callbackVariable).filter(
    (position) => position > firstInteraction,
  );

  if (verifications.length > 0) {
    return {
      behavior,
      status: 'verified',
      testName: testCase.name,
      callbackVariable: binding.callbackVariable,
      reason: verificationReason(behavior),
    };
  }

  return {
    behavior,
    status: 'exercised',
    testName: testCase.name,
    callbackVariable: binding.callbackVariable,
    reason: exercisedReason(behavior, binding.callbackVariable),
    suggestedAssertion: suggestedAssertion(behavior, binding.callbackVariable),
  };
}

const statusRank: Record<BehaviorStatus, number> = {
  discovered: 0,
  exercised: 1,
  verified: 2,
};

function resultForBehavior(testCases: TestCase[], behavior: BehaviorContract): BehaviorResult {
  let strongest: BehaviorResult | undefined;

  for (const testCase of testCases) {
    const candidate = resultForTestCase(testCase, behavior);
    if (!candidate) continue;

    if (!strongest || statusRank[candidate.status] > statusRank[strongest.status]) {
      strongest = candidate;
    }

    if (strongest.status === 'verified') break;
  }

  return (
    strongest ?? {
      behavior,
      status: 'discovered',
      reason: `No test establishes ${behavior.componentName} with ${conditionText(behavior)} and a resolvable ${behavior.expectation.callbackProp} callback.`,
    }
  );
}

export function analyzeTestsAgainstBehaviors(
  testSource: string,
  behaviors: BehaviorContract[],
  fileName = 'component.test.tsx',
): BehaviorResult[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    testSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const testCases = collectTestCases(sourceFile);
  return behaviors.map((behavior) => resultForBehavior(testCases, behavior));
}
