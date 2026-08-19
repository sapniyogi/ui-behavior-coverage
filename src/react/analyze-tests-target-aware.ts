import ts from 'typescript';
import type { BehaviorContract, BehaviorResult, BehaviorStatus } from '../core/model';
import { analyzeTestsAgainstBehaviors as analyzeTestsByEventName } from './analyze-tests';
import {
  collectQueryBindings,
  queryTargetCorrelates,
  queryTargetFromExpression,
} from './test-target';

interface ParsedTestCase {
  body: ts.Node;
  sourceStart: number;
  sourceText: string;
}

interface MaskedTestCase {
  maskedCount: number;
  sourceText: string;
}

function isTestCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && (node.expression.text === 'it' || node.expression.text === 'test');
}

function collectTestCases(sourceFile: ts.SourceFile): ParsedTestCase[] {
  const cases: ParsedTestCase[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCall(node)) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        cases.push({
          body: callback.body,
          sourceStart: node.getStart(sourceFile),
          sourceText: node.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return cases;
}

function nativeRolesFromEvidence(behavior: BehaviorContract): readonly string[] | undefined {
  const snippet = behavior.evidence.snippet.trim();
  if (/^<button\b/i.test(snippet)) return ['button'];
  if (/^<textarea\b/i.test(snippet)) return ['textbox'];
  if (/^<option\b/i.test(snippet)) return ['option'];

  if (/^<select\b/i.test(snippet)) {
    if (/\bmultiple\b/i.test(snippet) || /\bsize\s*=/i.test(snippet)) return undefined;
    return ['combobox'];
  }

  if (/^<input\b/i.test(snippet)) {
    const type = snippet.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (type === 'checkbox') return ['checkbox'];
    if (type === 'radio') return ['radio'];
    if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return ['button'];
    if (type === 'search') return ['searchbox'];
    if (type === 'number') return ['spinbutton'];
    if (type === 'range') return ['slider'];
    if (!type || type === 'text' || type === 'email' || type === 'tel' || type === 'url') return ['textbox'];
  }
  return undefined;
}

function expectedTargetRoles(behavior: BehaviorContract): readonly string[] | undefined {
  switch (behavior.kind) {
    case 'native-disabled-event-suppression':
      return nativeRolesFromEvidence(behavior);
    case 'mui-button-disabled-event-suppression':
    case 'mui-button-loading-event-suppression':
      return ['button', 'link'];
    case 'mui-checkbox-disabled-change-suppression':
    case 'mui-checkbox-checked-toggle':
    case 'mui-switch-disabled-change-suppression':
    case 'mui-switch-checked-toggle':
      return ['checkbox', 'switch'];
    case 'mui-radio-disabled-change-suppression':
    case 'mui-radio-checked-select':
      return ['radio'];
    case 'mui-text-field-value-change':
      return ['textbox', 'searchbox', 'spinbutton'];
    case 'mui-select-native-value-change':
      return ['combobox', 'listbox'];
  }
}

function containsComponent(root: ts.Node, componentName: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === componentName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function firstMatchingRenderPosition(testBody: ts.Node, behavior: BehaviorContract): number {
  let position = -1;

  const visit = (node: ts.Node): void => {
    if (position >= 0) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render' &&
      node.arguments[0] &&
      containsComponent(node.arguments[0], behavior.componentName)
    ) {
      position = node.getStart();
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return position;
}

function targetIsCorrelated(
  node: ts.CallExpression,
  behavior: BehaviorContract,
  bindings: ReturnType<typeof collectQueryBindings>,
): boolean {
  const query = queryTargetFromExpression(node.arguments[0], bindings);
  if (behavior.target) return queryTargetCorrelates(query, behavior.target);

  // Compatibility fallback for contracts created by external/custom providers
  // that do not yet carry production target metadata.
  const expectedRoles = expectedTargetRoles(behavior);
  if (!expectedRoles) return true;
  return !!query?.role && expectedRoles.includes(query.role);
}

function maskUncorrelatedInteractions(
  testCase: ParsedTestCase,
  behavior: BehaviorContract,
): MaskedTestCase {
  const bindings = collectQueryBindings(testCase.body);
  const renderPosition = firstMatchingRenderPosition(testCase.body, behavior);
  if (renderPosition < 0) return { maskedCount: 0, sourceText: testCase.sourceText };

  const replacements: Array<{ end: number; start: number }> = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === behavior.event.eventName &&
      node.getStart() > renderPosition &&
      !targetIsCorrelated(node, behavior, bindings)
    ) {
      replacements.push({
        start: node.expression.name.getStart() - testCase.sourceStart,
        end: node.expression.name.getEnd() - testCase.sourceStart,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(testCase.body);
  if (replacements.length === 0) return { maskedCount: 0, sourceText: testCase.sourceText };

  let sourceText = testCase.sourceText;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    sourceText = `${sourceText.slice(0, replacement.start)}__ubc_uncorrelated_${behavior.event.eventName}${sourceText.slice(replacement.end)}`;
  }

  return { maskedCount: replacements.length, sourceText };
}

function uncorrelatedTargetResult(
  result: BehaviorResult,
  behavior: BehaviorContract,
  original: BehaviorResult,
): BehaviorResult {
  return {
    ...result,
    behavior,
    status: 'exercised',
    testName: result.testName ?? original.testName,
    callbackVariable: result.callbackVariable ?? original.callbackVariable,
    reason: `The test reaches the behavior condition and performs ${behavior.event.eventName}, but the interaction target cannot be positively correlated with the contract element; verification is withheld.`,
  };
}

const statusRank: Record<BehaviorStatus, number> = {
  discovered: 0,
  exercised: 1,
  verified: 2,
};

function strongestTargetAwareResult(
  behavior: BehaviorContract,
  testCases: ParsedTestCase[],
  fileName: string,
  fullTestSource: string,
): BehaviorResult {
  let strongest: BehaviorResult | undefined;

  for (const testCase of testCases) {
    const masked = maskUncorrelatedInteractions(testCase, behavior);
    const candidate = analyzeTestsByEventName(masked.sourceText, [behavior], fileName)[0];
    const original = masked.maskedCount > 0
      ? analyzeTestsByEventName(testCase.sourceText, [behavior], fileName)[0]
      : candidate;

    if (!candidate || !original) continue;

    const targetAware =
      masked.maskedCount > 0 &&
      candidate.status === 'discovered' &&
      statusRank[original.status] > statusRank[candidate.status]
        ? uncorrelatedTargetResult(candidate, behavior, original)
        : {
            ...candidate,
            testName: candidate.testName ?? original.testName,
            callbackVariable: candidate.callbackVariable ?? original.callbackVariable,
          };

    if (!targetAware.testName) continue;

    if (!strongest || statusRank[targetAware.status] > statusRank[strongest.status]) {
      strongest = targetAware;
    }

    if (strongest.status === 'verified') break;
  }

  if (strongest) return strongest;

  const fallback = analyzeTestsByEventName(fullTestSource, [behavior], fileName)[0]!;
  return testCases.length === 0 || fallback.status === 'discovered'
    ? fallback
    : {
        ...fallback,
        status: 'discovered',
        reason: 'No individual test case provided target-correlated interaction evidence for this behavior.',
      };
}

/**
 * Conservative target-correlation layer on top of the callback analyzer. An
 * interaction can contribute to VERIFIED only when its Testing Library target
 * is positively correlated to the production element governed by the contract.
 * Ambiguous or unrelated interactions are masked before event/oracle analysis.
 */
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

  return behaviors.map((behavior) =>
    strongestTargetAwareResult(behavior, testCases, fileName, testSource),
  );
}
