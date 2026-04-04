export function calculateUniformDelay(
  cycleLength: number,
  effectiveGreen: number,
  volumeToCapacityRatio: number,
  progressionAdjustmentFactor: number = 1
): number {
  const greenRatio =
    cycleLength > 0 ? Number((effectiveGreen / cycleLength).toFixed(3)) : 0;
  const x = Math.min(1, Number(volumeToCapacityRatio.toFixed(3)));
  const denominator = 1 - x * greenRatio;
  const baseUniformDelay =
    denominator <= 0
      ? cycleLength / 2
      : (0.5 * cycleLength * (1 - greenRatio) ** 2) / denominator;

  return applyProgressionAdjustmentToUniformDelay(
    baseUniformDelay,
    progressionAdjustmentFactor
  );
}

export function applyProgressionAdjustmentToUniformDelay(
  uniformDelay: number,
  progressionAdjustmentFactor: number = 1
): number {
  return Math.max(0, uniformDelay) * Math.max(0, progressionAdjustmentFactor);
}

function calculateIncrementalDelayOversaturationTerm(
  volumeToCapacityRatio: number,
  capacityPerHour: number,
  analysisPeriodHours: number,
  delayParameterK: number,
  upstreamFilteringFactor: number
): number {
  return (
    (volumeToCapacityRatio - 1) ** 2 +
    (8 * delayParameterK * upstreamFilteringFactor * volumeToCapacityRatio) /
      (capacityPerHour * analysisPeriodHours)
  );
}

export function calculateIncrementalDelay(
  volumeToCapacityRatio: number,
  capacityPerHour: number,
  analysisPeriodHours: number = 1,
  delayParameterK: number = 0.5,
  upstreamFilteringFactor: number = 1
): number {
  const x = Math.max(0, volumeToCapacityRatio);
  const boundedAnalysisPeriodHours = Math.max(0, analysisPeriodHours);
  const boundedDelayParameterK = Math.max(0, delayParameterK);
  const boundedUpstreamFilteringFactor = Math.max(0, upstreamFilteringFactor);

  if (boundedAnalysisPeriodHours <= 0) {
    return 0;
  }

  if (!Number.isFinite(x)) {
    return Number.POSITIVE_INFINITY;
  }

  if (capacityPerHour <= 0) {
    return x > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  const normalizedCapacityPerHour = Math.max(1, Math.round(capacityPerHour));
  const normalizedVolumeToCapacityRatio = Math.max(0, Number(x.toFixed(3)));

  const oversaturationTerm = calculateIncrementalDelayOversaturationTerm(
    normalizedVolumeToCapacityRatio,
    normalizedCapacityPerHour,
    boundedAnalysisPeriodHours,
    boundedDelayParameterK,
    boundedUpstreamFilteringFactor
  );
  const oversaturationRootTerm = Math.sqrt(Math.max(0, oversaturationTerm));

  return Math.max(
    0,
    900 *
      boundedAnalysisPeriodHours *
      ((normalizedVolumeToCapacityRatio - 1) + oversaturationRootTerm)
  );
}

function calculateInitialQueueDelayAnalysisPeriodDemand(
  adjustedDemandPerHour: number,
  analysisPeriodHours: number
): number {
  return Math.max(1, adjustedDemandPerHour * analysisPeriodHours);
}

export function calculateInitialQueueDelay(
  initialQueueVehicles: number,
  adjustedDemandPerHour: number,
  analysisPeriodHours: number = 1
): number {
  if (initialQueueVehicles <= 0 || adjustedDemandPerHour <= 0 || analysisPeriodHours <= 0) {
    return 0;
  }

  const analysisPeriodDemand = calculateInitialQueueDelayAnalysisPeriodDemand(
    adjustedDemandPerHour,
    analysisPeriodHours
  );

  return (3600 * initialQueueVehicles) / analysisPeriodDemand;
}

export function calculateControlDelay(
  uniformDelay: number,
  incrementalDelay: number,
  initialQueueDelay: number = 0
): number {
  if (
    uniformDelay === Number.POSITIVE_INFINITY ||
    incrementalDelay === Number.POSITIVE_INFINITY ||
    initialQueueDelay === Number.POSITIVE_INFINITY
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    Math.max(0, uniformDelay) +
    Math.max(0, incrementalDelay) +
    Math.max(0, initialQueueDelay)
  );
}
