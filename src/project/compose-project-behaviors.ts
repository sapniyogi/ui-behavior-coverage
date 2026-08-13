import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import type {
  BehaviorCondition,
  BehaviorContract,
  BehaviorExpectation,
} from '../core/model';
import { extractComponentBehaviors } from '../react/extract-component-behaviors';
import {
  parseProjectSourceFile,
  readProjectCompilerOptions,
  resolveProjectModuleFile,
  traceProjectExport,
  type ProjectModuleResolverOptions,
} from './module-resolver';

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

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

interface ImportBinding {
  localName: string;
  importedName?: string;
  isDefault: boolean;
  moduleSpecifier: string;
}

interface PublicBooleanBinding {
  prop: string;
  inverted: boolean;
}

interface TruthyDependency {
  prop: string;
  when: boolean;
}

interface EffectivePropMapping {
  kind: 'expression' | 'identity' | 'unknown';
  expression?: ts.Expression;
}

export interface ResolveProjectComponentBehaviorsOptions extends ProjectModuleResolverOptions {
  /** Safety bound for recursive local component composition. */
  maxDepth?: number;
}

export interface ResolveProjectComponentBehaviorsInput {
  rootDir: string;
  componentFile: string;
  componentNames: readonly string[];
  options?: ResolveProjectComponentBehaviorsOptions;
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

function findComponentContext(sourceFile: ts.SourceFile, componentName: string): ComponentContext | undefined {
  let found: FunctionNode | undefined;

  const visit = (node: ts.Node): void => {
    if (found) return;

    if (ts.isFunctionDeclaration(node) && node.name?.text === componentName) {
      found = node;
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === componentName) {
      found = nestedFunctionFromInitializer(node.initializer);
      if (found) return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (!found) return undefined;

  const bindings = collectPublicBindings(found);
  const context: ComponentContext = {
    name: componentName,
    fn: found,
    ...bindings,
    forwardedHandlers: new Map(),
  };
  collectForwardedHandlers(context);
  return context;
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

function publicBooleanBinding(expression: ts.Expression, context: ComponentContext): PublicBooleanBinding | undefined {
  const current = unwrapExpression(expression);
  const direct = directPublicProp(current, context);
  if (direct) return { prop: direct, inverted: false };

  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
    const nested = publicBooleanBinding(current.operand, context);
    return nested ? { prop: nested.prop, inverted: !nested.inverted } : undefined;
  }

  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === 'Boolean' &&
    current.arguments[0]
  ) {
    return publicBooleanBinding(current.arguments[0], context);
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
  const binding = publicBooleanBinding(current, context);
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

function directPublicCallback(expression: ts.Expression, context: ComponentContext): string | undefined {
  return directPublicProp(expression, context);
}

function collectForwardedHandlers(context: ComponentContext): void {
  const candidates: Array<{ name: string; fn: FunctionNode }> = [];

  const visitCandidates = (node: ts.Node): void => {
    if (node !== context.fn && ts.isFunctionDeclaration(node) && node.name) {
      candidates.push({ name: node.name.text, fn: node });
      return;
    }

    if (
      node !== context.fn &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name)
    ) {
      const fn = nestedFunctionFromInitializer(node.initializer);
      if (fn) {
        candidates.push({ name: node.name.text, fn });
        return;
      }
    }

    ts.forEachChild(node, visitCandidates);
  };

  if (context.fn.body) ts.forEachChild(context.fn.body, visitCandidates);

  for (const candidate of candidates) {
    const callbacks = new Set<string>();
    const visitCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callback = directPublicCallback(node.expression, context);
        if (callback) callbacks.add(callback);
      }
      ts.forEachChild(node, visitCalls);
    };
    if (candidate.fn.body) visitCalls(candidate.fn.body);
    if (callbacks.size === 1) context.forwardedHandlers.set(candidate.name, [...callbacks][0]!);
  }
}

function publicCallback(expression: ts.Expression, context: ComponentContext): string | undefined {
  const direct = directPublicProp(expression, context);
  if (direct) return direct;

  const current = unwrapExpression(expression);
  return ts.isIdentifier(current) ? context.forwardedHandlers.get(current.text) : undefined;
}

function collectImports(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const moduleSpecifier = statement.moduleSpecifier.text;

    if (clause.name) {
      bindings.set(clause.name.text, {
        localName: clause.name.text,
        isDefault: true,
        moduleSpecifier,
      });
    }

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (element.isTypeOnly) continue;
        bindings.set(element.name.text, {
          localName: element.name.text,
          importedName: element.propertyName?.text ?? element.name.text,
          isDefault: false,
          moduleSpecifier,
        });
      }
    }
  }

  return bindings;
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string | undefined {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
}

