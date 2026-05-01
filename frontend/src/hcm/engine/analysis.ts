import type { Approach, MovementType, SignalPhase } from "../models";
import { calculateCapacity, calculateVolumeToCapacityRatio } from "./capacity";
import {
  applyProgressionAdjustmentToUniformDelay,
  calculateControlDelay,
  calculateIncrementalDelay,
  calculateInitialQueueDelay,
  calculateUniformDelay,
} from "./delay";
import { getLosFromDelay } from "./los";
import { calculateBackOfQueue, convertQueueToDistance } from "./queue";
import {
  calculateAdjustedSaturationFlow,
  calculateAreaTypeFactor,
  calculateBusBlockageFactor,
  calculateGradeFactor,
  calculateHeavyVehicleFactorFromComposition,
  calculateIdealSaturationFlow,
  calculateLaneUtilizationFactor,
  calculateLaneWidthFactor,
  calculateLeftTurnFactor,
  calculateLeftTurnPedestrianFactor,
  calculateParkingFactor,
  calculateRightTurnFactor,
  calculateRightTurnPedestrianFactor,
} from "./saturationFlow";
import { calculateCombinedPeakHourFactor, sum15MinuteCount } from "./trafficData";

export type ApproachAnalysisResult = {
  approachId: string;
  laneCount: number;
  totalVolume: number;
  adjustedVolume: number;
  idealSaturationFlow: number;
  highestSingleLaneVolume: number;
  effectiveGreenSeconds: number;
  peakHourFactor: number;
  saturationFlow: number;
  capacity: number;
  volumeToCapacityRatio: number;
  uniformDelay: number;
  progressionAdjustedUniformDelay: number;
  incrementalDelay: number;
  initialQueueDelay: number;
  controlDelay: number;
  los: string;
  averageBackOfQueue: number;
  percentile95Queue: number;
  queueStorageFeet: number;
};

export type LaneGroupAnalysisResult = {
  laneGroupId: string;
  servedMovements: string[];
  laneCount: number;
  volume: number;
  adjustedVolume: number;
  idealSaturationFlow: number;
  highestSingleLaneVolume: number;
  effectiveGreenSeconds: number;
  peakHourFactor: number;
  saturationFlow: number;
  capacity: number;
  volumeToCapacityRatio: number;
  uniformDelay: number;
  progressionAdjustedUniformDelay: number;
  incrementalDelay: number;
  initialQueueDelay: number;
  controlDelay: number;
  los: string;
  averageBackOfQueue: number;
  percentile95Queue: number;
  queueStorageFeet: number;
};

type MovementVolumeMap = Record<MovementType, number>;

function buildMovementVolumeMap(
  leftVolume: number,
  throughVolume: number,
  rightVolume: number
): MovementVolumeMap {
  return { left: leftVolume, through: throughVolume, right: rightVolume };
}

function getLaneAllocationWeight(
  movement: MovementType,
  lane: Approach["lanes"][number],
  eligibleLaneCount: number
): number {
  if (movement === "through" && eligibleLaneCount > 1) {
    return lane.throughMovementPreferenceWeight ?? 1;
  }

  return 1;
}

function getReceivingLanesForMovement(
  approach: Approach,
  laneIds: string[],
  movement: MovementType
): Approach["lanes"] {
  const eligibleLanes = approach.lanes.filter(
    (lane) => laneIds.includes(lane.id) && lane.allowedMovements.includes(movement)
  );

  if (eligibleLanes.length > 0) return eligibleLanes;
  return approach.lanes.filter((lane) => laneIds.includes(lane.id));
}

function calculateHighestLaneVolume(
  approach: Approach,
  laneIds: string[],
  movementVolumes: MovementVolumeMap,
  servedMovements: MovementType[]
): number {
  const laneVolumeById: Record<string, number> = {};
  laneIds.forEach((laneId) => {
    laneVolumeById[laneId] = 0;
  });

  servedMovements.forEach((movement) => {
    const movementVolume = movementVolumes[movement];
    if (movementVolume <= 0) return;

    const receivingLanes = getReceivingLanesForMovement(approach, laneIds, movement);
    if (receivingLanes.length <= 0) return;

    const totalAllocationWeight = receivingLanes.reduce(
      (sum, lane) => sum + getLaneAllocationWeight(movement, lane, receivingLanes.length),
      0
    );

    receivingLanes.forEach((lane) => {
      const laneAllocationWeight = getLaneAllocationWeight(
        movement,
        lane,
        receivingLanes.length
      );
      laneVolumeById[lane.id] +=
        totalAllocationWeight > 0
          ? (movementVolume * laneAllocationWeight) / totalAllocationWeight
          : movementVolume / receivingLanes.length;
    });
  });

  return Object.values(laneVolumeById).reduce(
    (highest, laneVolume) => Math.max(highest, laneVolume),
    0
  );
}

