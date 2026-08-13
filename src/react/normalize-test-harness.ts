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
 * Normalizes known custom render helpers to Testing Library's `render` call shape.
 * The analyzer only relies on ordering within the reparsed source, so textual
 * normalization is intentionally simpler and safer than mutating the user's AST.
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

  return normalized;
}
