export type {
  AnalysisReport,
  AnyBehaviorContract,
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
  RenderStateBehaviorContract,
  RenderStateBehaviorKind,
} from './core/model';
export { calculateScores } from './core/scoring';
export { formatProjectTextReport, formatTextReport } from './core/reporter';
export {
  REPORT_SCHEMA_VERSION,
  TOOL_VERSION,
  createAnalysisJsonReport,
  createProjectJsonReport,
} from './report-schema';
export type { JsonReportType, VersionedJsonReport } from './report-schema';
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
export { analyzeRenderStateTests } from './project/analyze-render-state-tests';
export { resolveProjectComponentBehaviors } from './project/compose-project-behaviors';
export type {
  ResolveProjectComponentBehaviorsInput,
  ResolveProjectComponentBehaviorsOptions,
} from './project/compose-project-behaviors';
export { resolveProjectRenderStateBehaviors } from './project/compose-render-state-behaviors';
export type {
  ResolveProjectRenderStateInput,
  ResolveProjectRenderStateOptions,
} from './project/compose-render-state-behaviors';
export { extractMaterialUiRenderStateBehaviors } from './project/material-ui-render-state';
export { extractMaterialUiSemanticBehaviors } from './project/material-ui-semantic-state';
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
