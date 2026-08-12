import ts from 'typescript';
import type { BehaviorContract } from '../core/model';

interface AttributeValue {
  kind: 'true' | 'false' | 'identifier' | 'other';
  text?: string;
}

const nativeElementsWithDisabledSemantics = new Set([
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'optgroup',
  'fieldset',
]);

function jsxTagName(node: ts.JsxOpeningLikeElement): string | undefined {
  if (ts.isIdentifier(node.tagName)) return node.tagName.text;
  return undefined;
}

function getAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name) return property;
  }
  return undefined;
}

function readAttributeValue(attribute: ts.JsxAttribute): AttributeValue {
  if (!attribute.initializer) return { kind: 'true' };

  if (ts.isStringLiteral(attribute.initializer)) {
    return { kind: 'other', text: attribute.initializer.text };
  }

  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    return { kind: 'other' };
  }

  const expression = attribute.initializer.expression;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true' };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'false' };
  if (ts.isIdentifier(expression)) return { kind: 'identifier', text: expression.text };

  return { kind: 'other', text: expression.getText() };
}

function componentNameForNode(node: ts.Node): string | undefined {
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

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function extractComponentBehaviors(
  sourceText: string,
  fileName = 'component.tsx',
): BehaviorContract[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const behaviors: BehaviorContract[] = [];

  const visit = (node: ts.Node, currentComponent?: string): void => {
    const componentName = componentNameForNode(node) ?? currentComponent;

    if (componentName && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tagName = jsxTagName(node);
      if (tagName && nativeElementsWithDisabledSemantics.has(tagName)) {
        const disabledAttribute = getAttribute(node, 'disabled');
        const onClickAttribute = getAttribute(node, 'onClick');

        if (disabledAttribute && onClickAttribute) {
          const disabledValue = readAttributeValue(disabledAttribute);
          const onClickValue = readAttributeValue(onClickAttribute);

          if (
            disabledValue.kind === 'identifier' &&
            disabledValue.text &&
            onClickValue.kind === 'identifier' &&
            onClickValue.text
          ) {
            behaviors.push({
              id: `${componentName}:${disabledValue.text}:${onClickValue.text}:click-suppressed`,
              componentName,
              kind: 'native-disabled-event-suppression',
              title: `${disabledValue.text}=true prevents ${onClickValue.text} activation`,
              condition: {
                prop: disabledValue.text,
                value: true,
              },
              event: {
                handlerProp: onClickValue.text,
                eventName: 'click',
              },
              expectation: {
                type: 'callback-not-called',
                callbackProp: onClickValue.text,
              },
              evidence: {
                fileName,
                line: lineOf(sourceFile, node),
                snippet: node.getText(sourceFile),
              },
            });
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, componentName));
  };

  visit(sourceFile);

  return behaviors;
}
