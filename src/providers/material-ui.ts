import ts from 'typescript';
import type { BehaviorContract, BehaviorKind, DesignObservation } from '../core/model';
import type { BehaviorProvider } from './types';
import {
  componentNameForNode,
  getAttribute,
  identifierAttribute,
  jsxTagName,
  lineOf,
  readAttributeValue,
} from './shared';

type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

interface DirectComponentContext {
  name: string;
  localToPublicProp: Map<string, string>;
}

function directComponentContext(node: ts.Node): DirectComponentContext | undefined {
  const name = componentNameForNode(node);
  if (!name || !/^[A-Z]/.test(name)) return undefined;
  if (!ts.isFunctionDeclaration(node) && !ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) {
    return undefined;
  }

  const localToPublicProp = new Map<string, string>();
  const parameter = node.parameters[0];
  if (parameter && ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
      const propertyName = element.propertyName;
      const publicName = propertyName && (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))
        ? propertyName.text
        : element.name.text;
      localToPublicProp.set(element.name.text, publicName);
    }
  }

  return { name, localToPublicProp };
}

function directPublicBinding(
  context: DirectComponentContext | undefined,
  localName: string | undefined,
): string | undefined {
  return context && localName ? context.localToPublicProp.get(localName) : undefined;
}

type SupportedMuiComponent =
  | 'Button'
  | 'Checkbox'
  | 'Switch'
  | 'Radio'
  | 'TextField'
  | 'Select'
  | 'Box';

const supportedComponents = new Set<SupportedMuiComponent>([
  'Button',
  'Checkbox',
  'Switch',
  'Radio',
  'TextField',
  'Select',
  'Box',
]);

