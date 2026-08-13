import ts from 'typescript';
import type { BehaviorContract } from '../core/model';
import type { BehaviorProvider } from './types';
import {
  componentNameForNode,
  getAttribute,
  identifierAttribute,
  jsxTagName,
  lineOf,
  readAttributeValue,
} from './shared';

type SupportedMuiComponent = 'Button' | 'Checkbox';

function supportedComponentFromModule(moduleName: string): SupportedMuiComponent | undefined {
  if (moduleName === '@mui/material/Button') return 'Button';
  if (moduleName === '@mui/material/Checkbox') return 'Checkbox';
  return undefined;
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
      if (importedName === 'Button' || importedName === 'Checkbox') {
        bindings.set(element.name.text, importedName);
      }
    }
  }

  return bindings;
}

function pushSuppressionBehavior(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: 'mui-button-disabled-event-suppression' | 'mui-button-loading-event-suppression' | 'mui-checkbox-disabled-change-suppression',
  conditionBinding: string,
  callbackBinding: string,
  eventName: string,
): void {
  behaviors.push({
    id: `${componentName}:mui:${conditionBinding}:${callbackBinding}:${kind}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${conditionBinding}=true prevents ${callbackBinding} activation`,
    condition: { prop: conditionBinding, value: true },
    event: { handlerProp: callbackBinding, eventName },
    expectation: { type: 'callback-not-called', callbackProp: callbackBinding },
    evidence: {
      fileName: sourceFile.fileName,
      line: lineOf(sourceFile, node),
      snippet: node.getText(sourceFile),
    },
  });
}

function pushCheckboxToggleBehaviors(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  checkedBinding: string,
  callbackBinding: string,
): void {
  for (const initialValue of [false, true] as const) {
    const nextValue = !initialValue;
    behaviors.push({
      id: `${componentName}:mui:${checkedBinding}:${initialValue}:${callbackBinding}:checked-toggle`,
      componentName,
      provider: 'material-ui',
      kind: 'mui-checkbox-checked-toggle',
      title: `${checkedBinding}=${initialValue} toggles onChange event.target.checked to ${nextValue}`,
      condition: { prop: checkedBinding, value: initialValue },
      event: { handlerProp: callbackBinding, eventName: 'click' },
      expectation: {
        type: 'callback-event-boolean',
        callbackProp: callbackBinding,
        path: ['target', 'checked'],
        value: nextValue,
      },
      evidence: {
        fileName: sourceFile.fileName,
        line: lineOf(sourceFile, node),
        snippet: node.getText(sourceFile),
      },
    });
  }
}

