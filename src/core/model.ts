export type BehaviorKind =
  | 'native-disabled-event-suppression'
  | 'mui-button-disabled-event-suppression'
  | 'mui-button-loading-event-suppression'
  | 'mui-checkbox-disabled-change-suppression'
  | 'mui-checkbox-checked-toggle'
  | 'mui-switch-disabled-change-suppression'
  | 'mui-switch-checked-toggle'
  | 'mui-radio-disabled-change-suppression'
  | 'mui-radio-checked-select'
  | 'mui-text-field-value-change'
  | 'mui-select-native-value-change';

export type RenderStateBehaviorKind =
  | 'mui-button-disabled-render-state'
  | 'mui-button-loading-render-state'
  | 'mui-checkbox-disabled-render-state'
  | 'mui-checkbox-checked-render-state'
  | 'mui-switch-disabled-render-state'
  | 'mui-switch-checked-render-state'
  | 'mui-radio-disabled-render-state'
  | 'mui-radio-checked-render-state'
  | 'mui-text-field-value-render-state'
  | 'mui-input-value-render-state'
  | 'mui-input-base-value-render-state'
  | 'mui-outlined-input-value-render-state'
  | 'mui-filled-input-value-render-state'
  | 'mui-select-value-render-state'
  | 'mui-slider-value-render-state'
  | 'mui-dialog-visibility-render-state'
  | 'mui-drawer-visibility-render-state'
  | 'mui-popover-visibility-render-state'
  | 'mui-menu-visibility-render-state'
  | 'mui-modal-visibility-render-state'
  | 'mui-collapse-visibility-render-state'
  | 'mui-fade-visibility-render-state'
  | 'mui-grow-visibility-render-state'
  | 'mui-slide-visibility-render-state'
  | 'mui-zoom-visibility-render-state'
  | 'mui-accordion-expanded-render-state'
  | 'mui-toggle-button-selected-render-state'
  | 'mui-accessibility-attribute-render-state'
  | 'mui-form-controlled-value-render-state'
  | 'mui-form-controlled-checked-render-state';

export type BehaviorProviderName = 'native-html' | 'material-ui';
export type BehaviorStatus = 'discovered' | 'exercised' | 'verified';

export interface SourceEvidence {
  fileName: string;
  line: number;
  snippet: string;
}

export type SemanticPrimitive = string | number | boolean;

export type BehaviorCondition = {
  prop: string;
  value: boolean | 'bound';
};

export type BehaviorExpectation =
  | { type: 'callback-not-called'; callbackProp: string }
  | { type: 'callback-event-boolean'; callbackProp: string; path: string[]; value: boolean }
  | { type: 'callback-event-path'; callbackProp: string; path: string[] };

export interface BehaviorContract {
  id: string;
  componentName: string;
  provider: BehaviorProviderName;
  kind: BehaviorKind;
  title: string;
  condition: BehaviorCondition;
  event: { handlerProp: string; eventName: string };
  expectation: BehaviorExpectation;
  evidence: SourceEvidence;
}

type RenderStateExpectationCore =
  | { type: 'element-boolean-state'; state: 'disabled' | 'checked'; value: boolean }
  | { type: 'element-value-state'; state: 'value'; valueSource: 'condition' }
  | { type: 'element-visibility-state'; visible: boolean }
  | { type: 'element-attribute-state'; attribute: string; valueSource: 'condition' }
  | {
      type: 'form-controlled-state';
      state: 'value' | 'checked';
      fieldKeyProp: 'source' | 'name';
      containers: readonly ('defaultValues' | 'record' | 'values')[];
    };

/**
 * The optional compatibility fields keep older render-state providers source-compatible
 * while semantic expectation variants are discriminated by `type`.
 */
export type RenderStateExpectation = RenderStateExpectationCore & {
  state?: 'disabled' | 'checked' | 'value';
  value?: boolean;
};

export interface RenderStateBehaviorContract {
  id: string;
  componentName: string;
  provider: 'material-ui';
  kind: RenderStateBehaviorKind;
  title: string;
  condition: BehaviorCondition;
  event: { eventName: 'render' };
  expectation: RenderStateExpectation;
  evidence: SourceEvidence;
}

export type AnyBehaviorContract = BehaviorContract | RenderStateBehaviorContract;

export interface BehaviorResult {
  behavior: AnyBehaviorContract;
  status: BehaviorStatus;
  testName?: string;
  callbackVariable?: string;
  reason: string;
  suggestedAssertion?: string;
}

export interface CoverageScores {
  discovered: number;
  exercised: number;
  verified: number;
  behaviorReach: number;
  behaviorVerification: number;
  verificationGap: number;
}

export interface AnalysisReport {
  componentFile: string;
  testFile: string;
  results: BehaviorResult[];
  scores: CoverageScores;
}

export type DiscoverySkipReason =
  | 'no-runtime-jsx'
  | 'no-rendered-component-import'
  | 'external-module'
  | 'unresolved-module'
  | 'unresolved-barrel-export';

export interface ProjectDiscoveryTelemetry {
  totalTestFiles: number;
  testFilesWithRuntimeJsx: number;
  testFilesWithTargets: number;
  importsExamined: number;
  importsResolved: number;
  skipped: Record<DiscoverySkipReason, number>;
}

export interface ProjectAnalysisReport {
  rootDir: string;
  componentsAnalyzed: number;
  testFilesAnalyzed: number;
  reports: AnalysisReport[];
  scores: CoverageScores;
  discovery?: ProjectDiscoveryTelemetry;
}

export type DesignObservationKind = 'mui-box-border-radius';

export type DesignValue =
  | {
      kind: 'theme-multiplier';
      value: number;
      /** Informational only. MUI's default theme uses 4px, but applications may override it. */
      defaultThemePixels: number;
    }
  | { kind: 'css-literal'; value: string };

export interface DesignObservation {
  id: string;
  componentName: string;
  provider: 'material-ui';
  kind: DesignObservationKind;
  property: 'borderRadius';
  value: DesignValue;
  evidence: SourceEvidence;
}

export interface BorderRadiusGuidance {
  allowedThemeMultipliers?: number[];
  allowedCssValues?: string[];
}

export interface DesignGuidanceResult {
  observation: DesignObservation;
  status: 'compliant' | 'noncompliant';
  reason: string;
}
