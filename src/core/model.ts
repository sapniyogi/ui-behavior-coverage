export type BehaviorKind =
  | 'native-disabled-event-suppression'
  | 'mui-button-disabled-event-suppression'
  | 'mui-button-loading-event-suppression'
  | 'mui-checkbox-disabled-change-suppression'
  | 'mui-checkbox-checked-toggle';

export type BehaviorProviderName = 'native-html' | 'material-ui';

export type BehaviorStatus = 'discovered' | 'exercised' | 'verified';

export interface SourceEvidence {
  fileName: string;
  line: number;
  snippet: string;
}

export type BehaviorExpectation =
  | {
      type: 'callback-not-called';
      callbackProp: string;
    }
  | {
      type: 'callback-event-boolean';
      callbackProp: string;
      path: string[];
      value: boolean;
    };

export interface BehaviorContract {
  id: string;
  componentName: string;
  provider: BehaviorProviderName;
  kind: BehaviorKind;
  title: string;
  condition: {
    prop: string;
    value: boolean;
  };
  event: {
    handlerProp: string;
    eventName: string;
  };
  expectation: BehaviorExpectation;
  evidence: SourceEvidence;
}

export interface BehaviorResult {
  behavior: BehaviorContract;
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

export interface ProjectAnalysisReport {
  rootDir: string;
  componentsAnalyzed: number;
  testFilesAnalyzed: number;
  reports: AnalysisReport[];
  scores: CoverageScores;
}
