import ts from 'typescript';
import type { BehaviorContract, BehaviorKind, BehaviorExpectation } from '../core/model';
import type { BehaviorProvider } from './types';
import { getAttribute, jsxTagName, lineOf, readAttributeValue } from './shared';

type SupportedMuiComponent = 'Button' | 'Checkbox' | 'Switch' | 'Radio' | 'TextField' | 'Select';
type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

const supportedMuiComponents = new Set<SupportedMuiComponent>([
  'Button',
  'Checkbox',
  'Switch',
  'Radio',
  'TextField',
  'Select',
]);

interface PropsObjectBinding {
  name: string;
  excluded: Set<string>;
}

interface ComponentContext {
  name: string;
  fn: FunctionNode;
  localToPublicProp: Map<string, string>;
  propsObjects: PropsObjectBinding[];
  forwardedHandlers: Map<string, string>;
}

interface BooleanDependency {
  prop: string;
  when: boolean;
}

interface BooleanBinding {
  prop: string;
  inverted: boolean;
}

interface ComponentLink {
  from: string;
  to: string;
  node: ts.JsxOpeningLikeElement;
  explicit: Map<string, string>;
  identitySpreads: PropsObjectBinding[];
  overriddenAfterSpread: Set<string>;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function supportedComponentFromModule(moduleName: string): SupportedMuiComponent | undefined {
  const prefix = '@mui/material/';
  if (!moduleName.startsWith(prefix)) return undefined;
  const name = moduleName.slice(prefix.length);
  return supportedMuiComponents.has(name as SupportedMuiComponent)
    ? (name as SupportedMuiComponent)
    : undefined;
}

function collectMuiImports(sourceFile: ts.SourceFile): Map<string, SupportedMuiComponent> {
  const bindings = new Map<string, SupportedMuiComponent>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    const moduleName = statement.moduleSpecifier.text;
    const defaultComponent = supportedComponentFromModule(moduleName);
    if (defaultComponent && clause.name) bindings.set(clause.name.text, defaultComponent);

    if (moduleName !== '@mui/material' || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }

    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = element.propertyName?.text ?? element.name.text;
      if (supportedMuiComponents.has(importedName as SupportedMuiComponent)) {
        bindings.set(element.name.text, importedName as SupportedMuiComponent);
      }
    }
  }

  return bindings;
}

function nestedFunctionFromInitializer(expression: ts.Expression | undefined): FunctionNode | undefined {
  if (!expression) return undefined;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isCallExpression(expression)) return undefined;

  for (const argument of expression.arguments) {
    if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  }

  if (ts.isCallExpression(expression.expression)) {
    return nestedFunctionFromInitializer(expression.expression);
  }

  return undefined;
}

function collectPublicBindings(fn: FunctionNode): {
  localToPublicProp: Map<string, string>;
  propsObjects: PropsObjectBinding[];
} {
  const localToPublicProp = new Map<string, string>();
  const propsObjects: PropsObjectBinding[] = [];
  const parameter = fn.parameters[0];
  if (!parameter) return { localToPublicProp, propsObjects };

  if (ts.isIdentifier(parameter.name)) {
    propsObjects.push({ name: parameter.name.text, excluded: new Set() });
    return { localToPublicProp, propsObjects };
  }

  if (!ts.isObjectBindingPattern(parameter.name)) return { localToPublicProp, propsObjects };

  const excluded = new Set<string>();
  for (const element of parameter.name.elements) {
    if (element.dotDotDotToken && ts.isIdentifier(element.name)) {
      propsObjects.push({ name: element.name.text, excluded: new Set(excluded) });
      continue;
    }

    const propertyName = element.propertyName;
    const publicName = propertyName && (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))
      ? propertyName.text
      : ts.isIdentifier(element.name)
        ? element.name.text
        : undefined;
    if (!publicName) continue;
    excluded.add(publicName);
    if (ts.isIdentifier(element.name)) localToPublicProp.set(element.name.text, publicName);
  }

  return { localToPublicProp, propsObjects };
}

