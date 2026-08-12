import type { BehaviorResult, CoverageScores } from './model';

function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function calculateScores(results: BehaviorResult[]): CoverageScores {
  const discovered = results.length;
  const exercised = results.filter(
    (result) => result.status === 'exercised' || result.status === 'verified',
  ).length;
  const verified = results.filter((result) => result.status === 'verified').length;

  const behaviorReach = percent(exercised, discovered);
  const behaviorVerification = percent(verified, discovered);

  return {
    discovered,
    exercised,
    verified,
    behaviorReach,
    behaviorVerification,
    verificationGap: Math.round((behaviorReach - behaviorVerification) * 10) / 10,
  };
}
