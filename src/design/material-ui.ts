import type {
  BorderRadiusGuidance,
  DesignGuidanceResult,
  DesignObservation,
} from '../core/model';

export function evaluateBoxBorderRadiusGuidance(
  observations: readonly DesignObservation[],
  guidance: BorderRadiusGuidance,
): DesignGuidanceResult[] {
  return observations
    .filter((observation) => observation.kind === 'mui-box-border-radius')
    .map((observation) => {
      if (observation.value.kind === 'theme-multiplier') {
        const allowed = guidance.allowedThemeMultipliers;
        const compliant = !allowed || allowed.includes(observation.value.value);
        return {
          observation,
          status: compliant ? 'compliant' : 'noncompliant',
          reason: compliant
            ? `borderRadius theme multiplier ${observation.value.value} is allowed.`
            : `borderRadius theme multiplier ${observation.value.value} is outside the allowed set: ${allowed?.join(', ') ?? ''}.`,
        };
      }

      const allowed = guidance.allowedCssValues;
      const compliant = !allowed || allowed.includes(observation.value.value);
      return {
        observation,
        status: compliant ? 'compliant' : 'noncompliant',
        reason: compliant
          ? `borderRadius CSS value ${observation.value.value} is allowed.`
          : `borderRadius CSS value ${observation.value.value} is outside the allowed set: ${allowed?.join(', ') ?? ''}.`,
      };
    });
}