function effectivePropMapping(
  node: ts.JsxOpeningLikeElement,
  childProp: string,
  context: ComponentContext,
): EffectivePropMapping | undefined {
  let effective: EffectivePropMapping | undefined;

  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property)) {
      if (!ts.isIdentifier(property.name) || property.name.text !== childProp) continue;
      if (!property.initializer) {
        effective = { kind: 'unknown' };
        continue;
      }
      if (ts.isJsxExpression(property.initializer) && property.initializer.expression) {
        effective = { kind: 'expression', expression: property.initializer.expression };
      } else {
        effective = { kind: 'unknown' };
      }
      continue;
    }

    if (!ts.isJsxSpreadAttribute(property)) continue;
    if (ts.isIdentifier(property.expression)) {
      const binding = propsObject(context, property.expression.text);
      if (binding && !binding.excluded.has(childProp)) {
        effective = { kind: 'identity' };
        continue;
      }
    }

    // An unresolved spread after a known mapping may override it. Refuse to guess.
    effective = { kind: 'unknown' };
  }

  return effective;
}

function mapCondition(
  childCondition: BehaviorCondition,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
): BehaviorCondition[] {
  const mapping = effectivePropMapping(node, childCondition.prop, context);
  if (!mapping || mapping.kind === 'unknown') return [];

  if (mapping.kind === 'identity') return [{ ...childCondition }];
  const expression = mapping.expression;
  if (!expression) return [];

  if (childCondition.value === 'bound') {
    const prop = directPublicProp(expression, context);
    return prop ? [{ prop, value: 'bound' }] : [];
  }

  const simple = publicBooleanBinding(expression, context);
  if (simple) {
    return [{
      prop: simple.prop,
      value: simple.inverted ? !childCondition.value : childCondition.value,
    }];
  }

  // For OR/equality expressions we can safely promote only the child=true case.
  // A child=false OR condition would require a conjunction, which the current
  // single-prop BehaviorCondition model cannot express without overstating proof.
  if (childCondition.value) {
    return (truthyDependencies(expression, context) ?? []).map((dependency) => ({
      prop: dependency.prop,
      value: dependency.when,
    }));
  }

  return [];
}

function mapCallback(
  childCallbackProp: string,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
): string | undefined {
  const mapping = effectivePropMapping(node, childCallbackProp, context);
  if (!mapping || mapping.kind === 'unknown') return undefined;
  if (mapping.kind === 'identity') return childCallbackProp;
  return mapping.expression ? publicCallback(mapping.expression, context) : undefined;
}

function remapExpectation(expectation: BehaviorExpectation, callbackProp: string): BehaviorExpectation {
  if (expectation.type === 'callback-not-called') return { ...expectation, callbackProp };
  if (expectation.type === 'callback-event-boolean') {
    return { ...expectation, callbackProp, path: [...expectation.path] };
  }
  return { ...expectation, callbackProp, path: [...expectation.path] };
}

