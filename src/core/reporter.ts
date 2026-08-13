import type { AnalysisReport, BehaviorResult, BehaviorStatus, ProjectAnalysisReport } from './model';

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

function appendResult(lines: string[], result: BehaviorResult): void {
  lines.push(`${statusGlyph[result.status]} ${result.behavior.componentName}: ${result.behavior.title}`);
  lines.push(`  Status: ${statusLabel[result.status]}`);
  if (result.testName) lines.push(`  Test:   ${result.testName}`);
  lines.push(`  Why:    ${result.reason}`);
  if (result.suggestedAssertion) lines.push(`  Suggestion: ${result.suggestedAssertion}`);
}

function appendScores(lines: string[], report: AnalysisReport): void {
  const { scores } = report;
  lines.push(`Discovered behaviors:     ${scores.discovered}`);
  lines.push(`Behavior Reach:           ${scores.behaviorReach}%`);
  lines.push(`Behavior Verification:    ${scores.behaviorVerification}%`);
  lines.push(`Verification Gap:         ${scores.verificationGap} pp`);
}

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
    appendResult(lines, result);
    lines.push('');
  }

  lines.push('Scores');
  lines.push('------');
  appendScores(lines, report);

  return lines.join('\n');
}

export function formatProjectTextReport(report: ProjectAnalysisReport): string {
  const lines: string[] = [];

  lines.push('UI Behavior Coverage — Project Scan');
  lines.push('===================================');
  lines.push(`Root:       ${report.rootDir}`);
  lines.push(`Components: ${report.componentsAnalyzed}`);
  lines.push(`Test files: ${report.testFilesAnalyzed}`);

  if (report.reports.length === 0) {
    lines.push('');
    lines.push('No React/TSX component-test pairs were discovered.');
    return lines.join('\n');
  }

  for (const componentReport of report.reports) {
    lines.push('');
    lines.push(`Component: ${componentReport.componentFile}`);
    lines.push(`Tests:     ${componentReport.testFile}`);

    if (componentReport.results.length === 0) {
      lines.push('  No supported behavioral contracts were discovered.');
      continue;
    }

    for (const result of componentReport.results) {
      lines.push('');
      appendResult(lines, result);
    }
  }

  lines.push('');
  lines.push('Project Scores');
  lines.push('--------------');
  lines.push(`Discovered behaviors:     ${report.scores.discovered}`);
  lines.push(`Behavior Reach:           ${report.scores.behaviorReach}%`);
  lines.push(`Behavior Verification:    ${report.scores.behaviorVerification}%`);
  lines.push(`Verification Gap:         ${report.scores.verificationGap} pp`);

  return lines.join('\n');
}
