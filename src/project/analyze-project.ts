import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { AnalysisReport, ProjectAnalysisReport } from '../core/model';
import { calculateScores } from '../core/scoring';
import { extractDirectMaterialUiTestBehaviors } from '../providers/material-ui';
import { analyzeTestsAgainstBehaviors } from '../react/analyze-tests';
import { extractComponentBehaviors } from '../react/extract-component-behaviors';
import { discoverProjectTargets, discoverTestFiles } from './discover';

function relativePath(rootDir: string, file: string): string {
  return relative(rootDir, file) || '.';
}

export function analyzeProject(rootDir = '.'): ProjectAnalysisReport {
  const root = resolve(rootDir);
  const targets = discoverProjectTargets(root);
  const reports: AnalysisReport[] = [];
  const uniqueTests = new Set<string>();

  for (const target of targets) {
    for (const testFile of target.testFiles) uniqueTests.add(testFile);

    const componentFile = relativePath(root, target.componentFile);
    const testFiles = target.testFiles.map((file) => relativePath(root, file));
    const componentSource = readFileSync(target.componentFile, 'utf8');
    const testSource = target.testFiles
      .map((file) => `\n// ---- ${relativePath(root, file)} ----\n${readFileSync(file, 'utf8')}`)
      .join('\n');

    const behaviors = extractComponentBehaviors(componentSource, componentFile).filter((behavior) =>
      target.componentNames.includes(behavior.componentName),
    );
    const results = analyzeTestsAgainstBehaviors(testSource, behaviors, testFiles.join(', '));

    reports.push({
      componentFile,
      testFile: testFiles.join(', '),
      results,
      scores: calculateScores(results),
    });
  }

  for (const testFile of discoverTestFiles(root)) {
    const testSource = readFileSync(testFile, 'utf8');
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
  };
}
