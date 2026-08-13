import ts from 'typescript';

export interface AttributeValue {
  kind: 'true' | 'false' | 'identifier' | 'other';
  text?: string;
}

export function jsxTagName(node: ts.JsxOpeningLikeElement): string | undefined {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
}

export function getAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name) {
      return property;
    }
  }
  return undefined;
}

export function readAttributeValue(attribute: ts.JsxAttribute): AttributeValue {
  if (!attribute.initializer) return { kind: 'true' };
  if (ts.isStringLiteral(attribute.initializer)) return { kind: 'other', text: attribute.initializer.text };
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return { kind: 'other' };

  const expression = attribute.initializer.expression;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true' };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'false' };
  if (ts.isIdentifier(expression)) return { kind: 'identifier', text: expression.text };
  return { kind: 'other', text: expression.getText() };
}

export function identifierAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): string | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute) return undefined;
  const value = readAttributeValue(attribute);
  return value.kind === 'identifier' ? value.text : undefined;
}

export function componentNameForNode(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return undefined;
}

export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
