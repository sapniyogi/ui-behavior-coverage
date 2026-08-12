import type { AnalysisReport, BehaviorStatus } from './model';

const statusLabel: Record<BehaviorStatus, string> = {
  discovered: 'DISCOVERED',
  exercised: 'EXERCISED',
  verified: 'VERIFIED',
};

const statusGlyph: Record<BehaviorStatus, string> = {
  discovered: '○',
  exercised: '⚠',
  verified: '✓',
};

export function formatTextReport(report: AnalysisReport): string {
  const lines: string[] = [];

  lines.push('UI Behavior Coverage');
  lines.push('====================');
  lines.push(`Component: ${report.componentFile}`);
  lines.push(`Tests:     ${report.testFile}`);
  lines.push('');

  if (report.results.length === 0) {
    lines.push('No supported behavioral contracts were discovered.');
    return lines.join('\n');
  }

  for (const result of report.results) {
    lines.push(
      `${statusGlyph[result.status]} ${result.behavior.componentName}: ${result.behavior.title}`,
    );
    lines.push(`  Status: ${statusLabel[result.status]}`);
    if (result.testName) lines.push(`  Test:   ${result.testName}`);
    lines.push(`  Why:    ${result.reason}`);
    if (result.suggestedAssertion) {
      lines.push(`  Suggestion: ${result.suggestedAssertion}`);
    }
    lines.push('');
  }

  const { scores } = report;
  lines.push('Scores');
  lines.push('------');
  lines.push(`Discovered behaviors:     ${scores.discovered}`);
  lines.push(`Behavior Reach:           ${scores.behaviorReach}%`);
  lines.push(`Behavior Verification:    ${scores.behaviorVerification}%`);
  lines.push(`Verification Gap:         ${scores.verificationGap} pp`);

  return lines.join('\n');
}
