import ts from 'typescript';
import type {
  BehaviorResult,
  BehaviorStatus,
  RenderStateBehaviorContract,
} from '../core/model';
import { dedupeBehaviorContracts } from '../core/behavior-identity';
import {
  collectLexicalTestEnvironment,
  type RenderEvidence,
  type TestEnvironment,
} from './semantic-test-environment';
import { findSafeRenderEvidence } from './safe-render-evidence';
import { findVerificationPosition } from './semantic-test-assertions';

interface TestCase {
  name: string;
  body: ts.Node;
  environment: TestEnvironment;
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
          environment: collectLexicalTestEnvironment(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function conditionText(behavior: RenderStateBehaviorContract): string {
  return `${behavior.condition.prop}=${String(behavior.condition.value)}`;
}

function expectationText(
  behavior: RenderStateBehaviorContract,
  evidence?: RenderEvidence,
): string {
  const expectation = behavior.expectation;
  if (expectation.type === 'element-boolean-state') {
    return `${expectation.state}=${expectation.value}`;
  }
  if (expectation.type === 'element-value-state') {
    return `value=${String(evidence?.expectedValue ?? '<bound>')}`;
  }
  if (expectation.type === 'element-visibility-state') {
    return `visible=${expectation.visible}`;
  }
  if (expectation.type === 'element-attribute-state') {
    return `${expectation.attribute}=${String(evidence?.expectedValue ?? '<bound>')}`;
  }
  return `${expectation.state}=${String(evidence?.expectedValue ?? '<form value>')}`;
}

function suggestion(behavior: RenderStateBehaviorContract): string {
  const expectation = behavior.expectation;
  if (expectation.type === 'element-boolean-state') {
    if (expectation.state === 'disabled') {
      return expectation.value
        ? 'expect(<element>).toBeDisabled();'
        : 'expect(<element>).toBeEnabled();';
    }
    return expectation.value
      ? 'expect(<element>).toBeChecked();'
      : 'expect(<element>).not.toBeChecked();';
  }
  if (expectation.type === 'element-value-state') {
    return 'expect(<element>).toHaveValue(<rendered value>);';
  }
  if (expectation.type === 'element-visibility-state') {
    return expectation.visible
      ? 'expect(<element>).toBeVisible();'
      : 'expect(<element>).not.toBeVisible();';
  }
  if (expectation.type === 'element-attribute-state') {
    return `expect(<element>).toHaveAttribute('${expectation.attribute}', <rendered value>);`;
  }
  return expectation.state === 'checked'
    ? 'expect(<element>).toBeChecked();'
    : 'expect(<element>).toHaveValue(<form value>);';
}

function resultForTest(
  testCase: TestCase,
  behavior: RenderStateBehaviorContract,
): BehaviorResult | undefined {
  const rendered = findSafeRenderEvidence(testCase.body, behavior, testCase.environment);
  if (!rendered) return undefined;

  const verifiedAt = findVerificationPosition(
    testCase.body,
    behavior,
    rendered,
    testCase.environment,
  );
  if (verifiedAt !== undefined) {
    return {
      behavior,
      status: 'verified',
      testName: testCase.name,
      reason: `The test reaches ${conditionText(behavior)} and explicitly verifies ${expectationText(behavior, rendered)} on the correlated contract element.`,
    };
  }

  return {
    behavior,
    status: 'exercised',
    testName: testCase.name,
    reason: `The test reaches ${conditionText(behavior)}, but never explicitly verifies ${expectationText(behavior, rendered)} on the correlated contract element.`,
    suggestedAssertion: suggestion(behavior),
  };
}

const rank: Record<BehaviorStatus, number> = {
  discovered: 0,
  exercised: 1,
  verified: 2,
};

export function analyzeRenderStateTests(
  testSource: string,
  behaviors: RenderStateBehaviorContract[],
  fileName = 'component.test.tsx',
): BehaviorResult[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    testSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tests = collectTestCases(sourceFile);
  const distinctBehaviors = dedupeBehaviorContracts(behaviors);

  return distinctBehaviors.map((behavior) => {
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
      reason: `No test reaches ${behavior.componentName} with ${conditionText(behavior)} in a control-flow-safe, resolvable form.`,
    };
  });
}
