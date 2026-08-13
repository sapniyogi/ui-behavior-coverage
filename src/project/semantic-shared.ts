import ts from 'typescript';
import { getAttribute } from '../providers/shared';

export type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

export interface PropsObjectBinding {
  name: string;
  excluded: Set<string>;
}

export interface FormFieldBinding {
  variable: string;
  fieldKeyProp: 'source' | 'name';
}

export interface SemanticComponentContext {
  name: string;
  fn: FunctionNode;
  localToPublic: Map<string, string>;
  propsObjects: PropsObjectBinding[];
  formFields: Map<string, FormFieldBinding>;
}

export interface BooleanBinding {
  prop: string;
  inverted: boolean;
}

export function collectMuiImports(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (moduleName.startsWith('@mui/material/')) {
      const name = moduleName.slice('@mui/material/'.length);
      if (name && !name.includes('/') && clause.name) imports.set(clause.name.text, name);
    }
    if (moduleName !== '@mui/material' || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      if (!element.isTypeOnly) imports.set(element.name.text, element.propertyName?.text ?? element.name.text);
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

function publicBindings(fn: FunctionNode): Pick<SemanticComponentContext, 'localToPublic' | 'propsObjects'> {
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

export function propsObject(context: SemanticComponentContext, name: string): PropsObjectBinding | undefined {
  return context.propsObjects.find((binding) => binding.name === name);
}

function transparentProps(
  expression: ts.Expression | undefined,
  context: SemanticComponentContext,
): PropsObjectBinding | undefined {
  if (!expression) return undefined;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return transparentProps(expression.expression, context);
  }
  if (ts.isIdentifier(expression)) return propsObject(context, expression.text);
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== 'useThemeProps') {
    return undefined;
  }
  const options = expression.arguments[0];
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  for (const property of options.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'props') return propsObject(context, 'props');
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
      property.name.text === 'props'
    ) return transparentProps(property.initializer, context);
  }
  return undefined;
}

function applyBinding(
  pattern: ts.ObjectBindingPattern,
  source: PropsObjectBinding,
  context: SemanticComponentContext,
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

function hookName(call: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function collectFormFields(context: SemanticComponentContext, declarations: readonly ts.VariableDeclaration[]): void {
  for (const declaration of declarations) {
    if (!declaration.initializer || !ts.isCallExpression(declaration.initializer) || !ts.isObjectBindingPattern(declaration.name)) continue;
    const hook = hookName(declaration.initializer);
    const fieldKeyProp = hook === 'useInput' ? 'source' : hook === 'useController' ? 'name' : undefined;
    if (!fieldKeyProp) continue;
    for (const element of declaration.name.elements) {
      const property = element.propertyName &&
        (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
        ? element.propertyName.text
        : ts.isIdentifier(element.name)
          ? element.name.text
          : undefined;
      if (property === 'field' && ts.isIdentifier(element.name)) {
        context.formFields.set(element.name.text, { variable: element.name.text, fieldKeyProp });
      }
    }
  }
}

function enrich(context: SemanticComponentContext): void {
  if (!context.fn.body) return;
  const declarations: ts.VariableDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    ts.forEachChild(node, collect);
  };
  collect(context.fn.body);
  let changed = true;
  for (let pass = 0; changed && pass < 8; pass += 1) {
    changed = false;
    for (const declaration of declarations) {
      const source = transparentProps(declaration.initializer, context);
      if (!source) continue;
      if (ts.isIdentifier(declaration.name) && !propsObject(context, declaration.name.text)) {
        context.propsObjects.push({ name: declaration.name.text, excluded: new Set(source.excluded) });
        changed = true;
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        changed = applyBinding(declaration.name, source, context) || changed;
      }
    }
  }
  collectFormFields(context, declarations);
}

export function collectSemanticComponents(sourceFile: ts.SourceFile): SemanticComponentContext[] {
  const contexts: SemanticComponentContext[] = [];
  const add = (name: string, fn: FunctionNode): void => {
    const context: SemanticComponentContext = {
      name,
      fn,
      ...publicBindings(fn),
      formFields: new Map(),
    };
    enrich(context);
    contexts.push(context);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) add(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text)) {
      const fn = nestedFunction(node.initializer);
      if (fn) add(node.name.text, fn);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return contexts;
}

export function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) current = current.expression;
  return current;
}

export function directPublicProp(expression: ts.Expression, context: SemanticComponentContext): string | undefined {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) return context.localToPublic.get(current.text);
  if (
    ts.isPropertyAccessExpression(current) &&
    ts.isIdentifier(current.expression) &&
    propsObject(context, current.expression.text)
  ) return current.name.text;
  return undefined;
}

export function booleanBinding(expression: ts.Expression, context: SemanticComponentContext): BooleanBinding | undefined {
  const current = unwrap(expression);
  const direct = directPublicProp(current, context);
  if (direct) return { prop: direct, inverted: false };
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
    const nested = booleanBinding(current.operand, context);
    return nested ? { prop: nested.prop, inverted: !nested.inverted } : undefined;
  }
  if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === 'Boolean' && current.arguments[0]) {
    return booleanBinding(current.arguments[0], context);
  }
  return undefined;
}

export function formFieldBinding(expression: ts.Expression, context: SemanticComponentContext): FormFieldBinding | undefined {
  const current = unwrap(expression);
  if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === 'Boolean' && current.arguments[0]) {
    return formFieldBinding(current.arguments[0], context);
  }
  if (
    ts.isPropertyAccessExpression(current) &&
    current.name.text === 'value' &&
    ts.isIdentifier(current.expression)
  ) return context.formFields.get(current.expression.text);
  return undefined;
}

export function attributeExpression(node: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined {
  const attribute = getAttribute(node, name);
  return attribute?.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
}

export function stringAttribute(node: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = getAttribute(node, name);
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
}

export function forwardsProp(node: ts.JsxOpeningLikeElement, prop: string, context: SemanticComponentContext): boolean {
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

export function forwardsFormField(node: ts.JsxOpeningLikeElement, context: SemanticComponentContext): FormFieldBinding | undefined {
  let result: FormFieldBinding | undefined;
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === 'value') {
      result = undefined;
      continue;
    }
    if (!ts.isJsxSpreadAttribute(property)) continue;
    if (ts.isIdentifier(property.expression)) {
      const binding = context.formFields.get(property.expression.text);
      if (binding) {
        result = binding;
        continue;
      }
    }
    result = undefined;
  }
  return result;
}
