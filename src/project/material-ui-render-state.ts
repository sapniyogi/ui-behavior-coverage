import ts from 'typescript';
import type {
  RenderStateBehaviorContract,
  RenderStateBehaviorKind,
} from '../core/model';
import { getAttribute, jsxTagName, lineOf } from '../providers/shared';

type MuiStateComponent = 'Button' | 'Checkbox' | 'Switch' | 'Radio';
type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

const supported = new Set<MuiStateComponent>(['Button', 'Checkbox', 'Switch', 'Radio']);

interface PropsObjectBinding {
  name: string;
  excluded: Set<string>;
}

interface ComponentContext {
  name: string;
  fn: FunctionNode;
  localToPublic: Map<string, string>;
  propsObjects: PropsObjectBinding[];
}

interface BooleanBinding {
  prop: string;
  inverted: boolean;
}

function muiComponentFromModule(moduleName: string): MuiStateComponent | undefined {
  if (!moduleName.startsWith('@mui/material/')) return undefined;
  const name = moduleName.slice('@mui/material/'.length) as MuiStateComponent;
  return supported.has(name) ? name : undefined;
}

function collectMuiImports(sourceFile: ts.SourceFile): Map<string, MuiStateComponent> {
  const imports = new Map<string, MuiStateComponent>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const moduleName = statement.moduleSpecifier.text;
    const defaultComponent = muiComponentFromModule(moduleName);
    if (defaultComponent && clause.name) imports.set(clause.name.text, defaultComponent);
    if (moduleName !== '@mui/material' || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = (element.propertyName?.text ?? element.name.text) as MuiStateComponent;
      if (supported.has(importedName)) imports.set(element.name.text, importedName);
    }
  }
  return imports;
}

function nestedFunction(expression: ts.Expression | undefined): FunctionNode | undefined {
  if (!expression) return undefined;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isCallExpression(expression)) return undefined;
  for (const argument of expression.arguments) {
    if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  }
  return ts.isCallExpression(expression.expression) ? nestedFunction(expression.expression) : undefined;
}

function publicBindings(fn: FunctionNode): Pick<ComponentContext, 'localToPublic' | 'propsObjects'> {
  const localToPublic = new Map<string, string>();
  const propsObjects: PropsObjectBinding[] = [];
  const parameter = fn.parameters[0];
  if (!parameter) return { localToPublic, propsObjects };
  if (ts.isIdentifier(parameter.name)) {
    propsObjects.push({ name: parameter.name.text, excluded: new Set() });
    return { localToPublic, propsObjects };
  }
  if (!ts.isObjectBindingPattern(parameter.name)) return { localToPublic, propsObjects };
  const excluded = new Set<string>();
  for (const element of parameter.name.elements) {
    if (element.dotDotDotToken && ts.isIdentifier(element.name)) {
      propsObjects.push({ name: element.name.text, excluded: new Set(excluded) });
      continue;
    }
    const publicName = element.propertyName &&
      (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
      ? element.propertyName.text
      : ts.isIdentifier(element.name)
        ? element.name.text
        : undefined;
    if (!publicName) continue;
    excluded.add(publicName);
    if (ts.isIdentifier(element.name)) localToPublic.set(element.name.text, publicName);
  }
  return { localToPublic, propsObjects };
}

function propsObject(context: ComponentContext, name: string): PropsObjectBinding | undefined {
  return context.propsObjects.find((binding) => binding.name === name);
}

function transparentPublicPropsExpression(
  expression: ts.Expression | undefined,
  context: ComponentContext,
): PropsObjectBinding | undefined {
  if (!expression) return undefined;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return transparentPublicPropsExpression(expression.expression, context);
  }
  if (ts.isIdentifier(expression)) return propsObject(context, expression.text);
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'useThemeProps'
  ) {
    const options = expression.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
    for (const property of options.properties) {
      if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'props') {
        return propsObject(context, 'props');
      }
      if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === 'props'
      ) {
        return transparentPublicPropsExpression(property.initializer, context);
      }
    }
  }
  return undefined;
}

