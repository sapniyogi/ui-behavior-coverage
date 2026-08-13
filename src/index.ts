export type {
  AnalysisReport,
  BehaviorContract,
  BehaviorExpectation,
  BehaviorProviderName,
  BehaviorResult,
  BehaviorStatus,
  CoverageScores,
  ProjectAnalysisReport,
} from './core/model';
export { calculateScores } from './core/scoring';
export { formatProjectTextReport, formatTextReport } from './core/reporter';
export { extractComponentBehaviors, defaultBehaviorProviders } from './react/extract-component-behaviors';
export { analyzeTestsAgainstBehaviors } from './react/analyze-tests';
export { analyzeReactSources } from './react/analyze';
export type { AnalyzeReactSourcesInput } from './react/analyze';
export { discoverProjectTargets, discoverTestFiles } from './project/discover';
export type { ProjectTarget } from './project/discover';
export { analyzeProject } from './project/analyze-project';
export { nativeHtmlBehaviorProvider } from './providers/native-html';
export {
  materialUiBehaviorProvider,
  extractDirectMaterialUiTestBehaviors,
} from './providers/material-ui';
export type { BehaviorProvider } from './providers/types';
