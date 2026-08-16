import ts from 'typescript';
import type { BehaviorContract, BehaviorResult, BehaviorStatus } from '../core/model';
import { analyzeTestsAgainstBehaviors as analyzeTestsByEventName } from './analyze-tests';

interface ParsedTestCase {
  name: string;
  body: ts.Node;
  sourceText: string;
}

const roleQueryNames = new Set([
  'getByRole',
  'getAllByRole',
  'queryByRole',
  'queryAllByRole',
  'findByRole',
  'findAllByRole',
]);

function isTestCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && (node.expression.text === 'it' || node.expression.text === 'test');
}

function testName(node: ts.CallExpression): string {
  const first = node.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : '<anonymous test>';
}

function collectTestCases(sourceFile: ts.SourceFile): ParsedTestCase[] {
  const cases: ParsedTestCase[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCall(node)) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        cases.push({
          name: testName(node),
          body: callback.body,
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
    // `multiple` or `size` can change the implicit role. If either is present,
    // leave the target unconstrained unless a later rule resolves its value.
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
    // Password/file/hidden and uncommon input modes do not have one sufficiently
    // stable role for this precision gate, so unknown remains eligible.
  }
  return undefined;
}

function expectedTargetRoles(behavior: BehaviorContract): readonly string[] | undefined {
  switch (behavior.kind) {
    case 'native-disabled-event-suppression':
      return nativeRolesFromEvidence(behavior);
    case 'mui-button-disabled-event-suppression':
    case 'mui-button-loading-event-suppression':
      // MUI Button can render an anchor when link props are supplied.
      return ['button', 'link'];
    case 'mui-checkbox-disabled-change-suppression':
    case 'mui-checkbox-checked-toggle':
    case 'mui-switch-disabled-change-suppression':
    case 'mui-switch-checked-toggle':
      // `checkbox` is the default input role; an explicit ARIA switch role is
      // also compatible with the same checked-state interaction contract.
      return ['checkbox', 'switch'];
    case 'mui-radio-disabled-change-suppression':
    case 'mui-radio-checked-select':
      return ['radio'];
    case 'mui-text-field-value-change':
      // TextField may wrap text, search, or number inputs depending on `type`.
      return ['textbox', 'searchbox', 'spinbutton'];
    case 'mui-select-native-value-change':
      // Native Select is normally combobox; multi/size variants may be listbox.
      return ['combobox', 'listbox'];
  }
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function directQueryRole(expression: ts.Expression): string | undefined {
  const current = unwrapExpression(expression);

  if (ts.isElementAccessExpression(current)) {
    return directQueryRole(current.expression);
  }

  if (!ts.isCallExpression(current) || !current.arguments[0]) return undefined;

  const callee = current.expression;
  const queryName = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : undefined;

  if (!queryName || !roleQueryNames.has(queryName)) return undefined;
  const role = current.arguments[0];
  return ts.isStringLiteralLike(role) ? role.text : undefined;
}

function collectRoleBindings(root: ts.Node): Map<string, string> {
  const bindings = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const role = directQueryRole(node.initializer);
      if (role) bindings.set(node.name.text, role);
    }
    ts.forEachChild(node, visit);
  };

  visit(root);
  return bindings;
}

function targetRole(
  expression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, string>,
): string | undefined {
  if (!expression) return undefined;
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return bindings.get(current.text);
  return directQueryRole(current);
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

function hasTargetCompatibleInteraction(testBody: ts.Node, behavior: BehaviorContract): boolean {
  const expectedRoles = expectedTargetRoles(behavior);
  if (!expectedRoles) return true;

  const bindings = collectRoleBindings(testBody);
  const renderPosition = firstMatchingRenderPosition(testBody, behavior);
  let compatible = false;

  const visit = (node: ts.Node): void => {
    if (compatible) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === behavior.event.eventName &&
      node.getStart() > renderPosition
    ) {
      const knownRole = targetRole(node.arguments[0], bindings);
      if (!knownRole || expectedRoles.includes(knownRole)) {
        compatible = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(testBody);
  return compatible;
}

function incompatibleTargetResult(
  result: BehaviorResult,
  behavior: BehaviorContract,
): BehaviorResult {
  const roles = expectedTargetRoles(behavior);
  return {
    behavior,
    status: 'discovered',
    testName: result.testName,
    callbackVariable: result.callbackVariable,
    reason: roles
      ? `The test renders the behavior, but its ${behavior.event.eventName} interaction targets an explicitly incompatible Testing Library role; expected ${roles.join(' or ')} when the target role is known.`
      : result.reason,
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
    const candidate = analyzeTestsByEventName(testCase.sourceText, [behavior], fileName)[0];
    if (!candidate || !candidate.testName) continue;

    const targetAware =
      candidate.status !== 'discovered' && !hasTargetCompatibleInteraction(testCase.body, behavior)
        ? incompatibleTargetResult(candidate, behavior)
        : candidate;

    if (!strongest || statusRank[targetAware.status] > statusRank[strongest.status]) {
      strongest = targetAware;
    }

    if (strongest.status === 'verified') break;
  }

  return strongest ?? analyzeTestsByEventName(fullTestSource, [behavior], fileName)[0]!;
}

/**
 * Adds a conservative target-compatibility check on top of the existing callback
 * analyzer. Testing Library role evidence is used only to reject interactions
 * that are provably aimed at a different kind of element. Unknown targets remain
 * eligible so existing non-role query styles do not become false negatives.
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