function collectComponents(sourceFile: ts.SourceFile): Map<string, ComponentContext> {
  const components = new Map<string, ComponentContext>();

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentName(node.name.text)) {
      const bindings = collectPublicBindings(node);
      components.set(node.name.text, {
        name: node.name.text,
        fn: node,
        ...bindings,
        forwardedHandlers: new Map(),
      });
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isComponentName(node.name.text)) {
      const fn = nestedFunctionFromInitializer(node.initializer);
      if (fn) {
        const bindings = collectPublicBindings(fn);
        components.set(node.name.text, {
          name: node.name.text,
          fn,
          ...bindings,
          forwardedHandlers: new Map(),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return components;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propsObject(context: ComponentContext, name: string): PropsObjectBinding | undefined {
  return context.propsObjects.find((binding) => binding.name === name);
}

function directPublicProp(expression: ts.Expression, context: ComponentContext): string | undefined {
  const current = unwrapExpression(expression);

  if (ts.isIdentifier(current)) {
    return context.localToPublicProp.get(current.text);
  }

  if (
    ts.isPropertyAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    propsObject(context, current.expression.text)
  ) {
    return current.name.text;
  }

  if (
    ts.isElementAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    propsObject(context, current.expression.text) &&
    current.argumentExpression &&
    ts.isStringLiteralLike(current.argumentExpression)
  ) {
    return current.argumentExpression.text;
  }

  return undefined;
}

function booleanBinding(expression: ts.Expression, context: ComponentContext): BooleanBinding | undefined {
  const current = unwrapExpression(expression);
  const direct = directPublicProp(current, context);
  if (direct) return { prop: direct, inverted: false };

  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
    const nested = booleanBinding(current.operand, context);
    return nested ? { prop: nested.prop, inverted: !nested.inverted } : undefined;
  }

  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === 'Boolean' &&
    current.arguments[0]
  ) {
    return booleanBinding(current.arguments[0], context);
  }

  return undefined;
}

function booleanLiteral(expression: ts.Expression): boolean | undefined {
  const current = unwrapExpression(expression);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function truthyDependencies(expression: ts.Expression, context: ComponentContext): BooleanDependency[] | undefined {
  const current = unwrapExpression(expression);
  const binding = booleanBinding(current, context);
  if (binding) return [{ prop: binding.prop, when: !binding.inverted }];

  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    const left = truthyDependencies(current.left, context);
    const right = truthyDependencies(current.right, context);
    return left && right ? [...left, ...right] : undefined;
  }

  if (ts.isBinaryExpression(current)) {
    const operator = current.operatorToken.kind;
    const leftProp = directPublicProp(current.left, context);
    const rightProp = directPublicProp(current.right, context);
    const leftBoolean = booleanLiteral(current.left);
    const rightBoolean = booleanLiteral(current.right);

    if (leftProp && rightBoolean !== undefined) {
      if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken) {
        return [{ prop: leftProp, when: rightBoolean }];
      }
      if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken) {
        return [{ prop: leftProp, when: !rightBoolean }];
      }
    }

    if (rightProp && leftBoolean !== undefined) {
      if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken) {
        return [{ prop: rightProp, when: leftBoolean }];
      }
      if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken) {
        return [{ prop: rightProp, when: !leftBoolean }];
      }
    }
  }

  return undefined;
}

function publicCallback(expression: ts.Expression, context: ComponentContext): string | undefined {
  const direct = directPublicProp(expression, context);
  if (direct) return direct;

  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return context.forwardedHandlers.get(current.text);
  return undefined;
}

function publicAttributeExpression(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.Expression | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) return undefined;
  return attribute.initializer.expression;
}

function collectForwardedHandlers(context: ComponentContext): void {
  const handlerCandidates: Array<{ name: string; fn: FunctionNode }> = [];

  const visitCandidates = (node: ts.Node): void => {
    if (node !== context.fn && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        handlerCandidates.push({ name: node.name.text, fn: node });
        return;
      }
      if (
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        handlerCandidates.push({ name: node.parent.name.text, fn: node });
        return;
      }
    }
    ts.forEachChild(node, visitCandidates);
  };

  if (context.fn.body) ts.forEachChild(context.fn.body, visitCandidates);

  for (const candidate of handlerCandidates) {
    const calledPublicProps = new Set<string>();
    const visitCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callback = publicCallback(node.expression, context);
        if (callback) calledPublicProps.add(callback);
      }
      ts.forEachChild(node, visitCalls);
    };
    if (candidate.fn.body) visitCalls(candidate.fn.body);
    if (calledPublicProps.size === 1) {
      context.forwardedHandlers.set(candidate.name, [...calledPublicProps][0]!);
    }
  }
}