function calculateAverageLaneWidthForLaneIds(
  approach: Approach,
  laneIds: string[]
): number {
  const matchingLanes = approach.lanes.filter((lane) => laneIds.includes(lane.id));
  if (matchingLanes.length === 0) return 3.6;
  return (
    matchingLanes.reduce((sum, lane) => sum + lane.widthMeters, 0) /
    matchingLanes.length
  );
}

function getEffectiveGreenSeconds(phase: SignalPhase, cycleLength: number): number {
  if (phase.effectiveGreenSeconds !== undefined) {
    return Math.max(
      0,
      cycleLength > 0
        ? Math.min(phase.effectiveGreenSeconds, cycleLength)
        : phase.effectiveGreenSeconds
    );
  }

  const derivedEffectiveGreenSeconds =
    phase.greenSeconds +
    phase.yellowSeconds +
    phase.allRedSeconds -
    (phase.startupLostTimeSeconds ?? 0) -
    (phase.clearanceLostTimeSeconds ?? 0);

  return Math.max(
    0,
    cycleLength > 0 ? Math.min(derivedEffectiveGreenSeconds, cycleLength) : derivedEffectiveGreenSeconds
  );
}

function calculateLaneGroupMovementVolumes(
  approach: Approach,
  movementVolumes: MovementVolumeMap
): Record<string, MovementVolumeMap> {
  const laneGroupMovementVolumes = approach.laneGroups.reduce<Record<string, MovementVolumeMap>>(
    (allocation, group) => {
      allocation[group.id] = buildMovementVolumeMap(0, 0, 0);
      return allocation;
    },
    {}
  );

  (["left", "through", "right"] as MovementType[]).forEach((movement) => {
    const movementVolume = movementVolumes[movement];
    if (movementVolume <= 0) return;

    const servingGroups = approach.laneGroups.filter((group) =>
      group.servedMovements.includes(movement)
    );
    if (servingGroups.length <= 0) return;

    const receivingLaneIds = Array.from(new Set(servingGroups.flatMap((group) => group.laneIds)));
    const receivingLanes = getReceivingLanesForMovement(approach, receivingLaneIds, movement);
    if (receivingLanes.length <= 0) return;

    const groupAllocationWeights = servingGroups.map((group) => ({
      groupId: group.id,
      weight: receivingLanes.reduce(
        (sum, lane) =>
          group.laneIds.includes(lane.id)
            ? sum + getLaneAllocationWeight(movement, lane, receivingLanes.length)
            : sum,
        0
      ),
    }));

    const totalGroupAllocationWeight = groupAllocationWeights.reduce(
      (sum, entry) => sum + entry.weight,
      0
    );

    if (totalGroupAllocationWeight <= 0) {
      const equalShare = movementVolume / servingGroups.length;
      servingGroups.forEach((group) => {
        laneGroupMovementVolumes[group.id][movement] += equalShare;
      });
      return;
    }

    groupAllocationWeights.forEach(({ groupId, weight }) => {
      laneGroupMovementVolumes[groupId][movement] +=
        (movementVolume * weight) / totalGroupAllocationWeight;
    });
  });

  return laneGroupMovementVolumes;
}

function buildMovementCounts(approach: Approach): MovementVolumeMap {
  return buildMovementVolumeMap(
    sum15MinuteCount(approach.rawCounts15Min.left),
    sum15MinuteCount(approach.rawCounts15Min.through),
    sum15MinuteCount(approach.rawCounts15Min.right)
  );
}

