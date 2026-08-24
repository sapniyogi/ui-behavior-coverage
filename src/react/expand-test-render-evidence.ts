import ts from 'typescript';

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

interface Replacement {
  start: number;
  end: number;
  text: string;
}

function applyReplacements(source: string, replacements: Replacement[]): string {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let result = source;
  let previousStart = source.length + 1;
  for (const replacement of ordered) {
    if (replacement.end > previousStart) continue;
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
    previousStart = replacement.start;
  }
  return result;
}

function containingStatement(node: ts.Node, container: ts.Block | ts.SourceFile): ts.Statement | undefined {
  let current: ts.Node | undefined = node;
  while (current && current.parent !== container) current = current.parent;
  return current && ts.isStatement(current) ? current : undefined;
}

function functionFromVariableStatement(
  statement: ts.VariableStatement,
  name: string,
): FunctionNode | undefined {
  for (const declaration of statement.declarationList.declarations) {
    if (
      !ts.isIdentifier(declaration.name) ||
      declaration.name.text !== name ||
      !declaration.initializer ||
      (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))
    ) continue;
    return declaration.initializer;
  }
  return undefined;
}

function localFunction(anchor: ts.Node, name: string): FunctionNode | undefined {
  let child: ts.Node = anchor;
  let parent: ts.Node | undefined = anchor.parent;

  while (parent) {
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      for (const statement of parent.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
          return statement;
        }
      }

      const boundary = containingStatement(child, parent);
      for (const statement of parent.statements) {
        if (boundary && statement === boundary) break;
        if (!ts.isVariableStatement(statement)) continue;
        const fn = functionFromVariableStatement(statement, name);
        if (fn) return fn;
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

function unsafeControlFlow(node: ts.Node): boolean {
  return ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    logicalControlFlow(node) ||
    ts.isSwitchStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node);
}

function callIsUnconditional(call: ts.CallExpression, body: ts.Node): boolean {
  let current: ts.Node | undefined = call.parent;
  while (current && current !== body) {
    if (
      unsafeControlFlow(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) return false;
    current = current.parent;
  }
  return current === body;
}

function renderCallSummary(fn: FunctionNode): { total: number; safe: number } {
  if (!fn.body) return { total: 0, safe: 0 };
  let total = 0;
  let safe = 0;
  const root = fn.body;
  const visit = (node: ts.Node, unsafe: boolean, isRoot: boolean): void => {
    const nextUnsafe = unsafe ||
      unsafeControlFlow(node) ||
      (!isRoot && (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ));

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'render'
    ) {
      total += 1;
      if (!nextUnsafe) safe += 1;
    }
    ts.forEachChild(node, (child) => visit(child, nextUnsafe, false));
  };
  visit(root, false, true);
  return { total, safe };
}

function inlineHelperCall(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
  fn: FunctionNode,
): string | undefined {
  if (!fn.body) return undefined;
  const summary = renderCallSummary(fn);
  if (summary.total !== 1 || summary.safe !== 1) return undefined;
  if (call.arguments.some((argument) => ts.isSpreadElement(argument))) return undefined;

  const bindings: string[] = [];
  for (let index = 0; index < fn.parameters.length; index += 1) {
    const parameter = fn.parameters[index]!;
    if (!ts.isIdentifier(parameter.name)) return undefined;
    const supplied = call.arguments[index];
    const expression = supplied ?? parameter.initializer;
    bindings.push(
      `const ${parameter.name.text} = ${expression ? expression.getText(sourceFile) : 'undefined'};`,
    );
  }

  const body = ts.isBlock(fn.body)
    ? fn.body.statements.map((statement) => statement.getText(sourceFile)).join('\n')
    : `return ${fn.body.getText(sourceFile)};`;

  return `(() => {\n${bindings.join('\n')}\n${body}\n})()`;
}

function isTestCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'test' || node.expression.text === 'it');
}

function expandLocalRenderHelpers(source: string): string {
  const sourceFile = ts.createSourceFile(
    'component.test.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const replacements: Replacement[] = [];

  const visit = (node: ts.Node): void => {
    if (isTestCall(node)) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const body = callback.body;
        const visitBody = (candidate: ts.Node): void => {
          if (
            ts.isCallExpression(candidate) &&
            ts.isIdentifier(candidate.expression) &&
            candidate.expression.text !== 'render' &&
            candidate.expression.text !== 'rerender' &&
            callIsUnconditional(candidate, body)
          ) {
            const fn = localFunction(candidate, candidate.expression.text);
            const expanded = fn ? inlineHelperCall(sourceFile, candidate, fn) : undefined;
            if (expanded) {
              replacements.push({
                start: candidate.getStart(sourceFile),
                end: candidate.getEnd(),
                text: expanded,
              });
              return;
            }
          }
          ts.forEachChild(candidate, visitBody);
        };
        visitBody(body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return applyReplacements(source, replacements);
}

function collectRerenderBindings(body: ts.Node): {
  identifiers: Set<string>;
  renderResults: Set<string>;
} {
  const identifiers = new Set<string>();
  const renderResults = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'render'
      ) {
        if (ts.isIdentifier(node.name)) renderResults.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
            const publicName = element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
            if (publicName === 'rerender') identifiers.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return { identifiers, renderResults };
}

function normalizeRerenders(source: string): string {
  const sourceFile = ts.createSourceFile(
    'component.test.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const replacements: Replacement[] = [];

  const visit = (node: ts.Node): void => {
    if (isTestCall(node)) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const body = callback.body;
        const bindings = collectRerenderBindings(body);
        const visitBody = (candidate: ts.Node): void => {
          if (ts.isCallExpression(candidate) && callIsUnconditional(candidate, body)) {
            if (
              ts.isIdentifier(candidate.expression) &&
              bindings.identifiers.has(candidate.expression.text)
            ) {
              replacements.push({
                start: candidate.expression.getStart(sourceFile),
                end: candidate.expression.getEnd(),
                text: 'render',
              });
            } else if (
              ts.isPropertyAccessExpression(candidate.expression) &&
              candidate.expression.name.text === 'rerender' &&
              ts.isIdentifier(candidate.expression.expression) &&
              bindings.renderResults.has(candidate.expression.expression.text)
            ) {
              replacements.push({
                start: candidate.expression.getStart(sourceFile),
                end: candidate.expression.getEnd(),
                text: 'render',
              });
            }
          }
          ts.forEachChild(candidate, visitBody);
        };
        visitBody(body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return applyReplacements(source, replacements);
}

/**
 * Expands only statically safe, locally invoked render helpers and proven
 * Testing Library rerender bindings. This produces additional render-shaped
 * evidence for the existing semantic analyzer without changing scoring rules.
 */
export function expandTestRenderEvidence(source: string): string {
  return normalizeRerenders(expandLocalRenderHelpers(source));
}