function evidence(sourceFile: ts.SourceFile, node: ts.Node) {
  return {
    fileName: sourceFile.fileName,
    line: lineOf(sourceFile, node),
    snippet: node.getText(sourceFile),
  };
}

function pushSuppression(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind,
    | 'mui-button-disabled-event-suppression'
    | 'mui-button-loading-event-suppression'
    | 'mui-checkbox-disabled-change-suppression'
    | 'mui-switch-disabled-change-suppression'
    | 'mui-radio-disabled-change-suppression'>,
  conditionProp: string,
  conditionValue: boolean,
  callbackProp: string,
): void {
  behaviors.push({
    id: `${componentName}:mui:${conditionProp}:${conditionValue}:${callbackProp}:${kind}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${conditionProp}=${conditionValue} prevents ${callbackProp} activation`,
    condition: { prop: conditionProp, value: conditionValue },
    event: { handlerProp: callbackProp, eventName: 'click' },
    expectation: { type: 'callback-not-called', callbackProp },
    evidence: evidence(sourceFile, node),
  });
}

function pushBooleanState(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind, 'mui-checkbox-checked-toggle' | 'mui-switch-checked-toggle' | 'mui-radio-checked-select'>,
  conditionProp: string,
  conditionValue: boolean,
  callbackProp: string,
  nextChecked: boolean,
): void {
  behaviors.push({
    id: `${componentName}:mui:${conditionProp}:${conditionValue}:${callbackProp}:${kind}:${nextChecked}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${conditionProp}=${conditionValue} reports event.target.checked=${nextChecked}`,
    condition: { prop: conditionProp, value: conditionValue },
    event: { handlerProp: callbackProp, eventName: 'click' },
    expectation: {
      type: 'callback-event-boolean',
      callbackProp,
      path: ['target', 'checked'],
      value: nextChecked,
    },
    evidence: evidence(sourceFile, node),
  });
}

function pushValueChange(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind, 'mui-text-field-value-change' | 'mui-select-native-value-change'>,
  valueProp: string,
  callbackProp: string,
  eventName: 'type' | 'selectOptions',
): void {
  behaviors.push({
    id: `${componentName}:mui:${valueProp}:${callbackProp}:${kind}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${valueProp} changes are reported through ${callbackProp} event.target.value`,
    condition: { prop: valueProp, value: 'bound' },
    event: { handlerProp: callbackProp, eventName },
    expectation: { type: 'callback-event-path', callbackProp, path: ['target', 'value'] },
    evidence: evidence(sourceFile, node),
  });
}

function spreadBindings(node: ts.JsxOpeningLikeElement, context: ComponentContext): PropsObjectBinding[] {
  const bindings: PropsObjectBinding[] = [];
  for (const property of node.attributes.properties) {
    if (!ts.isJsxSpreadAttribute(property) || !ts.isIdentifier(property.expression)) continue;
    const binding = propsObject(context, property.expression.text);
    if (binding) bindings.push(binding);
  }
  return bindings;
}

function explicitAttributesAfterLastForwardedSpread(
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
): Set<string> {
  let lastSpreadIndex = -1;
  node.attributes.properties.forEach((property, index) => {
    if (ts.isJsxSpreadAttribute(property) && ts.isIdentifier(property.expression) && propsObject(context, property.expression.text)) {
      lastSpreadIndex = index;
    }
  });

  const overridden = new Set<string>();
  if (lastSpreadIndex < 0) return overridden;
  node.attributes.properties.forEach((property, index) => {
    if (index <= lastSpreadIndex || !ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) return;
    overridden.add(property.name.text);
  });
  return overridden;
}

function spreadForwardsProp(
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  prop: string,
): boolean {
  const bindings = spreadBindings(node, context);
  if (bindings.length === 0) return false;
  const overridden = explicitAttributesAfterLastForwardedSpread(node, context);
  if (overridden.has(prop)) return false;
  return bindings.some((binding) => !binding.excluded.has(prop));
}

function sourceSelectIsAlwaysNative(node: ts.JsxOpeningLikeElement): boolean {
  const attribute = getAttribute(node, 'native');
  return !!attribute && readAttributeValue(attribute).kind === 'true';
}

