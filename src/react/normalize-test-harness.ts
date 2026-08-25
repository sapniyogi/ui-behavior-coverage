import { expandTestRenderEvidence } from './expand-test-render-evidence';

export const defaultRenderHelpers = [
  'renderWithProviders',
  'renderWithTheme',
  'renderWithRouter',
  'renderWithContext',
  'renderApp',
] as const;

export interface NormalizeTestHarnessOptions {
  renderHelpers?: readonly string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes known custom render helpers to Testing Library's `render` call shape,
 * then expands statically safe local render helpers and proven rerender bindings.
 * The analyzer only relies on ordering within the reparsed source, so the
 * normalized source is analysis-only and never written back to user code.
 */
export function normalizeTestHarnessSource(
  source: string,
  options: NormalizeTestHarnessOptions = {},
): string {
  const helpers = options.renderHelpers ?? defaultRenderHelpers;
  let normalized = source;

  for (const helper of helpers) {
    if (helper === 'render') continue;
    const pattern = new RegExp(`\\b${escapeRegExp(helper)}\\s*\\(`, 'g');
    normalized = normalized.replace(pattern, 'render(');
  }

  return expandTestRenderEvidence(normalized);
}