export const materialUiBehaviorProvider: BehaviorProvider = {
  name: 'material-ui',
  extract(sourceFile): BehaviorContract[] {
    const imports = collectMuiImports(sourceFile);
    if (imports.size === 0) return [];

    const behaviors: BehaviorContract[] = [];

    const visit = (node: ts.Node, currentComponent?: string): void => {
      const componentName = componentNameForNode(node) ?? currentComponent;

      if (componentName && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
        const localTag = jsxTagName(node);
        const muiComponent = localTag ? imports.get(localTag) : undefined;

        if (muiComponent === 'Button') {
          const onClick = identifierAttribute(node, 'onClick');
          if (onClick) {
            const disabled = identifierAttribute(node, 'disabled');
            if (disabled) {
              pushSuppressionBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                'mui-button-disabled-event-suppression',
                disabled,
                onClick,
                'click',
              );
            }

            const loading = identifierAttribute(node, 'loading');
            if (loading) {
              pushSuppressionBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                'mui-button-loading-event-suppression',
                loading,
                onClick,
                'click',
              );
            }
          }
        } else if (muiComponent === 'Checkbox') {
          const onChange = identifierAttribute(node, 'onChange');
          if (onChange) {
            const disabled = identifierAttribute(node, 'disabled');
            if (disabled) {
              pushSuppressionBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                'mui-checkbox-disabled-change-suppression',
                disabled,
                onChange,
                'click',
              );
            }

            const checked = identifierAttribute(node, 'checked');
            if (checked) {
              pushCheckboxToggleBehaviors(behaviors, sourceFile, node, componentName, checked, onChange);
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

function booleanAttributeValue(node: ts.JsxOpeningLikeElement, name: string): boolean | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute) return undefined;
  const value = readAttributeValue(attribute);
  if (value.kind === 'true') return true;
  if (value.kind === 'false') return false;
  return undefined;
}

function isInsideRender(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === 'render'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function dedupeBehaviors(behaviors: BehaviorContract[]): BehaviorContract[] {
  const seen = new Set<string>();
  return behaviors.filter((behavior) => {
    if (seen.has(behavior.id)) return false;
    seen.add(behavior.id);
    return true;
  });
}

export function extractDirectMaterialUiTestBehaviors(
  sourceText: string,
  fileName = 'component.test.tsx',
): BehaviorContract[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports = collectMuiImports(sourceFile);
  const behaviors: BehaviorContract[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && isInsideRender(node)) {
      const localTag = jsxTagName(node);
      const muiComponent = localTag ? imports.get(localTag) : undefined;
      if (!localTag || !muiComponent) {
        ts.forEachChild(node, visit);
        return;
      }

      if (muiComponent === 'Button') {
        const callback = identifierAttribute(node, 'onClick');
        if (callback) {
          if (booleanAttributeValue(node, 'disabled') === true) {
            behaviors.push({
              id: `${fileName}:${localTag}:disabled:onClick`,
              componentName: localTag,
              provider: 'material-ui',
              kind: 'mui-button-disabled-event-suppression',
              title: 'disabled=true prevents onClick activation',
              condition: { prop: 'disabled', value: true },
              event: { handlerProp: 'onClick', eventName: 'click' },
              expectation: { type: 'callback-not-called', callbackProp: 'onClick' },
              evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
            });
          }
          if (booleanAttributeValue(node, 'loading') === true) {
            behaviors.push({
              id: `${fileName}:${localTag}:loading:onClick`,
              componentName: localTag,
              provider: 'material-ui',
              kind: 'mui-button-loading-event-suppression',
              title: 'loading=true prevents onClick activation',
              condition: { prop: 'loading', value: true },
              event: { handlerProp: 'onClick', eventName: 'click' },
              expectation: { type: 'callback-not-called', callbackProp: 'onClick' },
              evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
            });
          }
        }
      } else if (muiComponent === 'Checkbox') {
        const callback = identifierAttribute(node, 'onChange');
        if (callback) {
          if (booleanAttributeValue(node, 'disabled') === true) {
            behaviors.push({
              id: `${fileName}:${localTag}:disabled:onChange`,
              componentName: localTag,
              provider: 'material-ui',
              kind: 'mui-checkbox-disabled-change-suppression',
              title: 'disabled=true prevents onChange activation',
              condition: { prop: 'disabled', value: true },
              event: { handlerProp: 'onChange', eventName: 'click' },
              expectation: { type: 'callback-not-called', callbackProp: 'onChange' },
              evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
            });
          }

          const checked = booleanAttributeValue(node, 'checked');
          if (checked !== undefined) {
            behaviors.push({
              id: `${fileName}:${localTag}:checked:${checked}:onChange`,
              componentName: localTag,
              provider: 'material-ui',
              kind: 'mui-checkbox-checked-toggle',
              title: `checked=${checked} toggles onChange event.target.checked to ${!checked}`,
              condition: { prop: 'checked', value: checked },
              event: { handlerProp: 'onChange', eventName: 'click' },
              expectation: {
                type: 'callback-event-boolean',
                callbackProp: 'onChange',
                path: ['target', 'checked'],
                value: !checked,
              },
              evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return dedupeBehaviors(behaviors);
}
