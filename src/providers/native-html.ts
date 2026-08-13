import ts from 'typescript';
import type { BehaviorContract } from '../core/model';
import type { BehaviorProvider } from './types';
import {
  componentNameForNode,
  getAttribute,
  jsxTagName,
  lineOf,
  readAttributeValue,
} from './shared';

const nativeElementsWithDisabledSemantics = new Set([
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'optgroup',
  'fieldset',
]);

export const nativeHtmlBehaviorProvider: BehaviorProvider = {
  name: 'native-html',
  extract(sourceFile): BehaviorContract[] {
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
                provider: 'native-html',
                kind: 'native-disabled-event-suppression',
                title: `${disabledValue.text}=true prevents ${onClickValue.text} activation`,
                condition: { prop: disabledValue.text, value: true },
                event: { handlerProp: onClickValue.text, eventName: 'click' },
                expectation: { type: 'callback-not-called', callbackProp: onClickValue.text },
                evidence: {
                  fileName: sourceFile.fileName,
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
  },
};
