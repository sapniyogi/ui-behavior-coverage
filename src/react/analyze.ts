import type { AnalysisReport } from '../core/model';
import { calculateScores } from '../core/scoring';
import { extractComponentBehaviors } from './extract-component-behaviors';
import { analyzeTestsAgainstBehaviors } from './analyze-tests-target-aware';

export interface AnalyzeReactSourcesInput {
  componentSource: string;
  testSource: string;
  componentFile?: string;
  testFile?: string;
}

export function analyzeReactSources(input: AnalyzeReactSourcesInput): AnalysisReport {
  const componentFile = input.componentFile ?? 'component.tsx';
  const testFile = input.testFile ?? 'component.test.tsx';

  const behaviors = extractComponentBehaviors(input.componentSource, componentFile);
  const results = analyzeTestsAgainstBehaviors(input.testSource, behaviors, testFile);

  return {
    componentFile,
    testFile,
    results,
    scores: calculateScores(results),
  };
}
