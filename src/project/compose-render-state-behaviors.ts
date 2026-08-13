import ts from 'typescript';
import type { BehaviorCondition, RenderStateBehaviorContract } from '../core/model';
import { extractMaterialUiRenderStateBehaviors } from './material-ui-render-state';
import { extractMaterialUiSemanticBehaviors } from './material-ui-semantic-state';
import { parseProjectSourceFile, readProjectCompilerOptions, resolveProjectModuleFile, traceProjectExport, type ProjectModuleResolverOptions } from './module-resolver';

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
interface PropsObjectBinding { name: string; excluded: Set<string>; }
interface ComponentContext { name: string; fn: FunctionNode; localToPublic: Map<string, string>; propsObjects: PropsObjectBinding[]; }
interface ImportBinding { importedName?: string; isDefault: boolean; moduleSpecifier: string; }
interface EffectiveMapping { kind: 'expression' | 'identity' | 'unknown'; expression?: ts.Expression; }
export interface ResolveProjectRenderStateOptions extends ProjectModuleResolverOptions { maxDepth?: number; }
export interface ResolveProjectRenderStateInput { rootDir: string; componentFile: string; componentNames: readonly string[]; options?: ResolveProjectRenderStateOptions; }

function nestedFunction(expression: ts.Expression | undefined): FunctionNode | undefined {
  if (!expression) return undefined;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isCallExpression(expression)) return undefined;
  for (const argument of expression.arguments) if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
  return ts.isCallExpression(expression.expression) ? nestedFunction(expression.expression) : undefined;
}

function bindings(fn: FunctionNode): Pick<ComponentContext, 'localToPublic' | 'propsObjects'> {
  const localToPublic = new Map<string, string>();
  const propsObjects: PropsObjectBinding[] = [];
  const parameter = fn.parameters[0];
  if (!parameter) return { localToPublic, propsObjects };
  if (ts.isIdentifier(parameter.name)) { propsObjects.push({ name: parameter.name.text, excluded: new Set() }); return { localToPublic, propsObjects }; }
  if (!ts.isObjectBindingPattern(parameter.name)) return { localToPublic, propsObjects };
  const excluded = new Set<string>();
  for (const element of parameter.name.elements) {
    if (element.dotDotDotToken && ts.isIdentifier(element.name)) { propsObjects.push({ name: element.name.text, excluded: new Set(excluded) }); continue; }
    const publicName = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName)) ? element.propertyName.text : ts.isIdentifier(element.name) ? element.name.text : undefined;
    if (!publicName) continue;
    excluded.add(publicName);
    if (ts.isIdentifier(element.name)) localToPublic.set(element.name.text, publicName);
  }
  return { localToPublic, propsObjects };
}

function componentContext(sourceFile: ts.SourceFile, name: string): ComponentContext | undefined {
  let fn: FunctionNode | undefined;
  const visit = (node: ts.Node): void => {
    if (fn) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) { fn = node; return; }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) { fn = nestedFunction(node.initializer); if (fn) return; }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fn ? { name, fn, ...bindings(fn) } : undefined;
}

