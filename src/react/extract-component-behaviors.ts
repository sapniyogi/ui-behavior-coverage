import ts from 'typescript';
import type { BehaviorContract, BehaviorExpectation } from '../core/model';
import { dedupeBehaviorContracts } from '../core/behavior-identity';
import { materialUiBehaviorProvider } from '../providers/material-ui';
import { materialUiCompositionProvider } from '../providers/material-ui-composition';
import { nativeHtmlBehaviorProvider } from '../providers/native-html';
import type { BehaviorProvider } from '../providers/types';
import { attachBehaviorTargets } from './behavior-target';

export const defaultBehaviorProviders: readonly BehaviorProvider[] = [
  nativeHtmlBehaviorProvider,
  materialUiBehaviorProvider,
  materialUiCompositionProvider,
];

const muiSuppressionKinds = new Set<BehaviorContract['kind']>([
  'mui-button-disabled-event-suppression',
  'mui-button-loading-event-suppression',
  'mui-checkbox-disabled-change-suppression',
  'mui-switch-disabled-change-suppression',
  'mui-radio-disabled-change-suppression',
]);

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function nestedFunctionFromInitializer(expression: ts.Expression | undefined): FunctionNode | undefined {
  if (!expression) return undefined;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isCallExpression(expression)) return undefined;
  for (const argument of expression.arguments) {
    if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  }
  return nestedFunctionFromInitializer(
    ts.isCallExpression(expression.expression) ? expression.expression : undefined,
  );
}

function publicPropsForFunction(fn: FunctionNode): Set<string> | undefined {
  const parameter = fn.parameters[0];
  if (!parameter) return new Set();
  // A props-object parameter can expose arbitrary properties. Preserve the
  // behavior rather than guessing which property accesses are public.
  if (ts.isIdentifier(parameter.name)) return undefined;
  if (!ts.isObjectBindingPattern(parameter.name)) return new Set();

  const props = new Set<string>();
  for (const element of parameter.name.elements) {
    if (element.dotDotDotToken) return undefined;
    const propertyName = element.propertyName;
    if (propertyName && (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))) {
      props.add(propertyName.text);
    } else if (ts.isIdentifier(element.name)) {
      props.add(element.name.text);
    }
  }
  return props;
}

function componentPublicProps(sourceFile: ts.SourceFile): Map<string, Set<string> | undefined> {
  const result = new Map<string, Set<string> | undefined>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      result.set(node.name.text, publicPropsForFunction(node));
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const fn = nestedFunctionFromInitializer(node.initializer);
      if (fn) result.set(node.name.text, publicPropsForFunction(fn));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function consumerFacingBehavior(
  behavior: BehaviorContract,
  publicProps: ReadonlyMap<string, Set<string> | undefined>,
): boolean {
  if (behavior.provider !== 'material-ui' || !muiSuppressionKinds.has(behavior.kind)) return true;
  if (behavior.expectation.type !== 'callback-not-called') return true;

  const componentProps = publicProps.get(behavior.componentName);
  if (componentProps === undefined) return true;

  return componentProps.has(behavior.condition.prop) &&
    componentProps.has(behavior.expectation.callbackProp);
}

function expectationKey(expectation: BehaviorExpectation): string {
  if (expectation.type === 'callback-not-called') {
    return `${expectation.type}:${expectation.callbackProp}`;
  }

  if (expectation.type === 'callback-event-boolean') {
    return [
      expectation.type,
      expectation.callbackProp,
      expectation.path.join('.'),
      String(expectation.value),
    ].join(':');
  }

  return [
    expectation.type,
    expectation.callbackProp,
    expectation.path.join('.'),
  ].join(':');
}

/**
 * Provider IDs are intentionally implementation-specific. Multiple providers may
 * discover the same public contract through different evidence paths, so merge
 * by observable semantics instead. Provider order is precedence order: the
 * established direct provider wins over the broader composition provider when
 * both describe the same behavior.
 */
function semanticBehaviorKey(behavior: BehaviorContract): string {
  return [
    behavior.provider,
    behavior.componentName,
    behavior.kind,
    behavior.condition.prop,
    String(behavior.condition.value),
    behavior.event.handlerProp,
    behavior.event.eventName,
    expectationKey(behavior.expectation),
  ].join('|');
}

export function extractComponentBehaviors(
  sourceText: string,
  fileName = 'component.tsx',
  providers: readonly BehaviorProvider[] = defaultBehaviorProviders,
): BehaviorContract[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const publicProps = componentPublicProps(sourceFile);
  const merged: BehaviorContract[] = [];
  const seenIds = new Set<string>();
  const seenSemantics = new Set<string>();

  for (const provider of providers) {
    for (const behavior of provider.extract(sourceFile)) {
      if (!consumerFacingBehavior(behavior, publicProps)) continue;
      const semanticKey = semanticBehaviorKey(behavior);
      if (seenIds.has(behavior.id) || seenSemantics.has(semanticKey)) continue;
      seenIds.add(behavior.id);
      seenSemantics.add(semanticKey);
      merged.push(behavior);
    }
  }

  return attachBehaviorTargets(
    sourceText,
    fileName,
    dedupeBehaviorContracts(merged),
  );
}