export function analyzeApproach(
  approach: Approach,
  phase: SignalPhase,
  cycleLength: number
): ApproachAnalysisResult {
  const movementVolumes = buildMovementCounts(approach);
  const totalVolume = movementVolumes.left + movementVolumes.through + movementVolumes.right;
  const peakHourFactor = calculateCombinedPeakHourFactor([
    approach.rawCounts15Min.left,
    approach.rawCounts15Min.through,
    approach.rawCounts15Min.right,
  ]);
  const effectiveGreenSeconds = getEffectiveGreenSeconds(phase, cycleLength);
  const highestSingleLaneVolume = calculateHighestLaneVolume(
    approach,
    approach.lanes.map((lane) => lane.id),
    movementVolumes,
    ["left", "through", "right"]
  );
  const laneUtilizationFactor = calculateLaneUtilizationFactor(
    totalVolume,
    highestSingleLaneVolume,
    approach.lanes.length
  );
  const leftTurnProportion = totalVolume > 0 ? movementVolumes.left / totalVolume : 0;
  const rightTurnProportion = totalVolume > 0 ? movementVolumes.right / totalVolume : 0;
  const laneWidthFactor = calculateLaneWidthFactor(
    approach.lanes.reduce((sum, lane) => sum + lane.widthMeters, 0) / approach.lanes.length
  );
  const heavyVehicleFactor = calculateHeavyVehicleFactorFromComposition(
    approach.vehicleComposition.bus,
    approach.vehicleComposition.hgv
  );
  const gradeFactor = calculateGradeFactor(approach.gradePercent);
  const parkingFactor = calculateParkingFactor(approach.lanes.length, approach.parkingManeuversPerHour);
  const busBlockageFactor = calculateBusBlockageFactor(approach.lanes.length, approach.busesStoppingPerHour);
  const areaTypeFactor = calculateAreaTypeFactor(approach.areaType);
  const leftTurnFactor = calculateLeftTurnFactor(leftTurnProportion, false, "protected");
  const rightTurnFactor = calculateRightTurnFactor(rightTurnProportion, false, approach.lanes.length, 0);
  const leftTurnPedestrianFactor = calculateLeftTurnPedestrianFactor(0, leftTurnProportion, 0);
  const rightTurnPedestrianFactor = calculateRightTurnPedestrianFactor(0, rightTurnProportion, 0);

  const idealSaturationFlow = calculateIdealSaturationFlow(approach.lanes.length);
  const saturationFlow = calculateAdjustedSaturationFlow(idealSaturationFlow, {
    ...approach.saturationFlowFactors,
    laneWidthFactor,
    heavyVehicleFactor,
    gradeFactor,
    parkingFactor,
    busBlockageFactor,
    areaTypeFactor,
    laneUtilizationFactor,
    leftTurnFactor,
    rightTurnFactor,
    leftTurnPedestrianFactor,
    rightTurnPedestrianFactor,
  });

  const capacity = calculateCapacity(saturationFlow, effectiveGreenSeconds, cycleLength);
  const adjustedVolume = peakHourFactor > 0 ? totalVolume / peakHourFactor : totalVolume;
  const volumeToCapacityRatio = calculateVolumeToCapacityRatio(adjustedVolume, capacity);
  const progressionAdjustmentFactor = approach.progressionAdjustmentFactor ?? 1;
  const uniformDelay = calculateUniformDelay(cycleLength, effectiveGreenSeconds, volumeToCapacityRatio);
  const incrementalDelay = calculateIncrementalDelay(
    volumeToCapacityRatio,
    capacity,
    phase.incrementalDelayAnalysisPeriodHours,
    phase.incrementalDelayKFactor,
    phase.upstreamFilteringFactor
  );
  const totalInitialQueueVehicles = approach.laneGroups.reduce(
    (sum, group) => sum + (group.initialQueueVehicles ?? 0),
    0
  );
  const initialQueueDelay = calculateInitialQueueDelay(
    totalInitialQueueVehicles,
    adjustedVolume,
    phase.incrementalDelayAnalysisPeriodHours
  );
  const progressionAdjustedUniformDelay = applyProgressionAdjustmentToUniformDelay(
    uniformDelay,
    progressionAdjustmentFactor
  );
  const controlDelay = calculateControlDelay(
    progressionAdjustedUniformDelay,
    incrementalDelay,
    initialQueueDelay
  );

  const queueResults = calculateBackOfQueue({
    flowRatePerLane: adjustedVolume / Math.max(approach.lanes.length, 1),
    saturationFlowPerLane: saturationFlow / Math.max(approach.lanes.length, 1),
    capacityPerLane: capacity / Math.max(approach.lanes.length, 1),
    cycleLength,
    effectiveGreen: effectiveGreenSeconds,
    platoonRatio: progressionAdjustmentFactor,
    upstreamFilteringFactor: phase.upstreamFilteringFactor,
    initialQueuePerLane: totalInitialQueueVehicles / Math.max(approach.lanes.length, 1),
    analysisPeriodHours: phase.incrementalDelayAnalysisPeriodHours,
    signalType: phase.queueSignalType ?? "pretimed",
  });

  return {
    approachId: approach.id,
    laneCount: approach.lanes.length,
    totalVolume,
    adjustedVolume,
    idealSaturationFlow,
    highestSingleLaneVolume,
    effectiveGreenSeconds,
    peakHourFactor,
    saturationFlow,
    capacity,
    volumeToCapacityRatio,
    uniformDelay,
    progressionAdjustedUniformDelay,
    incrementalDelay,
    initialQueueDelay,
    controlDelay,
    los: getLosFromDelay(controlDelay),
    averageBackOfQueue: queueResults.averageBackOfQueue,
    percentile95Queue: queueResults.percentile95,
    queueStorageFeet: convertQueueToDistance(queueResults.percentile95, 25),
  };
}

