export type BehaviorKind = 'native-disabled-event-suppression';

export type BehaviorStatus = 'discovered' | 'exercised' | 'verified';

export interface SourceEvidence {
  fileName: string;
  line: number;
  snippet: string;
}

export interface BehaviorContract {
  id: string;
  componentName: string;
  kind: BehaviorKind;
  title: string;
  condition: {
    prop: string;
    value: true;
  };
  event: {
    handlerProp: string;
    eventName: string;
  };
  expectation: {
    type: 'callback-not-called';
    callbackProp: string;
  };
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
