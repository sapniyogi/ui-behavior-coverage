export type {
  AnalysisReport,
  BehaviorCondition,
  BehaviorContract,
  BehaviorExpectation,
  BehaviorProviderName,
  BehaviorResult,
  BehaviorStatus,
  BorderRadiusGuidance,
  CoverageScores,
  DesignGuidanceResult,
  DesignObservation,
  DesignObservationKind,
  DesignValue,
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
  extractMaterialUiDesignObservations,
} from './providers/material-ui';
export { evaluateBoxBorderRadiusGuidance } from './design/material-ui';
export type { BehaviorProvider } from './providers/types';