function inferMuiUsage(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  muiComponent: SupportedMuiComponent,
): void {
  const callbackName = muiComponent === 'Button' ? 'onClick' : 'onChange';
  const callbackExpression = publicAttributeExpression(node, callbackName);
  const callbackProp = callbackExpression
    ? publicCallback(callbackExpression, context)
    : spreadForwardsProp(node, context, callbackName)
      ? callbackName
      : undefined;

  if (!callbackProp) return;

  const suppression: Array<{
    propName: 'disabled' | 'loading';
    kind: Extract<BehaviorKind,
      | 'mui-button-disabled-event-suppression'
      | 'mui-button-loading-event-suppression'
      | 'mui-checkbox-disabled-change-suppression'
      | 'mui-switch-disabled-change-suppression'
      | 'mui-radio-disabled-change-suppression'>;
  }> = [];

  if (muiComponent === 'Button') {
    suppression.push(
      { propName: 'disabled', kind: 'mui-button-disabled-event-suppression' },
      { propName: 'loading', kind: 'mui-button-loading-event-suppression' },
    );
  } else if (muiComponent === 'Checkbox') {
    suppression.push({ propName: 'disabled', kind: 'mui-checkbox-disabled-change-suppression' });
  } else if (muiComponent === 'Switch') {
    suppression.push({ propName: 'disabled', kind: 'mui-switch-disabled-change-suppression' });
  } else if (muiComponent === 'Radio') {
    suppression.push({ propName: 'disabled', kind: 'mui-radio-disabled-change-suppression' });
  }

  for (const candidate of suppression) {
    const expression = publicAttributeExpression(node, candidate.propName);
    if (expression) {
      const dependencies = truthyDependencies(expression, context);
      for (const dependency of dependencies ?? []) {
        pushSuppression(
          behaviors,
          sourceFile,
          node,
          context.name,
          candidate.kind,
          dependency.prop,
          dependency.when,
          callbackProp,
        );
      }
    } else if (spreadForwardsProp(node, context, candidate.propName)) {
      pushSuppression(
        behaviors,
        sourceFile,
        node,
        context.name,
        candidate.kind,
        candidate.propName,
        true,
        callbackProp,
      );
    }
  }

  if (muiComponent === 'Checkbox' || muiComponent === 'Switch' || muiComponent === 'Radio') {
    const checkedExpression = publicAttributeExpression(node, 'checked');
    const checked = checkedExpression
      ? booleanBinding(checkedExpression, context)
      : spreadForwardsProp(node, context, 'checked')
        ? { prop: 'checked', inverted: false }
        : undefined;

    if (checked) {
      if (muiComponent === 'Radio') {
        // Radio selection only applies when the underlying radio is currently unchecked.
        // If checked is inverted from a public prop, that corresponds to public=true.
        const outerValueWhenUnchecked = checked.inverted;
        pushBooleanState(
          behaviors,
          sourceFile,
          node,
          context.name,
          'mui-radio-checked-select',
          checked.prop,
          outerValueWhenUnchecked,
          callbackProp,
          true,
        );
      } else {
        const kind = muiComponent === 'Checkbox' ? 'mui-checkbox-checked-toggle' : 'mui-switch-checked-toggle';
        // The callback reports the next *underlying MUI checked state*.
        // Non-inverted: outer=false -> true, outer=true -> false.
        // Inverted:     outer=false -> false, outer=true -> true.
        for (const outerValue of [false, true] as const) {
          const nextChecked = checked.inverted ? outerValue : !outerValue;
          pushBooleanState(
            behaviors,
            sourceFile,
            node,
            context.name,
            kind,
            checked.prop,
            outerValue,
            callbackProp,
            nextChecked,
          );
        }
      }
    }
  }

  if (muiComponent === 'TextField' || (muiComponent === 'Select' && sourceSelectIsAlwaysNative(node))) {
    const valueExpression = publicAttributeExpression(node, 'value');
    const valueProp = valueExpression
      ? directPublicProp(valueExpression, context)
      : spreadForwardsProp(node, context, 'value')
        ? 'value'
        : undefined;
    if (valueProp) {
      pushValueChange(
        behaviors,
        sourceFile,
        node,
        context.name,
        muiComponent === 'TextField' ? 'mui-text-field-value-change' : 'mui-select-native-value-change',
        valueProp,
        callbackProp,
        muiComponent === 'TextField' ? 'type' : 'selectOptions',
      );
    }
  }
}