export function analyzeLaneGroups(
  approach: Approach,
  phase: SignalPhase,
  cycleLength: number
): LaneGroupAnalysisResult[] {
  const movementVolumes = buildMovementCounts(approach);
  const laneGroupMovementVolumes = calculateLaneGroupMovementVolumes(approach, movementVolumes);
  const effectiveGreenSeconds = getEffectiveGreenSeconds(phase, cycleLength);
  const progressionAdjustmentFactor = approach.progressionAdjustmentFactor ?? 1;
  const heavyVehicleFactor = calculateHeavyVehicleFactorFromComposition(
    approach.vehicleComposition.bus,
    approach.vehicleComposition.hgv
  );
  const gradeFactor = calculateGradeFactor(approach.gradePercent);
  const areaTypeFactor = calculateAreaTypeFactor(approach.areaType);

  return approach.laneGroups.map((group) => {
    const groupMovementVolumes = laneGroupMovementVolumes[group.id] ?? buildMovementVolumeMap(0, 0, 0);
    const volume = groupMovementVolumes.left + groupMovementVolumes.through + groupMovementVolumes.right;
    const phfCounts = [];
    if (groupMovementVolumes.left > 0) phfCounts.push(approach.rawCounts15Min.left);
    if (groupMovementVolumes.through > 0) phfCounts.push(approach.rawCounts15Min.through);
    if (groupMovementVolumes.right > 0) phfCounts.push(approach.rawCounts15Min.right);

    const peakHourFactor = phfCounts.length > 0 ? calculateCombinedPeakHourFactor(phfCounts) : 1;
    const adjustedVolume = peakHourFactor > 0 ? volume / peakHourFactor : volume;
    const highestSingleLaneVolume = calculateHighestLaneVolume(
      approach,
      group.laneIds,
      groupMovementVolumes,
      group.servedMovements
    );
    const laneUtilizationFactor = calculateLaneUtilizationFactor(
      volume,
      highestSingleLaneVolume,
      group.laneIds.length
    );
    const leftTurnProportion = volume > 0 ? groupMovementVolumes.left / volume : 0;
    const rightTurnProportion = volume > 0 ? groupMovementVolumes.right / volume : 0;
    const laneWidthFactor = calculateLaneWidthFactor(
      calculateAverageLaneWidthForLaneIds(approach, group.laneIds)
    );
    const parkingFactor = group.servedMovements.includes("right")
      ? calculateParkingFactor(approach.lanes.length, approach.parkingManeuversPerHour)
      : 1;
    const busBlockageFactor = group.servedMovements.includes("right")
      ? calculateBusBlockageFactor(approach.lanes.length, approach.busesStoppingPerHour)
      : 1;
    const leftTurnFactor = calculateLeftTurnFactor(
      leftTurnProportion,
      group.servedMovements.length === 1 && group.servedMovements.includes("left"),
      group.leftTurnPhasing ?? "protected",
      group.leftTurnProtectedProportion ?? 0,
      group.leftTurnOpposingFlowVehPerHour ?? 0,
      group.laneIds.length
    );
    const rightTurnFactor = calculateRightTurnFactor(
      rightTurnProportion,
      group.servedMovements.length === 1 && group.servedMovements.includes("right"),
      group.laneIds.length,
      group.rightTurnProtectedProportion ?? 0
    );
    const leftTurnPedestrianFactor = calculateLeftTurnPedestrianFactor(
      group.leftTurnPedestrianConflict ?? 0,
      leftTurnProportion,
      group.leftTurnProtectedProportion ?? 0
    );
    const rightTurnPedestrianFactor = calculateRightTurnPedestrianFactor(
      group.rightTurnPedestrianConflict ?? 0,
      rightTurnProportion,
      group.rightTurnProtectedProportion ?? 0
    );

    const idealSaturationFlow = calculateIdealSaturationFlow(group.laneIds.length);
    const saturationFlow = calculateAdjustedSaturationFlow(idealSaturationFlow, {
      ...approach.saturationFlowFactors,
      laneWidthFactor,
      heavyVehicleFactor,
      gradeFactor,
      parkingFactor,
      busBlockageFactor,
      areaTypeFactor,
      laneUtilizationFactor,
      leftTurnFactor,
      rightTurnFactor,
      leftTurnPedestrianFactor,
      rightTurnPedestrianFactor,
    });

    const capacity = calculateCapacity(saturationFlow, effectiveGreenSeconds, cycleLength);
    const volumeToCapacityRatio = calculateVolumeToCapacityRatio(adjustedVolume, capacity);
    const uniformDelay = calculateUniformDelay(cycleLength, effectiveGreenSeconds, volumeToCapacityRatio);
    const incrementalDelay = calculateIncrementalDelay(
      volumeToCapacityRatio,
      capacity,
      phase.incrementalDelayAnalysisPeriodHours,
      phase.incrementalDelayKFactor,
      phase.upstreamFilteringFactor
    );
    const initialQueueDelay = calculateInitialQueueDelay(
      group.initialQueueVehicles ?? 0,
      adjustedVolume,
      phase.incrementalDelayAnalysisPeriodHours
    );
    const progressionAdjustedUniformDelay = applyProgressionAdjustmentToUniformDelay(
      uniformDelay,
      progressionAdjustmentFactor
    );
    const controlDelay = calculateControlDelay(
      progressionAdjustedUniformDelay,
      incrementalDelay,
      initialQueueDelay
    );

    const queueResults = calculateBackOfQueue({
      flowRatePerLane: adjustedVolume / Math.max(group.laneIds.length, 1),
      saturationFlowPerLane: saturationFlow / Math.max(group.laneIds.length, 1),
      capacityPerLane: capacity / Math.max(group.laneIds.length, 1),
      cycleLength,
      effectiveGreen: effectiveGreenSeconds,
      platoonRatio: progressionAdjustmentFactor,
      upstreamFilteringFactor: phase.upstreamFilteringFactor,
      initialQueuePerLane: (group.initialQueueVehicles ?? 0) / Math.max(group.laneIds.length, 1),
      analysisPeriodHours: phase.incrementalDelayAnalysisPeriodHours,
      signalType: phase.queueSignalType ?? "pretimed",
    });

    return {
      laneGroupId: group.id,
      servedMovements: group.servedMovements,
      laneCount: group.laneIds.length,
      volume,
      adjustedVolume,
      idealSaturationFlow,
      highestSingleLaneVolume,
      effectiveGreenSeconds,
      peakHourFactor,
      saturationFlow,
      capacity,
      volumeToCapacityRatio,
      uniformDelay,
      progressionAdjustedUniformDelay,
      incrementalDelay,
      initialQueueDelay,
      controlDelay,
      los: getLosFromDelay(controlDelay),
      averageBackOfQueue: queueResults.averageBackOfQueue,
      percentile95Queue: queueResults.percentile95,
      queueStorageFeet: convertQueueToDistance(queueResults.percentile95, 25),
    };
  });
}
