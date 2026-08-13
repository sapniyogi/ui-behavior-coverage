import ts from 'typescript';
import type { BehaviorContract, BehaviorKind } from '../core/model';
import { getAttribute, jsxTagName, lineOf } from '../providers/shared';

type SupportedMuiComponent = 'Button' | 'Checkbox' | 'Switch' | 'Radio';
type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

const supportedMuiComponents = new Set<SupportedMuiComponent>([
  'Button',
  'Checkbox',
  'Switch',
  'Radio',
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
}

interface BooleanBinding {
  prop: string;
  inverted: boolean;
}

interface TruthyDependency {
  prop: string;
  when: boolean;
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

  if (ts.isCallExpression(expression.expression)) return nestedFunctionFromInitializer(expression.expression);
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

function collectComponents(sourceFile: ts.SourceFile): ComponentContext[] {
  const contexts: ComponentContext[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      contexts.push({ name: node.name.text, fn: node, ...collectPublicBindings(node) });
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const fn = nestedFunctionFromInitializer(node.initializer);
      if (fn) contexts.push({ name: node.name.text, fn, ...collectPublicBindings(fn) });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return contexts;
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
  if (ts.isIdentifier(current)) return context.localToPublicProp.get(current.text);

  if (
    ts.isPropertyAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    propsObject(context, current.expression.text)
  ) {
    return current.name.text;
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

function truthyDependencies(expression: ts.Expression, context: ComponentContext): TruthyDependency[] | undefined {
  const current = unwrapExpression(expression);
  const binding = booleanBinding(current, context);
  if (binding) return [{ prop: binding.prop, when: !binding.inverted }];

  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
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

function attributeExpression(node: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) return undefined;
  return attribute.initializer.expression;
}

function effectiveSpreadBinding(
  node: ts.JsxOpeningLikeElement,
  prop: string,
  context: ComponentContext,
): boolean {
  let forwards = false;

  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === prop) {
      forwards = false;
      continue;
    }

    if (!ts.isJsxSpreadAttribute(property)) continue;
    if (ts.isIdentifier(property.expression)) {
      const binding = propsObject(context, property.expression.text);
      if (binding && !binding.excluded.has(prop)) {
        forwards = true;
        continue;
      }
    }
    forwards = false;
  }

  return forwards;
}

function evidence(sourceFile: ts.SourceFile, node: ts.Node) {
  return {
    fileName: sourceFile.fileName,
    line: lineOf(sourceFile, node),
    snippet: node.getText(sourceFile),
  };
}

function pushState(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind,
    | 'mui-button-disabled-render-state'
    | 'mui-button-loading-render-state'
    | 'mui-checkbox-disabled-render-state'
    | 'mui-checkbox-checked-render-state'
    | 'mui-switch-disabled-render-state'
    | 'mui-switch-checked-render-state'
    | 'mui-radio-disabled-render-state'
    | 'mui-radio-checked-render-state'>,
  conditionProp: string,
  conditionValue: boolean,
  state: 'disabled' | 'checked',
  stateValue: boolean,
): void {
  behaviors.push({
    id: `${componentName}:mui-render:${kind}:${conditionProp}:${conditionValue}:${state}:${stateValue}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${conditionProp}=${conditionValue} renders ${state}=${stateValue}`,
    condition: { prop: conditionProp, value: conditionValue },
    event: { handlerProp: '', eventName: 'render' },
    expectation: { type: 'element-boolean-state', state, value: stateValue },
    evidence: evidence(sourceFile, node),
  });
}

function disabledKind(component: SupportedMuiComponent): Extract<BehaviorKind,
  | 'mui-button-disabled-render-state'
  | 'mui-checkbox-disabled-render-state'
  | 'mui-switch-disabled-render-state'
  | 'mui-radio-disabled-render-state'> {
  if (component === 'Button') return 'mui-button-disabled-render-state';
  if (component === 'Checkbox') return 'mui-checkbox-disabled-render-state';
  if (component === 'Switch') return 'mui-switch-disabled-render-state';
  return 'mui-radio-disabled-render-state';
}

function checkedKind(component: Exclude<SupportedMuiComponent, 'Button'>): Extract<BehaviorKind,
  | 'mui-checkbox-checked-render-state'
  | 'mui-switch-checked-render-state'
  | 'mui-radio-checked-render-state'> {
  if (component === 'Checkbox') return 'mui-checkbox-checked-render-state';
  if (component === 'Switch') return 'mui-switch-checked-render-state';
  return 'mui-radio-checked-render-state';
}

function inferUsage(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  component: SupportedMuiComponent,
): void {
  const disabledExpression = attributeExpression(node, 'disabled');
  if (disabledExpression) {
    for (const dependency of truthyDependencies(disabledExpression, context) ?? []) {
      pushState(
        behaviors,
        sourceFile,
        node,
        context.name,
        disabledKind(component),
        dependency.prop,
        dependency.when,
        'disabled',
        true,
      );
    }
  } else if (effectiveSpreadBinding(node, 'disabled', context)) {
    pushState(
      behaviors,
      sourceFile,
      node,
      context.name,
      disabledKind(component),
      'disabled',
      true,
      'disabled',
      true,
    );
  }

  if (component === 'Button') {
    const loadingExpression = attributeExpression(node, 'loading');
    if (loadingExpression) {
      for (const dependency of truthyDependencies(loadingExpression, context) ?? []) {
        pushState(
          behaviors,
          sourceFile,
          node,
          context.name,
          'mui-button-loading-render-state',
          dependency.prop,
          dependency.when,
          'disabled',
          true,
        );
      }
    } else if (effectiveSpreadBinding(node, 'loading', context)) {
      pushState(
        behaviors,
        sourceFile,
        node,
        context.name,
        'mui-button-loading-render-state',
        'loading',
        true,
        'disabled',
        true,
      );
    }
    return;
  }

  const checkedExpression = attributeExpression(node, 'checked');
  const checked = checkedExpression
    ? booleanBinding(checkedExpression, context)
    : effectiveSpreadBinding(node, 'checked', context)
      ? { prop: 'checked', inverted: false }
      : undefined;

  if (!checked) return;
  for (const publicValue of [false, true] as const) {
    const renderedValue = checked.inverted ? !publicValue : publicValue;
    pushState(
      behaviors,
      sourceFile,
      node,
      context.name,
      checkedKind(component),
      checked.prop,
      publicValue,
      'checked',
      renderedValue,
    );
  }
}

export function extractMaterialUiRenderStateBehaviors(sourceFile: ts.SourceFile): BehaviorContract[] {
  const muiImports = collectMuiImports(sourceFile);
  if (muiImports.size === 0) return [];

  const components = collectComponents(sourceFile);
  const componentFunctions = new Set(components.map((context) => context.fn));
  const behaviors: BehaviorContract[] = [];

  for (const context of components) {
    const visit = (node: ts.Node): void => {
      if (node !== context.fn && componentFunctions.has(node as FunctionNode)) return;

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const muiComponent = tag ? muiImports.get(tag) : undefined;
        if (muiComponent) inferUsage(behaviors, sourceFile, node, context, muiComponent);
      }

      ts.forEachChild(node, visit);
    };

    if (context.fn.body) visit(context.fn.body);
  }

  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    const key = [
      behavior.componentName,
      behavior.kind,
      behavior.condition.prop,
      String(behavior.condition.value),
      behavior.expectation.type,
      behavior.expectation.type === 'element-boolean-state'
        ? `${behavior.expectation.state}:${behavior.expectation.value}`
        : '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
