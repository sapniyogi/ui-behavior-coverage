export type {
  AnalysisReport,
  BehaviorContract,
  BehaviorResult,
  BehaviorStatus,
  CoverageScores,
} from './core/model';
export { calculateScores } from './core/scoring';
export { formatTextReport } from './core/reporter';
export { extractComponentBehaviors } from './react/extract-component-behaviors';
export { analyzeTestsAgainstBehaviors } from './react/analyze-tests';
export { analyzeReactSources } from './react/analyze';
export type { AnalyzeReactSourcesInput } from './react/analyze';
