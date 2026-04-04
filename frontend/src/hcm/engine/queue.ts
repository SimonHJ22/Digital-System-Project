import { calculateVolumeToCapacityRatio } from "./capacity";

export interface QueueParameters {
  flowRatePerLane: number;
  saturationFlowPerLane: number;
  capacityPerLane: number;
  cycleLength: number;
  effectiveGreen: number;
  platoonRatio: number;
  upstreamFilteringFactor: number;
  initialQueuePerLane: number;
  analysisPeriodHours: number;
  signalType: "pretimed" | "actuated";
}

export interface QueueResults {
  averageBackOfQueue: number;
  percentile70: number;
  percentile85: number;
  percentile90: number;
  percentile95: number;
  percentile98: number;
  q1UniformTerm: number;
  q2OverflowTerm: number;
}

function calculateProgressionFactor(
  flowRatePerLane: number,
  saturationFlowPerLane: number,
  effectiveGreen: number,
  cycleLength: number,
  platoonRatio: number
): number {
  if (cycleLength <= 0 || saturationFlowPerLane <= 0) return 1.0;

  const greenRatio = effectiveGreen / cycleLength;
  const flowRatio = flowRatePerLane / saturationFlowPerLane;
  const numerator = (1 - platoonRatio * greenRatio) * (1 - flowRatio);
  const denominator = (1 - greenRatio) * (1 - platoonRatio * flowRatio);

  if (denominator <= 0) return 1.0;
  return Math.max(0.5, Math.min(2.0, numerator / denominator));
}

function calculateQ1(
  flowRatePerLane: number,
  cycleLength: number,
  effectiveGreen: number,
  volumeToCapacityRatio: number,
  progressionFactor: number
): number {
  if (cycleLength <= 0 || effectiveGreen >= cycleLength) return 0;

  const greenRatio = effectiveGreen / cycleLength;
  const xL = Math.min(1.0, volumeToCapacityRatio);
  const numerator = (flowRatePerLane * cycleLength / 3600) * (1 - greenRatio);
  const denominator = 1 - xL * greenRatio;

  if (denominator <= 0) {
    return progressionFactor * numerator;
  }

  return progressionFactor * (numerator / denominator);
}

function calculateKB(
  saturationFlowPerLane: number,
  effectiveGreen: number,
  upstreamFilteringFactor: number,
  signalType: "pretimed" | "actuated"
): number {
  const satGreenProduct = (saturationFlowPerLane * effectiveGreen) / 3600;

  if (signalType === "pretimed") {
    return 0.12 * upstreamFilteringFactor * Math.pow(satGreenProduct, 0.7);
  }

  return 0.1 * upstreamFilteringFactor * Math.pow(satGreenProduct, 0.6);
}

function calculateQ2(
  capacityPerLane: number,
  analysisPeriodHours: number,
  volumeToCapacityRatio: number,
  kB: number,
  initialQueuePerLane: number
): number {
  if (analysisPeriodHours <= 0) return 0;

  if (!Number.isFinite(volumeToCapacityRatio)) {
    return Number.POSITIVE_INFINITY;
  }

  if (capacityPerLane <= 0) {
    return initialQueuePerLane > 0 || volumeToCapacityRatio > 0
      ? Number.POSITIVE_INFINITY
      : 0;
  }

  const cT = capacityPerLane * analysisPeriodHours;
  const xL = volumeToCapacityRatio;
  const term1 = Math.pow(xL - 1, 2);
  const term2 = (8 * kB * xL) / cT;
  const term3 = (16 * kB * initialQueuePerLane) / Math.pow(cT, 2);
  const sqrtTerm = Math.sqrt(Math.max(0, term1 + term2 + term3));

  return Math.max(0, 0.25 * cT * ((xL - 1) + sqrtTerm));
}

function calculatePercentileQueue(
  averageQueue: number,
  q2: number,
  percentileFactor: number
): number {
  const standardDeviation = Math.sqrt(Math.max(0, q2));
  return Math.max(0, averageQueue + percentileFactor * standardDeviation);
}

export function calculateBackOfQueue(params: QueueParameters): QueueResults {
  const {
    flowRatePerLane,
    saturationFlowPerLane,
    capacityPerLane,
    cycleLength,
    effectiveGreen,
    platoonRatio,
    upstreamFilteringFactor,
    initialQueuePerLane,
    analysisPeriodHours,
    signalType,
  } = params;

  const volumeToCapacityRatio = calculateVolumeToCapacityRatio(
    flowRatePerLane,
    capacityPerLane
  );
  const progressionFactor = calculateProgressionFactor(
    flowRatePerLane,
    saturationFlowPerLane,
    effectiveGreen,
    cycleLength,
    platoonRatio
  );
  const q1 = calculateQ1(
    flowRatePerLane,
    cycleLength,
    effectiveGreen,
    volumeToCapacityRatio,
    progressionFactor
  );
  const kB = calculateKB(
    saturationFlowPerLane,
    effectiveGreen,
    upstreamFilteringFactor,
    signalType
  );
  const q2 = calculateQ2(
    capacityPerLane,
    analysisPeriodHours,
    volumeToCapacityRatio,
    kB,
    initialQueuePerLane
  );
  const averageBackOfQueue = q1 + q2;

  return {
    averageBackOfQueue,
    percentile70: calculatePercentileQueue(averageBackOfQueue, q2, 0.524),
    percentile85: calculatePercentileQueue(averageBackOfQueue, q2, 1.037),
    percentile90: calculatePercentileQueue(averageBackOfQueue, q2, 1.282),
    percentile95: calculatePercentileQueue(averageBackOfQueue, q2, 1.645),
    percentile98: calculatePercentileQueue(averageBackOfQueue, q2, 2.054),
    q1UniformTerm: q1,
    q2OverflowTerm: q2,
  };
}

export function convertQueueToDistance(
  queueVehicles: number,
  averageVehicleLength: number = 25
): number {
  return queueVehicles * averageVehicleLength;
}
