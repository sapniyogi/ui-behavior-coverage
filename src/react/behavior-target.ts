import ts from 'typescript';
import type { AnyBehaviorContract, BehaviorTarget } from '../core/model';
import { getAttribute, jsxTagName } from '../providers/shared';

const buttonTags = new Set(['button', 'Button', 'IconButton', 'LoadingButton', 'Fab']);
const checkboxTags = new Set(['Checkbox']);
const switchTags = new Set(['Switch']);
const radioTags = new Set(['Radio']);
const textTags = new Set(['input', 'textarea', 'TextField', 'Input', 'InputBase', 'OutlinedInput', 'FilledInput']);
const selectTags = new Set(['select', 'Select']);
const sliderTags = new Set(['Slider']);
const dialogTags = new Set(['Dialog']);
const drawerTags = new Set(['Drawer']);
const popoverTags = new Set(['Popover']);
const menuTags = new Set(['Menu']);
const modalTags = new Set(['Modal']);

interface TargetFamily {
  roles?: readonly string[];
  tags?: ReadonlySet<string>;
}

function tagFamily(tag: string | undefined): TargetFamily {
  if (!tag) return {};
  if (buttonTags.has(tag)) return { roles: ['button', 'link'], tags: buttonTags };
  if (checkboxTags.has(tag)) return { roles: ['checkbox', 'switch'], tags: checkboxTags };
  if (switchTags.has(tag)) return { roles: ['checkbox', 'switch'], tags: switchTags };
  if (radioTags.has(tag)) return { roles: ['radio'], tags: radioTags };
  if (textTags.has(tag)) return { roles: ['textbox', 'searchbox', 'spinbutton'], tags: textTags };
  if (selectTags.has(tag)) return { roles: ['combobox', 'listbox'], tags: selectTags };
  if (sliderTags.has(tag)) return { roles: ['slider'], tags: sliderTags };
  if (dialogTags.has(tag)) return { roles: ['dialog'], tags: dialogTags };
  if (drawerTags.has(tag)) return { tags: drawerTags };
  if (popoverTags.has(tag)) return { tags: popoverTags };
  if (menuTags.has(tag)) return { roles: ['menu'], tags: menuTags };
  if (modalTags.has(tag)) return { tags: modalTags };
  return {};
}

function familyForKind(kind: AnyBehaviorContract['kind']): TargetFamily {
  switch (kind) {
    case 'mui-button-disabled-event-suppression':
    case 'mui-button-loading-event-suppression':
    case 'mui-button-disabled-render-state':
    case 'mui-button-loading-render-state':
      return { roles: ['button', 'link'], tags: buttonTags };
    case 'mui-checkbox-disabled-change-suppression':
    case 'mui-checkbox-checked-toggle':
    case 'mui-checkbox-disabled-render-state':
    case 'mui-checkbox-checked-render-state':
      return { roles: ['checkbox', 'switch'], tags: checkboxTags };
    case 'mui-switch-disabled-change-suppression':
    case 'mui-switch-checked-toggle':
    case 'mui-switch-disabled-render-state':
    case 'mui-switch-checked-render-state':
      return { roles: ['checkbox', 'switch'], tags: switchTags };
    case 'mui-radio-disabled-change-suppression':
    case 'mui-radio-checked-select':
    case 'mui-radio-disabled-render-state':
    case 'mui-radio-checked-render-state':
      return { roles: ['radio'], tags: radioTags };
    case 'mui-text-field-value-change':
    case 'mui-text-field-value-render-state':
    case 'mui-input-value-render-state':
    case 'mui-input-base-value-render-state':
    case 'mui-outlined-input-value-render-state':
    case 'mui-filled-input-value-render-state':
      return { roles: ['textbox', 'searchbox', 'spinbutton'], tags: textTags };
    case 'mui-select-native-value-change':
    case 'mui-select-value-render-state':
      return { roles: ['combobox', 'listbox'], tags: selectTags };
    case 'mui-slider-value-render-state':
      return { roles: ['slider'], tags: sliderTags };
    case 'mui-dialog-visibility-render-state':
      return { roles: ['dialog'], tags: dialogTags };
    case 'mui-drawer-visibility-render-state':
      return { tags: drawerTags };
    case 'mui-popover-visibility-render-state':
      return { tags: popoverTags };
    case 'mui-menu-visibility-render-state':
      return { roles: ['menu'], tags: menuTags };
    case 'mui-modal-visibility-render-state':
      return { tags: modalTags };
    default:
      return {};
  }
}

