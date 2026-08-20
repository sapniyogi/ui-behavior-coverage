import ts from 'typescript';
import type { RenderStateBehaviorContract } from '../core/model';
import {
  findRenderEvidence,
  type RenderEvidence,
  type TestEnvironment,
} from './semantic-test-environment';

interface LocalWrapper {
  body: ts.Node;
}

interface MatchSummary {
  total: number;
  unsafe: number;
}

function containingStatement(node: ts.Node, container: ts.Block | ts.SourceFile): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current && current.parent !== container) current = current.parent;
  return current && ts.isStatement(current) ? current : undefined;
}

function wrapperFromFunction(
  fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): LocalWrapper | undefined {
  return fn.body ? { body: fn.body } : undefined;
}

function wrapperFromVariableStatement(
  statement: ts.VariableStatement,
  name: string,
): LocalWrapper | undefined {
  for (const declaration of statement.declarationList.declarations) {
    if (
      !ts.isIdentifier(declaration.name) ||
      declaration.name.text !== name ||
      !declaration.initializer ||
      (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))
    ) continue;
    return wrapperFromFunction(declaration.initializer);
  }
  return undefined;
}

function localWrapper(anchor: ts.Node, name: string): LocalWrapper | undefined {
  let child: ts.Node = anchor;
  let parent: ts.Node | undefined = anchor.parent;

  while (parent) {
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      for (const statement of parent.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
          const wrapper = wrapperFromFunction(statement);
          if (wrapper) return wrapper;
        }
      }

      const boundary = containingStatement(child, parent);
      for (const statement of parent.statements) {
        if (boundary && statement === boundary) break;
        if (!ts.isVariableStatement(statement)) continue;
        const wrapper = wrapperFromVariableStatement(statement, name);
        if (wrapper) return wrapper;
      }
    }
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

function logicalControlFlow(node: ts.Node): boolean {
  return ts.isBinaryExpression(node) && [
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ].includes(node.operatorToken.kind);
}

/**
 * Count every syntactic occurrence, but mark occurrences as unsafe when reaching
 * them requires evaluating a conditional branch or invoking a nested callback.
 */
function summarizeMatches(root: ts.Node, componentName: string): MatchSummary {
  let total = 0;
  let unsafe = 0;

  const visit = (node: ts.Node, unsafePath: boolean, isRoot: boolean): void => {
    const boundaryUnsafe = unsafePath ||
      ts.isConditionalExpression(node) ||
      ts.isIfStatement(node) ||
      logicalControlFlow(node) ||
      (!isRoot && (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ));

    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === componentName
    ) {
      total += 1;
      if (boundaryUnsafe) unsafe += 1;
    }

    ts.forEachChild(node, (child) => visit(child, boundaryUnsafe, false));
  };

  visit(root, false, true);
  return { total, unsafe };
}

function renderCallAt(testBody: ts.Node, position: number): ts.CallExpression | undefined {
  let result: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      node.getStart() === position &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render'
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return result;
}

function renderedOpeningElement(expression: ts.Expression): ts.JsxOpeningLikeElement | undefined {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  if (ts.isJsxSelfClosingElement(current)) return current;
  return ts.isJsxElement(current) ? current.openingElement : undefined;
}

function evidenceIsReachable(
  testBody: ts.Node,
  behavior: RenderStateBehaviorContract,
  evidence: RenderEvidence,
): boolean {
  const renderCall = renderCallAt(testBody, evidence.position);
  const rendered = renderCall?.arguments[0];
  if (!renderCall || !rendered) return false;

  const direct = summarizeMatches(rendered, behavior.componentName);
  if (direct.total > 0) {
    return direct.total === 1 && direct.unsafe === 0;
  }

  const invocation = renderedOpeningElement(rendered);
  if (!invocation || !ts.isIdentifier(invocation.tagName)) return false;
  const wrapper = localWrapper(invocation, invocation.tagName.text);
  if (!wrapper) return false;
  const throughWrapper = summarizeMatches(wrapper.body, behavior.componentName);
  return throughWrapper.total === 1 && throughWrapper.unsafe === 0;
}

/**
 * Keep the existing prop-resolution semantics, but veto evidence whose matching
 * component is ambiguous or lives on control flow that the static analyzer has
 * not proven will execute. Conservative rejection yields DISCOVERED instead of
 * an S4 false VERIFIED.
 */
export function findSafeRenderEvidence(
  testBody: ts.Node,
  behavior: RenderStateBehaviorContract,
  seed?: TestEnvironment,
): RenderEvidence | undefined {
  const evidence = findRenderEvidence(testBody, behavior, seed);
  if (!evidence) return undefined;
  return evidenceIsReachable(testBody, behavior, evidence) ? evidence : undefined;
}