function applyObjectBindingFromPublicProps(
  pattern: ts.ObjectBindingPattern,
  source: PropsObjectBinding,
  context: ComponentContext,
): boolean {
  let changed = false;
  const excluded = new Set(source.excluded);
  for (const element of pattern.elements) {
    if (element.dotDotDotToken && ts.isIdentifier(element.name)) {
      if (!propsObject(context, element.name.text)) {
        context.propsObjects.push({ name: element.name.text, excluded: new Set(excluded) });
        changed = true;
      }
      continue;
    }
    const publicName = element.propertyName &&
      (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
      ? element.propertyName.text
      : ts.isIdentifier(element.name)
        ? element.name.text
        : undefined;
    if (!publicName) continue;
    excluded.add(publicName);
    if (ts.isIdentifier(element.name) && !context.localToPublic.has(element.name.text)) {
      context.localToPublic.set(element.name.text, publicName);
      changed = true;
    }
  }
  return changed;
}

function enrichPublicBindings(context: ComponentContext): void {
  if (!context.fn.body) return;
  const declarations: ts.VariableDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    ts.forEachChild(node, collect);
  };
  collect(context.fn.body);
  let changed = true;
  let passes = 0;
  while (changed && passes < 8) {
    changed = false;
    passes += 1;
    for (const declaration of declarations) {
      const source = transparentPublicPropsExpression(declaration.initializer, context);
      if (!source) continue;
      if (ts.isIdentifier(declaration.name)) {
        if (!propsObject(context, declaration.name.text)) {
          context.propsObjects.push({ name: declaration.name.text, excluded: new Set(source.excluded) });
          changed = true;
        }
        continue;
      }
      if (ts.isObjectBindingPattern(declaration.name)) {
        changed = applyObjectBindingFromPublicProps(declaration.name, source, context) || changed;
      }
    }
  }
}

function collectComponents(sourceFile: ts.SourceFile): ComponentContext[] {
  const contexts: ComponentContext[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      const context = { name: node.name.text, fn: node, ...publicBindings(node) };
      enrichPublicBindings(context);
      contexts.push(context);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const fn = nestedFunction(node.initializer);
      if (fn) {
        const context = { name: node.name.text, fn, ...publicBindings(fn) };
        enrichPublicBindings(context);
        contexts.push(context);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return contexts;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

function directPublicProp(expression: ts.Expression, context: ComponentContext): string | undefined {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) return context.localToPublic.get(current.text);
  if (
    ts.isPropertyAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    propsObject(context, current.expression.text)
  ) return current.name.text;
  return undefined;
}

function booleanBinding(expression: ts.Expression, context: ComponentContext): BooleanBinding | undefined {
  const current = unwrap(expression);
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
  ) return booleanBinding(current.arguments[0], context);
  return undefined;
}

function booleanLiteral(expression: ts.Expression): boolean | undefined {
  const current = unwrap(expression);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function truthyDependencies(
  expression: ts.Expression,
  context: ComponentContext,
): Array<{ prop: string; when: boolean }> | undefined {
  const current = unwrap(expression);
  const binding = booleanBinding(current, context);
  if (binding) return [{ prop: binding.prop, when: !binding.inverted }];
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    const left = truthyDependencies(current.left, context);
    const right = truthyDependencies(current.right, context);
    return left && right ? [...left, ...right] : undefined;
  }
  if (!ts.isBinaryExpression(current)) return undefined;
  const operator = current.operatorToken.kind;
  const leftProp = directPublicProp(current.left, context);
  const rightProp = directPublicProp(current.right, context);
  const leftBoolean = booleanLiteral(current.left);
  const rightBoolean = booleanLiteral(current.right);
  const equality = operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken;
  const inequality = operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken;
  if (!equality && !inequality) return undefined;
  if (leftProp && rightBoolean !== undefined) return [{ prop: leftProp, when: equality ? rightBoolean : !rightBoolean }];
  if (rightProp && leftBoolean !== undefined) return [{ prop: rightProp, when: equality ? leftBoolean : !leftBoolean }];
  return undefined;
}

function attributeExpression(node: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) return undefined;
  return attribute.initializer.expression;
}

