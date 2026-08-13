export type {
  AnalysisReport,
  BehaviorContract,
  BehaviorResult,
  BehaviorStatus,
  CoverageScores,
  ProjectAnalysisReport,
} from './core/model';
export { calculateScores } from './core/scoring';
export { formatProjectTextReport, formatTextReport } from './core/reporter';
export { extractComponentBehaviors } from './react/extract-component-behaviors';
export { analyzeTestsAgainstBehaviors } from './react/analyze-tests';
export { analyzeReactSources } from './react/analyze';
export type { AnalyzeReactSourcesInput } from './react/analyze';
export { discoverProjectTargets } from './project/discover';
export type { ProjectTarget } from './project/discover';
export { analyzeProject } from './project/analyze-project';
