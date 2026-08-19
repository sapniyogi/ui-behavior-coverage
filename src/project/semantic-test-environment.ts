import ts from 'typescript';
import type { RenderStateBehaviorContract, SemanticPrimitive } from '../core/model';

export type ResolvedValue =
  | { known: true; value: SemanticPrimitive }
  | { known: false };

export interface TestEnvironment {
  objects: Map<string, ts.ObjectLiteralExpression>;
  values: Map<string, SemanticPrimitive>;
}

export interface RenderEvidence {
  position: number;
  expectedValue?: SemanticPrimitive;
}

const unknown: ResolvedValue = { known: false };

type PropPresence =
  | { kind: 'absent' }
  | { kind: 'known'; value: SemanticPrimitive }
  | { kind: 'unknown' };

export function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

export function primitiveValue(
  expression: ts.Expression | undefined,
  values: Map<string, SemanticPrimitive>,
): ResolvedValue {
  if (!expression) return unknown;
  const current = unwrapExpression(expression);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (current.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  if (ts.isStringLiteralLike(current)) return { known: true, value: current.text };
  if (ts.isNumericLiteral(current)) return { known: true, value: Number(current.text) };
  if (
    ts.isPrefixUnaryExpression(current) &&
    current.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(current.operand)
  ) return { known: true, value: -Number(current.operand.text) };
  if (ts.isIdentifier(current) && values.has(current.text)) {
    return { known: true, value: values.get(current.text)! };
  }
  return unknown;
}

function cloneEnvironment(seed?: TestEnvironment): TestEnvironment {
  return {
    objects: new Map(seed?.objects ?? []),
    values: new Map(seed?.values ?? []),
  };
}

function applyVariableDeclaration(
  declaration: ts.VariableDeclaration,
  env: TestEnvironment,
): void {
  if (!ts.isIdentifier(declaration.name)) return;
  const name = declaration.name.text;
  if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
    env.objects.set(name, declaration.initializer);
  }
  const primitive = primitiveValue(declaration.initializer, env.values);
  if (primitive.known) env.values.set(name, primitive.value);
}

function applyVariableStatement(
  statement: ts.VariableStatement,
  env: TestEnvironment,
): void {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) !== ts.NodeFlags.Const) return;
  for (const declaration of statement.declarationList.declarations) {
    applyVariableDeclaration(declaration, env);
  }
}

export function collectTestEnvironment(
  root: ts.Node,
  seed?: TestEnvironment,
): TestEnvironment {
  const env = cloneEnvironment(seed);
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) === ts.NodeFlags.Const
    ) declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  for (const declaration of declarations) applyVariableDeclaration(declaration, env);
  return env;
}

function containingStatement(node: ts.Node, container: ts.Block | ts.SourceFile): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current && current.parent !== container) current = current.parent;
  return current && ts.isStatement(current) ? current : undefined;
}

/**
 * Collects only constants that are lexically visible to a test call.
 * This captures top-level and describe-block fixtures such as `defaultProps`
 * without leaking constants from sibling tests into one another.
 */
export function collectLexicalTestEnvironment(testCall: ts.CallExpression): TestEnvironment {
  const containers: Array<{ container: ts.Block | ts.SourceFile; child: ts.Node }> = [];
  let child: ts.Node = testCall;
  let parent: ts.Node | undefined = testCall.parent;

  while (parent) {
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      containers.push({ container: parent, child });
    }
    child = parent;
    parent = parent.parent;
  }

  containers.reverse();
  const env = cloneEnvironment();
  for (const { container, child: nestedChild } of containers) {
    const boundary = containingStatement(nestedChild, container);
    for (const statement of container.statements) {
      if (boundary && statement === boundary) break;
      if (ts.isVariableStatement(statement)) applyVariableStatement(statement, env);
    }
  }
  return env;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

