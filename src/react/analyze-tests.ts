import ts from 'typescript';
import type { BehaviorContract, BehaviorResult } from '../core/model';

interface RenderBinding {
  callbackVariable: string;
  renderPosition: number;
}

interface TestCase {
  name: string;
  body: ts.Node;
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

function getJsxAttribute(
  element: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function attributeIsTrue(attribute: ts.JsxAttribute | undefined): boolean {
  if (!attribute) return false;
  if (!attribute.initializer) return true;
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return false;
  return attribute.initializer.expression.kind === ts.SyntaxKind.TrueKeyword;
}

function identifierAttribute(attribute: ts.JsxAttribute | undefined): string | undefined {
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) return undefined;
  const expression = attribute.initializer.expression;
  return expression && ts.isIdentifier(expression) ? expression.text : undefined;
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
        const condition = getJsxAttribute(component, behavior.condition.prop);
        const callback = getJsxAttribute(component, behavior.expectation.callbackProp);
        const callbackVariable = identifierAttribute(callback);

        if (attributeIsTrue(condition) && callbackVariable) {
          binding = {
            callbackVariable,
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

function resultForBehavior(testCases: TestCase[], behavior: BehaviorContract): BehaviorResult {
  for (const testCase of testCases) {
    const binding = findRenderBinding(testCase.body, behavior);
    if (!binding) continue;

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
        reason: `The behavior is exercised and the callback suppression is explicitly asserted after the interaction.`,
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

  return {
    behavior,
    status: 'discovered',
    reason: `No test renders ${behavior.componentName} with ${behavior.condition.prop}=true and a directly bound ${behavior.expectation.callbackProp} callback.`,
  };
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
