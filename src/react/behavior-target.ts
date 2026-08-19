import ts from 'typescript';
import type {
  AnyBehaviorContract,
  BehaviorTarget,
  RenderStateBehaviorKind,
} from '../core/model';
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

function rolesForKind(kind: AnyBehaviorContract['kind']): readonly string[] | undefined {
  switch (kind) {
    case 'native-disabled-event-suppression':
      return undefined;
    case 'mui-button-disabled-event-suppression':
    case 'mui-button-loading-event-suppression':
    case 'mui-button-disabled-render-state':
    case 'mui-button-loading-render-state':
      return ['button', 'link'];
    case 'mui-checkbox-disabled-change-suppression':
    case 'mui-checkbox-checked-toggle':
    case 'mui-checkbox-disabled-render-state':
    case 'mui-checkbox-checked-render-state':
      return ['checkbox', 'switch'];
    case 'mui-switch-disabled-change-suppression':
    case 'mui-switch-checked-toggle':
    case 'mui-switch-disabled-render-state':
    case 'mui-switch-checked-render-state':
      return ['checkbox', 'switch'];
    case 'mui-radio-disabled-change-suppression':
    case 'mui-radio-checked-select':
    case 'mui-radio-disabled-render-state':
    case 'mui-radio-checked-render-state':
      return ['radio'];
    case 'mui-text-field-value-change':
    case 'mui-text-field-value-render-state':
    case 'mui-input-value-render-state':
    case 'mui-input-base-value-render-state':
    case 'mui-outlined-input-value-render-state':
    case 'mui-filled-input-value-render-state':
      return ['textbox', 'searchbox', 'spinbutton'];
    case 'mui-select-native-value-change':
    case 'mui-select-value-render-state':
      return ['combobox', 'listbox'];
    case 'mui-slider-value-render-state':
      return ['slider'];
    case 'mui-dialog-visibility-render-state':
      return ['dialog'];
    case 'mui-drawer-visibility-render-state':
      return undefined;
    case 'mui-popover-visibility-render-state':
      return undefined;
    case 'mui-menu-visibility-render-state':
      return ['menu'];
    case 'mui-modal-visibility-render-state':
      return undefined;
    case 'mui-collapse-visibility-render-state':
    case 'mui-fade-visibility-render-state':
    case 'mui-grow-visibility-render-state':
    case 'mui-slide-visibility-render-state':
    case 'mui-zoom-visibility-render-state':
    case 'mui-accordion-expanded-render-state':
    case 'mui-toggle-button-selected-render-state':
    case 'mui-accessibility-attribute-render-state':
    case 'mui-form-controlled-value-render-state':
    case 'mui-form-controlled-checked-render-state':
      return undefined;
  }
}

function familyTags(kind: AnyBehaviorContract['kind']): ReadonlySet<string> | undefined {
  switch (kind) {
    case 'mui-button-disabled-event-suppression':
    case 'mui-button-loading-event-suppression':
    case 'mui-button-disabled-render-state':
    case 'mui-button-loading-render-state':
      return buttonTags;
    case 'mui-checkbox-disabled-change-suppression':
    case 'mui-checkbox-checked-toggle':
    case 'mui-checkbox-disabled-render-state':
    case 'mui-checkbox-checked-render-state':
      return checkboxTags;
    case 'mui-switch-disabled-change-suppression':
    case 'mui-switch-checked-toggle':
    case 'mui-switch-disabled-render-state':
    case 'mui-switch-checked-render-state':
      return switchTags;
    case 'mui-radio-disabled-change-suppression':
    case 'mui-radio-checked-select':
    case 'mui-radio-disabled-render-state':
    case 'mui-radio-checked-render-state':
      return radioTags;
    case 'mui-text-field-value-change':
    case 'mui-text-field-value-render-state':
    case 'mui-input-value-render-state':
    case 'mui-input-base-value-render-state':
    case 'mui-outlined-input-value-render-state':
    case 'mui-filled-input-value-render-state':
      return textTags;
    case 'mui-select-native-value-change':
    case 'mui-select-value-render-state':
      return selectTags;
    case 'mui-slider-value-render-state':
      return sliderTags;
    case 'mui-dialog-visibility-render-state':
      return dialogTags;
    case 'mui-drawer-visibility-render-state':
      return drawerTags;
    case 'mui-popover-visibility-render-state':
      return popoverTags;
    case 'mui-menu-visibility-render-state':
      return menuTags;
    case 'mui-modal-visibility-render-state':
      return modalTags;
    default:
      return undefined;
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
  const roles = rolesForKind(behavior.kind);
  const family = familyTags(behavior.kind);
  const target: BehaviorTarget = {
    roles,
    accessibleName: accessibleName(element),
    testId: stringJsxAttribute(element, 'data-testid'),
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