function forwardsProp(node: ts.JsxOpeningLikeElement, prop: string, context: ComponentContext): boolean {
  let forwarded = false;
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === prop) {
      forwarded = false;
      continue;
    }
    if (!ts.isJsxSpreadAttribute(property)) continue;
    if (ts.isIdentifier(property.expression)) {
      const binding = propsObject(context, property.expression.text);
      if (binding && !binding.excluded.has(prop)) {
        forwarded = true;
        continue;
      }
    }
    forwarded = false;
  }
  return forwarded;
}

function pushState(
  behaviors: RenderStateBehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: RenderStateBehaviorKind,
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
    event: { eventName: 'render' },
    expectation: { type: 'element-boolean-state', state, value: stateValue },
    evidence: {
      fileName: sourceFile.fileName,
      line: lineOf(sourceFile, node),
      snippet: node.getText(sourceFile),
    },
  });
}

function disabledKind(component: MuiStateComponent): RenderStateBehaviorKind {
  if (component === 'Button') return 'mui-button-disabled-render-state';
  if (component === 'Checkbox') return 'mui-checkbox-disabled-render-state';
  if (component === 'Switch') return 'mui-switch-disabled-render-state';
  return 'mui-radio-disabled-render-state';
}

function checkedKind(component: Exclude<MuiStateComponent, 'Button'>): RenderStateBehaviorKind {
  if (component === 'Checkbox') return 'mui-checkbox-checked-render-state';
  if (component === 'Switch') return 'mui-switch-checked-render-state';
  return 'mui-radio-checked-render-state';
}

function inferUsage(
  behaviors: RenderStateBehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  component: MuiStateComponent,
): void {
  const disabled = attributeExpression(node, 'disabled');
  if (disabled) {
    for (const dependency of truthyDependencies(disabled, context) ?? []) {
      pushState(behaviors, sourceFile, node, context.name, disabledKind(component), dependency.prop, dependency.when, 'disabled', true);
    }
  } else if (forwardsProp(node, 'disabled', context)) {
    pushState(behaviors, sourceFile, node, context.name, disabledKind(component), 'disabled', true, 'disabled', true);
  }
  if (component === 'Button') {
    const loading = attributeExpression(node, 'loading');
    if (loading) {
      for (const dependency of truthyDependencies(loading, context) ?? []) {
        pushState(behaviors, sourceFile, node, context.name, 'mui-button-loading-render-state', dependency.prop, dependency.when, 'disabled', true);
      }
    } else if (forwardsProp(node, 'loading', context)) {
      pushState(behaviors, sourceFile, node, context.name, 'mui-button-loading-render-state', 'loading', true, 'disabled', true);
    }
    return;
  }
  const checkedExpression = attributeExpression(node, 'checked');
  const checked = checkedExpression
    ? booleanBinding(checkedExpression, context)
    : forwardsProp(node, 'checked', context)
      ? { prop: 'checked', inverted: false }
      : undefined;
  if (!checked) return;
  for (const publicValue of [false, true] as const) {
    pushState(
      behaviors,
      sourceFile,
      node,
      context.name,
      checkedKind(component),
      checked.prop,
      publicValue,
      'checked',
      checked.inverted ? !publicValue : publicValue,
    );
  }
}

export function extractMaterialUiRenderStateBehaviors(
  sourceFile: ts.SourceFile,
): RenderStateBehaviorContract[] {
  const muiImports = collectMuiImports(sourceFile);
  if (muiImports.size === 0) return [];
  const contexts = collectComponents(sourceFile);
  const functions = new Set(contexts.map((context) => context.fn));
  const behaviors: RenderStateBehaviorContract[] = [];
  for (const context of contexts) {
    const visit = (node: ts.Node): void => {
      if (node !== context.fn && functions.has(node as FunctionNode)) return;
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const component = tag ? muiImports.get(tag) : undefined;
        if (component) inferUsage(behaviors, sourceFile, node, context, component);
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
      behavior.expectation.state,
      String(behavior.expectation.value),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
