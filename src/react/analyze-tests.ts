import ts from 'typescript';
import type { BehaviorContract, BehaviorResult, BehaviorStatus } from '../core/model';

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
  return { kind: 'unknown' };
}

function jsxAttributeValue(attribute: ts.JsxAttribute): ResolvedValue {
  if (!attribute.initializer) return { kind: 'true' };
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
      // Nested object spreads are deliberately not resolved yet. If a later spread
      // could override a target property, mark that property's value unknown.
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
        // An unresolved spread may overwrite either property, so remain conservative.
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

    if (!ts.isIdentifier(property.name)) continue;

    if (property.name.text === behavior.condition.prop) {
      condition = jsxAttributeValue(property);
    } else if (property.name.text === behavior.expectation.callbackProp) {
      callback = jsxAttributeValue(property);
    }
  }

  return { condition, callback };
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

        if (props.condition?.kind === 'true' && props.callback?.kind === 'identifier') {
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

function verificationPositions(testBody: ts.Node, callbackVariable: string): number[] {
  const positions: number[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      const chain = inspectExpectChain(node.expression.expression);

      if (chain.target === callbackVariable) {
        const negativeCalled = matcher === 'toHaveBeenCalled' && chain.negated;
        const zeroCalls = matcher === 'toHaveBeenCalledTimes' && isZeroLiteral(node.arguments[0]);

        if (negativeCalled || zeroCalls) positions.push(node.getStart());
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return positions;
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
      reason: `The test renders ${behavior.condition.prop}=true but does not exercise the ${behavior.event.eventName} interaction.`,
    };
  }

  const firstInteraction = interactions[0]!;
  const verifications = verificationPositions(testCase.body, binding.callbackVariable).filter(
    (position) => position > firstInteraction,
  );

  if (verifications.length > 0) {
    return {
      behavior,
      status: 'verified',
      testName: testCase.name,
      callbackVariable: binding.callbackVariable,
      reason: 'The behavior is exercised and the callback suppression is explicitly asserted after the interaction.',
    };
  }

  return {
    behavior,
    status: 'exercised',
    testName: testCase.name,
    callbackVariable: binding.callbackVariable,
    reason: `The test renders ${behavior.condition.prop}=true and exercises ${behavior.event.eventName}, but never verifies that ${binding.callbackVariable} was suppressed.`,
    suggestedAssertion: `expect(${binding.callbackVariable}).not.toHaveBeenCalled();`,
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
      reason: `No test establishes ${behavior.componentName} with ${behavior.condition.prop}=true and a resolvable ${behavior.expectation.callbackProp} callback.`,
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