function supportedComponentFromModule(moduleName: string): SupportedMuiComponent | undefined {
  const prefix = '@mui/material/';
  if (!moduleName.startsWith(prefix)) return undefined;
  const name = moduleName.slice(prefix.length);
  return supportedComponents.has(name as SupportedMuiComponent)
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
      if (supportedComponents.has(importedName as SupportedMuiComponent)) {
        bindings.set(element.name.text, importedName as SupportedMuiComponent);
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
  kind: Extract<BehaviorKind,
    | 'mui-button-disabled-event-suppression'
    | 'mui-button-loading-event-suppression'
    | 'mui-checkbox-disabled-change-suppression'
    | 'mui-switch-disabled-change-suppression'
    | 'mui-radio-disabled-change-suppression'>,
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

function pushBooleanStateBehavior(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind,
    'mui-checkbox-checked-toggle' | 'mui-switch-checked-toggle' | 'mui-radio-checked-select'>,
  checkedBinding: string,
  callbackBinding: string,
  initialValue: boolean,
  nextValue: boolean,
): void {
  behaviors.push({
    id: `${componentName}:mui:${checkedBinding}:${initialValue}:${callbackBinding}:${kind}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${checkedBinding}=${initialValue} reports event.target.checked=${nextValue}`,
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

function pushToggleBehaviors(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind, 'mui-checkbox-checked-toggle' | 'mui-switch-checked-toggle'>,
  checkedBinding: string,
  callbackBinding: string,
): void {
  pushBooleanStateBehavior(
    behaviors,
    sourceFile,
    node,
    componentName,
    kind,
    checkedBinding,
    callbackBinding,
    false,
    true,
  );
  pushBooleanStateBehavior(
    behaviors,
    sourceFile,
    node,
    componentName,
    kind,
    checkedBinding,
    callbackBinding,
    true,
    false,
  );
}

function pushValueChangeBehavior(
  behaviors: BehaviorContract[],
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  componentName: string,
  kind: Extract<BehaviorKind, 'mui-text-field-value-change' | 'mui-select-native-value-change'>,
  valueBinding: string,
  callbackBinding: string,
  eventName: 'type' | 'selectOptions',
): void {
  behaviors.push({
    id: `${componentName}:mui:${valueBinding}:${callbackBinding}:${kind}`,
    componentName,
    provider: 'material-ui',
    kind,
    title: `${valueBinding} changes are reported through onChange event.target.value`,
    condition: { prop: valueBinding, value: 'bound' },
    event: { handlerProp: callbackBinding, eventName },
    expectation: {
      type: 'callback-event-path',
      callbackProp: callbackBinding,
      path: ['target', 'value'],
    },
    evidence: {
      fileName: sourceFile.fileName,
      line: lineOf(sourceFile, node),
      snippet: node.getText(sourceFile),
    },
  });
}

function sourceSelectIsAlwaysNative(node: ts.JsxOpeningLikeElement): boolean {
  const attribute = getAttribute(node, 'native');
  if (!attribute) return false;
  return readAttributeValue(attribute).kind === 'true';
}

export const materialUiBehaviorProvider: BehaviorProvider = {
  name: 'material-ui',
  extract(sourceFile): BehaviorContract[] {
    const imports = collectMuiImports(sourceFile);
    if (imports.size === 0) return [];

    const behaviors: BehaviorContract[] = [];

    const visit = (node: ts.Node, currentComponent?: DirectComponentContext): void => {
      const component = directComponentContext(node) ?? currentComponent;
      const componentName = component?.name;

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
        } else if (muiComponent === 'Checkbox' || muiComponent === 'Switch') {
          const onChange = identifierAttribute(node, 'onChange');
          if (onChange) {
            const disabled = identifierAttribute(node, 'disabled');
            if (disabled) {
              pushSuppressionBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                muiComponent === 'Checkbox'
                  ? 'mui-checkbox-disabled-change-suppression'
                  : 'mui-switch-disabled-change-suppression',
                disabled,
                onChange,
                'click',
              );
            }
            const checked = identifierAttribute(node, 'checked');
            const checkedProp = directPublicBinding(component, checked);
            const callbackProp = directPublicBinding(component, onChange);
            if (checkedProp && callbackProp) {
              pushToggleBehaviors(
                behaviors,
                sourceFile,
                node,
                componentName,
                muiComponent === 'Checkbox' ? 'mui-checkbox-checked-toggle' : 'mui-switch-checked-toggle',
                checkedProp,
                callbackProp,
              );
            }
          }
        } else if (muiComponent === 'Radio') {
          const onChange = identifierAttribute(node, 'onChange');
          if (onChange) {
            const disabled = identifierAttribute(node, 'disabled');
            if (disabled) {
              pushSuppressionBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                'mui-radio-disabled-change-suppression',
                disabled,
                onChange,
                'click',
              );
            }
            const checked = identifierAttribute(node, 'checked');
            const checkedProp = directPublicBinding(component, checked);
            const callbackProp = directPublicBinding(component, onChange);
            if (checkedProp && callbackProp) {
              // A radio is selected by clicking an unchecked option; clicking a checked radio
              // does not toggle it off, so only the false -> true direction is inferred.
              pushBooleanStateBehavior(
                behaviors,
                sourceFile,
                node,
                componentName,
                'mui-radio-checked-select',
                checkedProp,
                callbackProp,
                false,
                true,
              );
            }
          }
        } else if (muiComponent === 'TextField') {
          const onChange = identifierAttribute(node, 'onChange');
          const value = identifierAttribute(node, 'value');
          if (onChange && value) {
            pushValueChangeBehavior(
              behaviors,
              sourceFile,
              node,
              componentName,
              'mui-text-field-value-change',
              value,
              onChange,
              'type',
            );
          }
        } else if (muiComponent === 'Select' && sourceSelectIsAlwaysNative(node)) {
          const onChange = identifierAttribute(node, 'onChange');
          const value = identifierAttribute(node, 'value');
          if (onChange && value) {
            pushValueChangeBehavior(
              behaviors,
              sourceFile,
              node,
              componentName,
              'mui-select-native-value-change',
              value,
              onChange,
              'selectOptions',
            );
          }
        }
      }

      ts.forEachChild(node, (child) => visit(child, component));
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

function hasValueAttribute(node: ts.JsxOpeningLikeElement): boolean {
  return !!getAttribute(node, 'value');
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

function directSuppressionBehavior(
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  fileName: string,
  localTag: string,
  kind: Extract<BehaviorKind,
    | 'mui-button-disabled-event-suppression'
    | 'mui-button-loading-event-suppression'
    | 'mui-checkbox-disabled-change-suppression'
    | 'mui-switch-disabled-change-suppression'
    | 'mui-radio-disabled-change-suppression'>,
  conditionProp: string,
  callbackProp: string,
): BehaviorContract {
  return {
    id: `${fileName}:${localTag}:${conditionProp}:${callbackProp}:${kind}`,
    componentName: localTag,
    provider: 'material-ui',
    kind,
    title: `${conditionProp}=true prevents ${callbackProp} activation`,
    condition: { prop: conditionProp, value: true },
    event: { handlerProp: callbackProp, eventName: 'click' },
    expectation: { type: 'callback-not-called', callbackProp },
    evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
  };
}

function directBooleanBehavior(
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  fileName: string,
  localTag: string,
  kind: Extract<BehaviorKind,
    'mui-checkbox-checked-toggle' | 'mui-switch-checked-toggle' | 'mui-radio-checked-select'>,
  initialValue: boolean,
  nextValue: boolean,
): BehaviorContract {
  return {
    id: `${fileName}:${localTag}:checked:${initialValue}:onChange:${kind}`,
    componentName: localTag,
    provider: 'material-ui',
    kind,
    title: `checked=${initialValue} reports event.target.checked=${nextValue}`,
    condition: { prop: 'checked', value: initialValue },
    event: { handlerProp: 'onChange', eventName: 'click' },
    expectation: {
      type: 'callback-event-boolean',
      callbackProp: 'onChange',
      path: ['target', 'checked'],
      value: nextValue,
    },
    evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
  };
}

function directValueBehavior(
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningLikeElement,
  fileName: string,
  localTag: string,
  kind: Extract<BehaviorKind, 'mui-text-field-value-change' | 'mui-select-native-value-change'>,
  eventName: 'type' | 'selectOptions',
): BehaviorContract {
  return {
    id: `${fileName}:${localTag}:value:onChange:${kind}`,
    componentName: localTag,
    provider: 'material-ui',
    kind,
    title: 'value changes are reported through onChange event.target.value',
    condition: { prop: 'value', value: 'bound' },
    event: { handlerProp: 'onChange', eventName },
    expectation: { type: 'callback-event-path', callbackProp: 'onChange', path: ['target', 'value'] },
    evidence: { fileName, line: lineOf(sourceFile, node), snippet: node.getText(sourceFile) },
  };
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
            behaviors.push(directSuppressionBehavior(
              sourceFile, node, fileName, localTag,
              'mui-button-disabled-event-suppression', 'disabled', 'onClick',
            ));
          }
          if (booleanAttributeValue(node, 'loading') === true) {
            behaviors.push(directSuppressionBehavior(
              sourceFile, node, fileName, localTag,
              'mui-button-loading-event-suppression', 'loading', 'onClick',
            ));
          }
        }
      } else if (muiComponent === 'Checkbox' || muiComponent === 'Switch') {
        const callback = identifierAttribute(node, 'onChange');
        if (callback) {
          if (booleanAttributeValue(node, 'disabled') === true) {
            behaviors.push(directSuppressionBehavior(
              sourceFile,
              node,
              fileName,
              localTag,
              muiComponent === 'Checkbox'
                ? 'mui-checkbox-disabled-change-suppression'
                : 'mui-switch-disabled-change-suppression',
              'disabled',
              'onChange',
            ));
          }
          const checked = booleanAttributeValue(node, 'checked');
          if (checked !== undefined) {
            behaviors.push(directBooleanBehavior(
              sourceFile,
              node,
              fileName,
              localTag,
              muiComponent === 'Checkbox' ? 'mui-checkbox-checked-toggle' : 'mui-switch-checked-toggle',
              checked,
              !checked,
            ));
          }
        }
      } else if (muiComponent === 'Radio') {
        const callback = identifierAttribute(node, 'onChange');
        if (callback) {
          if (booleanAttributeValue(node, 'disabled') === true) {
            behaviors.push(directSuppressionBehavior(
              sourceFile, node, fileName, localTag,
              'mui-radio-disabled-change-suppression', 'disabled', 'onChange',
            ));
          }
          const checked = booleanAttributeValue(node, 'checked');
          if (checked === false) {
            behaviors.push(directBooleanBehavior(
              sourceFile, node, fileName, localTag,
              'mui-radio-checked-select', false, true,
            ));
          }
        }
      } else if (muiComponent === 'TextField') {
        const callback = identifierAttribute(node, 'onChange');
        if (callback && hasValueAttribute(node)) {
          behaviors.push(directValueBehavior(
            sourceFile, node, fileName, localTag, 'mui-text-field-value-change', 'type',
          ));
        }
      } else if (muiComponent === 'Select') {
        const callback = identifierAttribute(node, 'onChange');
        if (
          callback &&
          booleanAttributeValue(node, 'native') === true &&
          hasValueAttribute(node)
        ) {
          behaviors.push(directValueBehavior(
            sourceFile, node, fileName, localTag, 'mui-select-native-value-change', 'selectOptions',
          ));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return dedupeBehaviors(behaviors);
}

function sxBorderRadiusValue(node: ts.JsxOpeningLikeElement): DesignObservation['value'] | undefined {
  const sx = getAttribute(node, 'sx');
  if (!sx?.initializer || !ts.isJsxExpression(sx.initializer) || !sx.initializer.expression) {
    return undefined;
  }
  if (!ts.isObjectLiteralExpression(sx.initializer.expression)) return undefined;

  for (const property of sx.initializer.expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
      ? property.name.text
      : undefined;
    if (name !== 'borderRadius') continue;

    if (ts.isNumericLiteral(property.initializer)) {
      const value = Number(property.initializer.text);
      return { kind: 'theme-multiplier', value, defaultThemePixels: value * 4 };
    }
    if (ts.isStringLiteralLike(property.initializer)) {
      return { kind: 'css-literal', value: property.initializer.text };
    }
  }

  return undefined;
}

export function extractMaterialUiDesignObservations(
  sourceText: string,
  fileName = 'component.tsx',
): DesignObservation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports = collectMuiImports(sourceFile);
  const observations: DesignObservation[] = [];

  const visit = (node: ts.Node, currentComponent?: string): void => {
    const componentName = componentNameForNode(node) ?? currentComponent;

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const localTag = jsxTagName(node);
      if (localTag && imports.get(localTag) === 'Box') {
        const value = sxBorderRadiusValue(node);
        if (value) {
          observations.push({
            id: `${fileName}:${componentName ?? localTag}:${lineOf(sourceFile, node)}:borderRadius`,
            componentName: componentName ?? localTag,
            provider: 'material-ui',
            kind: 'mui-box-border-radius',
            property: 'borderRadius',
            value,
            evidence: {
              fileName,
              line: lineOf(sourceFile, node),
              snippet: node.getText(sourceFile),
            },
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, componentName));
  };

  visit(sourceFile);
  return observations;
}
