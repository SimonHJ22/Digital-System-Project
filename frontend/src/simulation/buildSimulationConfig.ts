import type { ScenarioData, LaneGroupKey } from "../types/traffic";
import { ensurePhaseTimingCount, formatPhaseMovementSummary } from "../utils/signalPhases";
import {
  DEFAULT_CYCLE_LENGTH,
  DIRECTION_PAIRS,
  MOVEMENT_KEYS,
} from "./constants";
import type {
  ApproachSimulationConfig,
  ApproachSimulationMap,
  LaneGroupSlot,
  MovementDemand,
  MovementType,
  SignalSegment,
  SimulationConfig,
} from "./types";

function getServedMovementsFromSlot(
  servedMovements: Record<LaneGroupKey, boolean>
): MovementType[] {
  return MOVEMENT_KEYS.filter((movement) => servedMovements[movement]);
}

function formatMovementShortLabel(movement: MovementType): string {
  if (movement === "left") return "LT";
  if (movement === "through") return "TH";
  return "RT";
}

function formatLaneGroupComposition(slots: LaneGroupSlot[]): string {
  return slots
    .map((slot) => {
      const movementLabel = slot.servedMovements
        .map((movement) => formatMovementShortLabel(movement))
        .join("/");

      return slot.laneCount > 1 ? `${movementLabel}x${slot.laneCount}` : movementLabel;
    })
    .join(" | ");
}

function getMovementDemandCounts(
  leftTurnVolume: number,
  throughVolume: number,
  rightTurnVolume: number
): MovementDemand {
  return {
    left: Math.max(0, leftTurnVolume),
    through: Math.max(0, throughVolume),
    right: Math.max(0, rightTurnVolume),
  };
}

function buildApproachSimulationConfigs(
  scenario: ScenarioData
): ApproachSimulationMap {
  return Object.fromEntries(
    DIRECTION_PAIRS.map(([directionKey, approachDirection]) => {
      const geometryForApproach = scenario.geometry.approaches[approachDirection];
      const trafficForApproach = scenario.traffic.approaches[approachDirection];

      const configuredSlots = (["left", "through", "right"] as LaneGroupKey[])
        .map((slotKey) => {
          const definition = geometryForApproach.laneGroupDefinitions[slotKey];
          const servedMovements = getServedMovementsFromSlot(definition.servedMovements);

          return {
            slotKey,
            laneCount: Math.max(0, Number(definition.laneCount || 0)),
            enabled: definition.enabled,
            servedMovements,
            initialQueueVehicles: Math.max(
              0,
              Number(trafficForApproach.laneGroups[slotKey].initialQueueVehicles || 0)
            ),
          };

        })
        .filter(
          (slot) => slot.enabled && slot.laneCount > 0 && slot.servedMovements.length > 0
        )
        .map(
          ({ slotKey, laneCount, servedMovements, initialQueueVehicles }) =>
            ({
              slotKey,
              laneCount,
              servedMovements,
              initialQueueVehicles,
            }) satisfies LaneGroupSlot

        );

      const laneGroupSlots: LaneGroupSlot[] = configuredSlots;

      const movementLaneCounts = MOVEMENT_KEYS.reduce<MovementDemand>(
        (counts, movement) => ({
          ...counts,
          [movement]: laneGroupSlots.reduce(
            (sum, slot) =>
              slot.servedMovements.includes(movement) ? sum + slot.laneCount : sum,
            0
          ),
        }),
        {
          left: 0,
          through: 0,
          right: 0,
        }
      );

      const rawDemandCounts = getMovementDemandCounts(
        Number(trafficForApproach.leftTurnVolume || 0),
        Number(trafficForApproach.throughVolume || 0),
        Number(trafficForApproach.rightTurnVolume || 0)
      );

      const demandCounts =
        laneGroupSlots.length > 0
          ? rawDemandCounts
          : {
              left: 0,
              through: 0,
              right: 0,
            };


      const totalPhysicalLanes = laneGroupSlots.reduce(
        (sum, slot) => sum + slot.laneCount,
        0
      );

      

      const config: ApproachSimulationConfig = {
        direction: directionKey,
        demandCounts,
        movementLaneCounts,
        totalVolume: demandCounts.left + demandCounts.through + demandCounts.right,
        totalPhysicalLanes,
        heavyVehiclePercent: Number(trafficForApproach.heavyVehiclesPercent || 0),
        laneGroupSlots,
        compositionLabel:
          laneGroupSlots.length > 0
            ? formatLaneGroupComposition(laneGroupSlots)
            : "Closed approach",
      };

      return [directionKey, config];
    })
  ) as ApproachSimulationMap;
}

