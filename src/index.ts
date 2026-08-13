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
  DiscoverySkipReason,
  ProjectAnalysisReport,
  ProjectDiscoveryTelemetry,
} from './core/model';
export { calculateScores } from './core/scoring';
export { formatProjectTextReport, formatTextReport } from './core/reporter';
export { extractComponentBehaviors, defaultBehaviorProviders } from './react/extract-component-behaviors';
export { analyzeTestsAgainstBehaviors } from './react/analyze-tests';
export {
  defaultRenderHelpers,
  normalizeTestHarnessSource,
} from './react/normalize-test-harness';
export type { NormalizeTestHarnessOptions } from './react/normalize-test-harness';
export { analyzeReactSources } from './react/analyze';
export type { AnalyzeReactSourcesInput } from './react/analyze';
export {
  discoverProject,
  discoverProjectTargets,
  discoverTestFiles,
} from './project/discover';
export type {
  ProjectDiscoveryOptions,
  ProjectDiscoveryResult,
  ProjectTarget,
} from './project/discover';
export { analyzeProject } from './project/analyze-project';
export type { AnalyzeProjectOptions } from './project/analyze-project';
export { resolveProjectComponentBehaviors } from './project/compose-project-behaviors';
export type {
  ResolveProjectComponentBehaviorsInput,
  ResolveProjectComponentBehaviorsOptions,
} from './project/compose-project-behaviors';
export {
  parseProjectSourceFile,
  readProjectCompilerOptions,
  resolveProjectModuleFile,
  traceProjectExport,
} from './project/module-resolver';
export type {
  ProjectModuleResolverOptions,
  ResolvedProjectExport,
} from './project/module-resolver';
export { nativeHtmlBehaviorProvider } from './providers/native-html';
export { materialUiCompositionProvider } from './providers/material-ui-composition';
export {
  materialUiBehaviorProvider,
  extractDirectMaterialUiTestBehaviors,
  extractMaterialUiDesignObservations,
} from './providers/material-ui';
export { evaluateBoxBorderRadiusGuidance } from './design/material-ui';
export type { BehaviorProvider } from './providers/types';