function buildComponentLink(
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  target: string,
): ComponentLink {
  const explicit = new Map<string, string>();
  const identitySpreads = spreadBindings(node, context);
  const overriddenAfterSpread = explicitAttributesAfterLastForwardedSpread(node, context);

  for (const property of node.attributes.properties) {
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;
    const expression = property.initializer && ts.isJsxExpression(property.initializer)
      ? property.initializer.expression
      : undefined;
    if (!expression) continue;
    const mapped = directPublicProp(expression, context) ?? publicCallback(expression, context);
    if (mapped) explicit.set(property.name.text, mapped);
  }

  return {
    from: context.name,
    to: target,
    node,
    explicit,
    identitySpreads,
    overriddenAfterSpread,
  };
}

function mappedProp(link: ComponentLink, prop: string): string | undefined {
  const explicit = link.explicit.get(prop);
  if (explicit) return explicit;
  if (link.overriddenAfterSpread.has(prop)) return undefined;
  return link.identitySpreads.some((binding) => !binding.excluded.has(prop)) ? prop : undefined;
}

function remapExpectation(expectation: BehaviorExpectation, callbackProp: string): BehaviorExpectation {
  if (expectation.type === 'callback-not-called') {
    return { ...expectation, callbackProp };
  }
  if (expectation.type === 'callback-event-boolean') {
    return { ...expectation, callbackProp, path: [...expectation.path] };
  }
  return { ...expectation, callbackProp, path: [...expectation.path] };
}

function remapBehavior(
  sourceFile: ts.SourceFile,
  behavior: BehaviorContract,
  link: ComponentLink,
): BehaviorContract | undefined {
  const conditionProp = mappedProp(link, behavior.condition.prop);
  const callbackProp = mappedProp(link, behavior.expectation.callbackProp);
  if (!conditionProp || !callbackProp) return undefined;

  return {
    ...behavior,
    id: `${link.from}:composed:${link.to}:${conditionProp}:${callbackProp}:${behavior.kind}:${behavior.condition.value}`,
    componentName: link.from,
    title: behavior.title
      .replace(behavior.condition.prop, conditionProp)
      .replace(behavior.expectation.callbackProp, callbackProp),
    condition: { ...behavior.condition, prop: conditionProp },
    event: { ...behavior.event, handlerProp: callbackProp },
    expectation: remapExpectation(behavior.expectation, callbackProp),
    evidence: evidence(sourceFile, link.node),
  };
}

export const materialUiCompositionProvider: BehaviorProvider = {
  name: 'material-ui',
  extract(sourceFile): BehaviorContract[] {
    const muiImports = collectMuiImports(sourceFile);
    const components = collectComponents(sourceFile);
    if (components.size === 0) return [];

    for (const context of components.values()) collectForwardedHandlers(context);

    const componentFunctions = new Set([...components.values()].map((context) => context.fn));
    const behaviors: BehaviorContract[] = [];
    const links: ComponentLink[] = [];

    for (const context of components.values()) {
      const visit = (node: ts.Node): void => {
        if (node !== context.fn && componentFunctions.has(node as FunctionNode)) return;

        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const localTag = jsxTagName(node);
          if (localTag) {
            const muiComponent = muiImports.get(localTag);
            if (muiComponent) inferMuiUsage(behaviors, sourceFile, node, context, muiComponent);
            else if (components.has(localTag) && localTag !== context.name) {
              links.push(buildComponentLink(node, context, localTag));
            }
          }
        }
        ts.forEachChild(node, visit);
      };

      if (context.fn.body) visit(context.fn.body);
    }

    let changed = true;
    const seen = new Set(behaviors.map((behavior) => behavior.id));
    while (changed) {
      changed = false;
      for (const link of links) {
        for (const behavior of [...behaviors]) {
          if (behavior.componentName !== link.to) continue;
          const remapped = remapBehavior(sourceFile, behavior, link);
          if (!remapped || seen.has(remapped.id)) continue;
          seen.add(remapped.id);
          behaviors.push(remapped);
          changed = true;
        }
      }
    }

    return behaviors;
  },
};