function buildSignalSegments(scenario: ScenarioData): SignalSegment[] {
  const cycleLength =
    typeof scenario.signal.cycleLength === "number" && scenario.signal.cycleLength > 0
      ? scenario.signal.cycleLength
      : DEFAULT_CYCLE_LENGTH;

  const rawPhases = ensurePhaseTimingCount(
    scenario.signal.phases,
    Math.max(scenario.signal.numberOfPhases, 1)
  );

  const phasesForDisplay =
    rawPhases.length > 0
      ? rawPhases.map((phase, index) => ({
          phaseNumber: phase.phaseNumber || index + 1,
          greenTime:
            typeof phase.greenTime === "number" && phase.greenTime > 0
              ? phase.greenTime
              : Math.max(
                  10,
                  Math.round(cycleLength / Math.max(scenario.signal.numberOfPhases, 1))
                ),
          yellowAllRed:
            typeof phase.yellowAllRed === "number" && phase.yellowAllRed >= 0
              ? phase.yellowAllRed
              : 4,
          movementPermissions: phase.movementPermissions,
          movementSummary:
            phase.protectedMovements?.trim() ||
            formatPhaseMovementSummary(phase.movementPermissions),
        }))
      : [
          {
            phaseNumber: 1,
            greenTime: Math.max(10, Math.round(cycleLength / 2)),
            yellowAllRed: 4,
            movementPermissions: rawPhases[0]?.movementPermissions,
            movementSummary: "No served movements selected",
          },
        ];

  return phasesForDisplay.flatMap((phase, index) => {
    const segments: SignalSegment[] = [
      {
        phaseIndex: index,
        phaseNumber: phase.phaseNumber,
        segmentType: "Green",
        duration: Math.max(1, phase.greenTime),
        movementPermissions: phase.movementPermissions,
        movementSummary: phase.movementSummary,
      },
    ];

    const yellowDuration = Math.min(4, phase.yellowAllRed);
    const allRedDuration = Math.max(0, phase.yellowAllRed - yellowDuration);

    if (yellowDuration > 0) {
      segments.push({
        phaseIndex: index,
        phaseNumber: phase.phaseNumber,
        segmentType: "Yellow",
        duration: yellowDuration,
        movementPermissions: phase.movementPermissions,
        movementSummary: phase.movementSummary,
      });
    }

    if (allRedDuration > 0) {
      segments.push({
        phaseIndex: index,
        phaseNumber: phase.phaseNumber,
        segmentType: "All Red",
        duration: allRedDuration,
        movementPermissions: phase.movementPermissions,
        movementSummary: phase.movementSummary,
      });
    }

    return segments;
  });
}

export function buildSimulationConfig(scenario: ScenarioData): SimulationConfig {
  const cycleLength =
    typeof scenario.signal.cycleLength === "number" && scenario.signal.cycleLength > 0
      ? scenario.signal.cycleLength
      : DEFAULT_CYCLE_LENGTH;

  return {
    cycleLength,
    approachConfigs: buildApproachSimulationConfigs(scenario),
    phaseSegments: buildSignalSegments(scenario),
  };
}