function stringJsxAttribute(node: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteralLike(attribute.initializer)) return attribute.initializer.text;
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return undefined;
  return ts.isStringLiteralLike(attribute.initializer.expression)
    ? attribute.initializer.expression.text
    : undefined;
}

function expressionStrings(expression: ts.Expression): string[] {
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) return expressionStrings(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [
      ...expressionStrings(expression.whenTrue),
      ...expressionStrings(expression.whenFalse),
    ];
  }
  return [];
}

function enumerableStringAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): string | readonly string[] | undefined {
  const attribute = getAttribute(node, name);
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteralLike(attribute.initializer)) return attribute.initializer.text;
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return undefined;
  const values = [...new Set(expressionStrings(attribute.initializer.expression))];
  if (values.length === 1) return values[0];
  return values.length > 1 ? values : undefined;
}

function nestedStringProperty(
  node: ts.JsxOpeningLikeElement,
  containerName: string,
  propertyName: string,
): string | undefined {
  const attribute = getAttribute(node, containerName);
  if (
    !attribute?.initializer ||
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression ||
    !ts.isObjectLiteralExpression(attribute.initializer.expression)
  ) return undefined;

  for (const property of attribute.initializer.expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
      ? property.name.text
      : undefined;
    if (name !== propertyName || !ts.isStringLiteralLike(property.initializer)) continue;
    return property.initializer.text;
  }
  return undefined;
}

function literalChildren(node: ts.JsxOpeningLikeElement): string | undefined {
  if (!ts.isJsxOpeningElement(node) || !ts.isJsxElement(node.parent)) return undefined;
  const parts: string[] = [];
  for (const child of node.parent.children) {
    if (ts.isJsxText(child)) {
      const text = child.getText().replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
      continue;
    }
    if (
      ts.isJsxExpression(child) &&
      child.expression &&
      ts.isStringLiteralLike(child.expression)
    ) parts.push(child.expression.text);
  }
  return parts.length > 0 ? parts.join(' ').trim() : undefined;
}

function accessibleName(node: ts.JsxOpeningLikeElement): string | undefined {
  return stringJsxAttribute(node, 'aria-label')
    ?? nestedStringProperty(node, 'inputProps', 'aria-label')
    ?? stringJsxAttribute(node, 'label')
    ?? literalChildren(node);
}

function findEvidenceElement(
  sourceFile: ts.SourceFile,
  behavior: AnyBehaviorContract,
): ts.JsxOpeningLikeElement | undefined {
  let exact: ts.JsxOpeningLikeElement | undefined;
  let sameLine: ts.JsxOpeningLikeElement | undefined;
  const visit = (node: ts.Node): void => {
    if (exact) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (line === behavior.evidence.line) {
        if (node.getText(sourceFile) === behavior.evidence.snippet) {
          exact = node;
          return;
        }
        if (!sameLine) sameLine = node;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return exact ?? sameLine;
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) return current;
    current = current.parent;
  }
  return undefined;
}

function countFamilyCandidates(
  target: ts.JsxOpeningLikeElement,
  family: ReadonlySet<string> | undefined,
): number | undefined {
  if (!family) return undefined;
  const fn = enclosingFunction(target);
  if (!fn?.body) return undefined;
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (node !== fn && (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    )) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node);
      if (tag && family.has(tag)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return count > 0 ? count : undefined;
}

function targetForBehavior(
  sourceFile: ts.SourceFile,
  behavior: AnyBehaviorContract,
): BehaviorTarget | undefined {
  const element = findEvidenceElement(sourceFile, behavior);
  if (!element) return undefined;
  const tag = jsxTagName(element);
  const specific = familyForKind(behavior.kind);
  const fallback = tagFamily(tag);
  const roles = specific.roles ?? fallback.roles;
  const family = specific.tags ?? fallback.tags;
  const target: BehaviorTarget = {
    roles,
    accessibleName: accessibleName(element),
    testId: enumerableStringAttribute(element, 'data-testid'),
    candidateCount: countFamilyCandidates(element, family),
    sourceTag: tag,
  };
  if (
    !target.roles &&
    !target.accessibleName &&
    !target.testId &&
    target.candidateCount === undefined &&
    !target.sourceTag
  ) return undefined;
  return target;
}

/**
 * Re-derives target identity from the evidence location in the source currently
 * being analyzed. Calling this again after project composition intentionally
 * replaces any child target metadata with the parent-level evidence target.
 */
export function attachBehaviorTargets<T extends AnyBehaviorContract>(
  sourceText: string,
  fileName: string,
  behaviors: readonly T[],
): T[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return behaviors.map((behavior) => ({
    ...behavior,
    target: targetForBehavior(sourceFile, behavior),
  }));
}