function imports(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const result = new Map<string, ImportBinding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const moduleSpecifier = statement.moduleSpecifier.text;
    if (clause.name) result.set(clause.name.text, { isDefault: true, moduleSpecifier });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const element of clause.namedBindings.elements) if (!element.isTypeOnly) result.set(element.name.text, { importedName: element.propertyName?.text ?? element.name.text, isDefault: false, moduleSpecifier });
  }
  return result;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) current = current.expression;
  return current;
}
function propsObject(context: ComponentContext, name: string): PropsObjectBinding | undefined { return context.propsObjects.find((binding) => binding.name === name); }
function directProp(expression: ts.Expression, context: ComponentContext): string | undefined {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) return context.localToPublic.get(current.text);
  if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression) && propsObject(context, current.expression.text)) return current.name.text;
  return undefined;
}
function booleanBinding(expression: ts.Expression, context: ComponentContext): { prop: string; inverted: boolean } | undefined {
  const current = unwrap(expression);
  const direct = directProp(current, context);
  if (direct) return { prop: direct, inverted: false };
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) { const nested = booleanBinding(current.operand, context); return nested ? { prop: nested.prop, inverted: !nested.inverted } : undefined; }
  if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === 'Boolean' && current.arguments[0]) return booleanBinding(current.arguments[0], context);
  return undefined;
}
function booleanLiteral(expression: ts.Expression): boolean | undefined { const current = unwrap(expression); return current.kind === ts.SyntaxKind.TrueKeyword ? true : current.kind === ts.SyntaxKind.FalseKeyword ? false : undefined; }
function truthyDependencies(expression: ts.Expression, context: ComponentContext): Array<{ prop: string; when: boolean }> | undefined {
  const current = unwrap(expression);
  const binding = booleanBinding(current, context);
  if (binding) return [{ prop: binding.prop, when: !binding.inverted }];
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.BarBarToken) { const left = truthyDependencies(current.left, context); const right = truthyDependencies(current.right, context); return left && right ? [...left, ...right] : undefined; }
  if (!ts.isBinaryExpression(current)) return undefined;
  const equality = current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;
  const inequality = current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken;
  if (!equality && !inequality) return undefined;
  const leftProp = directProp(current.left, context); const rightProp = directProp(current.right, context); const leftBool = booleanLiteral(current.left); const rightBool = booleanLiteral(current.right);
  if (leftProp && rightBool !== undefined) return [{ prop: leftProp, when: equality ? rightBool : !rightBool }];
  if (rightProp && leftBool !== undefined) return [{ prop: rightProp, when: equality ? leftBool : !leftBool }];
  return undefined;
}
function mapping(node: ts.JsxOpeningLikeElement, childProp: string, context: ComponentContext): EffectiveMapping | undefined {
  let effective: EffectiveMapping | undefined;
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property)) {
      if (!ts.isIdentifier(property.name) || property.name.text !== childProp) continue;
      effective = property.initializer && ts.isJsxExpression(property.initializer) && property.initializer.expression ? { kind: 'expression', expression: property.initializer.expression } : { kind: 'unknown' };
      continue;
    }
    if (!ts.isJsxSpreadAttribute(property)) continue;
    if (ts.isIdentifier(property.expression)) { const binding = propsObject(context, property.expression.text); if (binding && !binding.excluded.has(childProp)) { effective = { kind: 'identity' }; continue; } }
    effective = { kind: 'unknown' };
  }
  return effective;
}
function mapCondition(condition: BehaviorCondition, node: ts.JsxOpeningLikeElement, context: ComponentContext): BehaviorCondition[] {
  const mapped = mapping(node, condition.prop, context);
  if (!mapped || mapped.kind === 'unknown') return [];
  if (mapped.kind === 'identity') return [{ ...condition }];
  if (!mapped.expression) return [];
  if (condition.value === 'bound') { const prop = directProp(mapped.expression, context); return prop ? [{ prop, value: 'bound' }] : []; }
  const simple = booleanBinding(mapped.expression, context);
  if (simple) return [{ prop: simple.prop, value: simple.inverted ? !condition.value : condition.value }];
  if (!condition.value) return [];
  return (truthyDependencies(mapped.expression, context) ?? []).map((dependency) => ({ prop: dependency.prop, value: dependency.when }));
}
function remap(behavior: RenderStateBehaviorContract, parentName: string, node: ts.JsxOpeningLikeElement, context: ComponentContext, sourceFile: ts.SourceFile): RenderStateBehaviorContract[] {
  return mapCondition(behavior.condition, node, context).map((condition) => ({ ...behavior, id: `${parentName}:project-render:${behavior.id}:${condition.prop}:${String(condition.value)}`, componentName: parentName, title: behavior.title.replace(behavior.condition.prop, condition.prop), condition, evidence: { fileName: sourceFile.fileName, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, snippet: node.getText(sourceFile) } }));
}
function key(behavior: RenderStateBehaviorContract): string { return [behavior.componentName, behavior.kind, behavior.condition.prop, String(behavior.condition.value), JSON.stringify(behavior.expectation)].join('|'); }
function dedupe(behaviors: RenderStateBehaviorContract[]): RenderStateBehaviorContract[] { const seen = new Set<string>(); return behaviors.filter((behavior) => { const semantic = key(behavior); if (seen.has(semantic)) return false; seen.add(semantic); return true; }); }

export function resolveProjectRenderStateBehaviors(input: ResolveProjectRenderStateInput): RenderStateBehaviorContract[] {
  const compilerOptions = readProjectCompilerOptions(input.rootDir, input.options);
  const maxDepth = input.options?.maxDepth ?? 8;
  const cache = new Map<string, RenderStateBehaviorContract[]>();
  const resolving = new Set<string>();
  const resolveOne = (file: string, name: string, depth: number): RenderStateBehaviorContract[] => {
    const cacheKey = `${file}::${name}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    if (resolving.has(cacheKey) || depth > maxDepth) return [];
    resolving.add(cacheKey);
    const sourceFile = parseProjectSourceFile(file);
    const direct = [...extractMaterialUiRenderStateBehaviors(sourceFile), ...extractMaterialUiSemanticBehaviors(sourceFile)].filter((behavior) => behavior.componentName === name);
    const context = componentContext(sourceFile, name);
    if (!context) { const result = dedupe(direct); cache.set(cacheKey, result); resolving.delete(cacheKey); return result; }
    const imported = imports(sourceFile);
    const result: RenderStateBehaviorContract[] = [...direct];
    const visit = (node: ts.Node): void => {
      if (node !== context.fn && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) return;
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
        const binding = tag ? imported.get(tag) : undefined;
        if (binding) {
          const module = resolveProjectModuleFile(file, binding.moduleSpecifier, input.rootDir, compilerOptions);
          if (module.file) {
            const child = traceProjectExport(module.file, binding.isDefault ? undefined : binding.importedName, input.rootDir, compilerOptions);
            if (child) for (const childBehavior of resolveOne(child.file, child.componentName, depth + 1)) result.push(...remap(childBehavior, name, node, context, sourceFile));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (context.fn.body) visit(context.fn.body);
    const composed = dedupe(result); cache.set(cacheKey, composed); resolving.delete(cacheKey); return composed;
  };
  return dedupe(input.componentNames.flatMap((name) => resolveOne(input.componentFile, name, 0)));
}