export function objectValue(
  object: ts.ObjectLiteralExpression,
  name: string,
  env: TestEnvironment,
): ResolvedValue {
  let result: ResolvedValue = unknown;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isIdentifier(property.expression)) return unknown;
      const nested = env.objects.get(property.expression.text);
      if (!nested) return unknown;
      const nestedValue = objectValue(nested, name, env);
      if (nestedValue.known) result = nestedValue;
      continue;
    }
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      result = primitiveValue(property.initializer, env.values);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      const value = env.values.get(property.name.text);
      result = value === undefined ? unknown : { known: true, value };
    }
  }
  return result;
}

function jsxValue(attribute: ts.JsxAttribute, env: TestEnvironment): ResolvedValue {
  if (!attribute.initializer) return { known: true, value: true };
  if (ts.isStringLiteral(attribute.initializer)) return { known: true, value: attribute.initializer.text };
  if (!ts.isJsxExpression(attribute.initializer)) return unknown;
  return primitiveValue(attribute.initializer.expression, env.values);
}

export function resolveRenderedProp(
  element: ts.JsxOpeningLikeElement,
  prop: string,
  env: TestEnvironment,
): ResolvedValue {
  let resolved: ResolvedValue = unknown;
  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (!ts.isIdentifier(property.expression)) {
        resolved = unknown;
        continue;
      }
      const object = env.objects.get(property.expression.text);
      if (!object) {
        resolved = unknown;
        continue;
      }
      const value = objectValue(object, prop, env);
      if (value.known) resolved = value;
      continue;
    }
    if (
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === prop
    ) resolved = jsxValue(property, env);
  }
  return resolved;
}

function jsxPropPresence(
  element: ts.JsxOpeningLikeElement,
  prop: string,
  env: TestEnvironment,
): PropPresence {
  let result: PropPresence = { kind: 'absent' };
  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (!ts.isIdentifier(property.expression)) {
        result = { kind: 'unknown' };
        continue;
      }
      const object = env.objects.get(property.expression.text);
      if (!object) {
        result = { kind: 'unknown' };
        continue;
      }
      const value = objectValue(object, prop, env);
      result = value.known
        ? { kind: 'known', value: value.value }
        : { kind: 'unknown' };
      continue;
    }
    if (
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === prop
    ) {
      const value = jsxValue(property, env);
      result = value.known
        ? { kind: 'known', value: value.value }
        : { kind: 'unknown' };
    }
  }
  return result;
}

function matchingElement(root: ts.Node, componentName: string): ts.JsxOpeningLikeElement | undefined {
  let match: ts.JsxOpeningLikeElement | undefined;
  const visit = (node: ts.Node): void => {
    if (match) return;
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === componentName
    ) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return match;
}

function renderedOpeningElement(expression: ts.Expression): ts.JsxOpeningLikeElement | undefined {
  const current = unwrapExpression(expression);
  if (ts.isJsxSelfClosingElement(current)) return current;
  return ts.isJsxElement(current) ? current.openingElement : undefined;
}

interface LocalWrapper {
  body: ts.Node;
  propsParameter?: string;
}

function localWrapper(
  sourceFile: ts.SourceFile,
  name: string,
): LocalWrapper | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body) {
      const parameter = statement.parameters[0];
      return {
        body: statement.body,
        propsParameter: parameter && ts.isIdentifier(parameter.name)
          ? parameter.name.text
          : undefined,
      };
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== name ||
        !declaration.initializer ||
        (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))
      ) continue;
      const parameter = declaration.initializer.parameters[0];
      return {
        body: declaration.initializer.body,
        propsParameter: parameter && ts.isIdentifier(parameter.name)
          ? parameter.name.text
          : undefined,
      };
    }
  }
  return undefined;
}

