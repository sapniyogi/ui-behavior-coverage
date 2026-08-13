import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { AnalysisReport, ProjectAnalysisReport } from '../core/model';
import { calculateScores } from '../core/scoring';
import { extractDirectMaterialUiTestBehaviors } from '../providers/material-ui';
import { analyzeTestsAgainstBehaviors } from '../react/analyze-tests';
import { normalizeTestHarnessSource } from '../react/normalize-test-harness';
import { resolveProjectComponentBehaviors } from './compose-project-behaviors';
import { discoverProject, discoverTestFiles, type ProjectDiscoveryOptions } from './discover';

function relativePath(rootDir: string, file: string): string {
  return relative(rootDir, file) || '.';
}

export interface AnalyzeProjectOptions extends ProjectDiscoveryOptions {
  /** Additional project-specific render helper names that should behave like Testing Library render(). */
  renderHelpers?: readonly string[];
  /** Safety bound for recursive local component composition. */
  maxCompositionDepth?: number;
}

export function analyzeProject(
  rootDir = '.',
  options: AnalyzeProjectOptions = {},
): ProjectAnalysisReport {
  const root = resolve(rootDir);
  const discovery = discoverProject(root, options);
  const reports: AnalysisReport[] = [];
  const uniqueTests = new Set<string>();

  for (const target of discovery.targets) {
    for (const testFile of target.testFiles) uniqueTests.add(testFile);

    const componentFile = relativePath(root, target.componentFile);
    const testFiles = target.testFiles.map((file) => relativePath(root, file));
    const rawTestSource = target.testFiles
      .map((file) => `\n// ---- ${relativePath(root, file)} ----\n${readFileSync(file, 'utf8')}`)
      .join('\n');
    const testSource = normalizeTestHarnessSource(rawTestSource, {
      renderHelpers: options.renderHelpers,
    });

    const behaviors = resolveProjectComponentBehaviors({
      rootDir: root,
      componentFile: target.componentFile,
      componentNames: target.componentNames,
      options: {
        tsconfigPath: options.tsconfigPath,
        maxDepth: options.maxCompositionDepth,
      },
    });
    const results = analyzeTestsAgainstBehaviors(testSource, behaviors, testFiles.join(', '));

    reports.push({
      componentFile,
      testFile: testFiles.join(', '),
      results,
      scores: calculateScores(results),
    });
  }

  for (const testFile of discoverTestFiles(root)) {
    const rawTestSource = readFileSync(testFile, 'utf8');
    const testSource = normalizeTestHarnessSource(rawTestSource, {
      renderHelpers: options.renderHelpers,
    });
    const relativeTestFile = relativePath(root, testFile);
    const behaviors = extractDirectMaterialUiTestBehaviors(testSource, relativeTestFile);
    if (behaviors.length === 0) continue;

    uniqueTests.add(testFile);
    const results = analyzeTestsAgainstBehaviors(testSource, behaviors, relativeTestFile);
    reports.push({
      componentFile: '@mui/material (direct test imports)',
      testFile: relativeTestFile,
      results,
      scores: calculateScores(results),
    });
  }

  const allResults = reports.flatMap((report) => report.results);

  return {
    rootDir: root,
    componentsAnalyzed: reports.length,
    testFilesAnalyzed: uniqueTests.size,
    reports,
    scores: calculateScores(allResults),
    discovery: discovery.telemetry,
  };
}