function remapBehavior(
  behavior: BehaviorContract,
  parentName: string,
  node: ts.JsxOpeningLikeElement,
  context: ComponentContext,
  sourceFile: ts.SourceFile,
): BehaviorContract[] {
  const conditions = mapCondition(behavior.condition, node, context);
  const callbackProp = mapCallback(behavior.expectation.callbackProp, node, context);
  if (conditions.length === 0 || !callbackProp) return [];

  return conditions.map((condition) => ({
    ...behavior,
    id: `${parentName}:project-composed:${behavior.id}:${condition.prop}:${String(condition.value)}:${callbackProp}`,
    componentName: parentName,
    title: behavior.title
      .replace(behavior.condition.prop, condition.prop)
      .replace(behavior.expectation.callbackProp, callbackProp),
    condition,
    event: { ...behavior.event, handlerProp: callbackProp },
    expectation: remapExpectation(behavior.expectation, callbackProp),
    evidence: {
      fileName: sourceFile.fileName,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      snippet: node.getText(sourceFile),
    },
  }));
}

function expectationKey(expectation: BehaviorExpectation): string {
  if (expectation.type === 'callback-not-called') return `${expectation.type}:${expectation.callbackProp}`;
  if (expectation.type === 'callback-event-boolean') {
    return `${expectation.type}:${expectation.callbackProp}:${expectation.path.join('.')}:${expectation.value}`;
  }
  return `${expectation.type}:${expectation.callbackProp}:${expectation.path.join('.')}`;
}

function semanticKey(behavior: BehaviorContract): string {
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

function dedupe(behaviors: BehaviorContract[]): BehaviorContract[] {
  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    const key = semanticKey(behavior);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveProjectComponentBehaviors(
  input: ResolveProjectComponentBehaviorsInput,
): BehaviorContract[] {
  const rootDir = input.rootDir;
  const compilerOptions = readProjectCompilerOptions(rootDir, input.options);
  const maxDepth = input.options?.maxDepth ?? 8;
  const cache = new Map<string, BehaviorContract[]>();
  const resolving = new Set<string>();

  const resolveOne = (file: string, componentName: string, depth: number): BehaviorContract[] => {
    const key = `${file}::${componentName}`;
    const cached = cache.get(key);
    if (cached) return cached;
    if (resolving.has(key) || depth > maxDepth) return [];
    resolving.add(key);

    const sourceText = readFileSync(file, 'utf8');
    const relativeFile = relative(rootDir, file) || file;
    const direct = extractComponentBehaviors(sourceText, relativeFile)
      .filter((behavior) => behavior.componentName === componentName);
    const sourceFile = parseProjectSourceFile(file);
    const context = findComponentContext(sourceFile, componentName);
    if (!context) {
      const result = dedupe(direct);
      cache.set(key, result);
      resolving.delete(key);
      return result;
    }

    const imports = collectImports(sourceFile);
    const composed: BehaviorContract[] = [...direct];

    const visit = (node: ts.Node): void => {
      if (node !== context.fn && (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      )) {
        // Local helper callbacks cannot introduce rendered child component edges.
        // Handler forwarding has already been summarized separately.
        return;
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTagName(node);
        const binding = tag ? imports.get(tag) : undefined;
        if (binding) {
          const resolvedModule = resolveProjectModuleFile(
            file,
            binding.moduleSpecifier,
            rootDir,
            compilerOptions,
          );

          if (resolvedModule.file) {
            const child = traceProjectExport(
              resolvedModule.file,
              binding.isDefault ? undefined : binding.importedName,
              rootDir,
              compilerOptions,
            );

            if (child) {
              const childBehaviors = resolveOne(child.file, child.componentName, depth + 1);
              for (const childBehavior of childBehaviors) {
                composed.push(...remapBehavior(childBehavior, componentName, node, context, sourceFile));
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    if (context.fn.body) visit(context.fn.body);

    const result = dedupe(composed);
    cache.set(key, result);
    resolving.delete(key);
    return result;
  };

  return dedupe(input.componentNames.flatMap((componentName) =>
    resolveOne(input.componentFile, componentName, 0),
  ));
}