function resolveWrappedProp(
  element: ts.JsxOpeningLikeElement,
  prop: string,
  env: TestEnvironment,
  wrapperInvocation: ts.JsxOpeningLikeElement,
  propsParameter?: string,
): ResolvedValue {
  let resolved: ResolvedValue = unknown;
  for (const property of element.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      if (
        propsParameter &&
        ts.isIdentifier(property.expression) &&
        property.expression.text === propsParameter
      ) {
        const outer = jsxPropPresence(wrapperInvocation, prop, env);
        if (outer.kind === 'known') resolved = { known: true, value: outer.value };
        else if (outer.kind === 'unknown') resolved = unknown;
        continue;
      }
      if (!ts.isIdentifier(property.expression)) {
        resolved = unknown;
        continue;
      }
      const object = env.objects.get(property.expression.text);
      if (!object) {
        resolved = unknown;
        continue;
      }
      const value = objectValue(object, prop, env);
      if (value.known) resolved = value;
      continue;
    }
    if (
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === prop
    ) resolved = jsxValue(property, env);
  }
  return resolved;
}

interface WrappedElementMatch {
  element: ts.JsxOpeningLikeElement;
  condition: ResolvedValue;
}

function matchingElementThroughLocalWrapper(
  renderedExpression: ts.Expression,
  componentName: string,
  conditionProp: string,
  env: TestEnvironment,
): WrappedElementMatch | undefined {
  const invocation = renderedOpeningElement(renderedExpression);
  if (!invocation || !ts.isIdentifier(invocation.tagName)) return undefined;
  const wrapper = localWrapper(renderedExpression.getSourceFile(), invocation.tagName.text);
  if (!wrapper) return undefined;
  const element = matchingElement(wrapper.body, componentName);
  if (!element) return undefined;
  return {
    element,
    condition: resolveWrappedProp(
      element,
      conditionProp,
      env,
      invocation,
      wrapper.propsParameter,
    ),
  };
}

function containerObject(
  attribute: ts.JsxAttribute,
  env: TestEnvironment,
): ts.ObjectLiteralExpression | undefined {
  if (
    !attribute.initializer ||
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression
  ) return undefined;
  const current = unwrapExpression(attribute.initializer.expression);
  if (ts.isObjectLiteralExpression(current)) return current;
  return ts.isIdentifier(current) ? env.objects.get(current.text) : undefined;
}

function findFormValue(
  root: ts.Node,
  fieldName: string,
  containers: readonly string[],
  env: TestEnvironment,
): ResolvedValue {
  let result: ResolvedValue = unknown;
  const visit = (node: ts.Node): void => {
    if (result.known) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const property of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(property) ||
          !ts.isIdentifier(property.name) ||
          !containers.includes(property.name.text)
        ) continue;
        const object = containerObject(property, env);
        if (!object) continue;
        const value = objectValue(object, fieldName, env);
        if (value.known) {
          result = value;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

function conditionMatches(value: ResolvedValue, expected: boolean | 'bound'): boolean {
  if (!value.known) return false;
  return expected === 'bound' ? true : value.value === expected;
}

export function findRenderEvidence(
  testBody: ts.Node,
  behavior: RenderStateBehaviorContract,
  seed?: TestEnvironment,
): RenderEvidence | undefined {
  const env = collectTestEnvironment(testBody, seed);
  let result: RenderEvidence | undefined;
  const visit = (node: ts.Node): void => {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render' &&
      node.arguments[0]
    ) {
      const element = matchingElement(node.arguments[0], behavior.componentName);
      const wrapped = element
        ? undefined
        : matchingElementThroughLocalWrapper(
            node.arguments[0],
            behavior.componentName,
            behavior.condition.prop,
            env,
          );
      const matchedElement = element ?? wrapped?.element;
      const condition = element
        ? resolveRenderedProp(element, behavior.condition.prop, env)
        : wrapped?.condition ?? unknown;
      if (matchedElement && conditionMatches(condition, behavior.condition.value)) {
        if (behavior.expectation.type === 'form-controlled-state') {
          if (condition.known && typeof condition.value === 'string') {
            const formValue = findFormValue(
              node.arguments[0],
              condition.value,
              behavior.expectation.containers,
              env,
            );
            if (formValue.known) result = { position: node.getStart(), expectedValue: formValue.value };
          }
        } else {
          result = {
            position: node.getStart(),
            expectedValue: behavior.condition.value === 'bound' && condition.known
              ? condition.value
              : undefined,
          };
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(testBody);
  return result;
}
