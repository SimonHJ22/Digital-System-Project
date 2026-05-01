import type {
  ApproachDirection,
  LaneGroupKey,
  ResultsData,
  ScenarioData,
} from "../types/traffic";
import { ensurePhaseTimingCount, getServedApproachDirections } from "../utils/signalPhases";
import type {
  Approach,
  AreaType,
  Direction,
  FifteenMinuteCount,
  Intersection,
  Lane,
  LaneGroup,
  MovementType,
  SignalPhase,
  SaturationFlowAdjustmentFactors,
} from "./models";
import { analyzeLaneGroups } from "./engine/analysis";
import { getLosFromDelay } from "./engine/los";


type AdapterOutput = {
  intersection: Intersection;
  assumptions: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toAreaType(areaType: ScenarioData["geometry"]["areaType"]): AreaType {
  return areaType === "CBD" ? "cbd" : "other";
}

function getDirections(): Direction[] {
  return ["north", "south", "east", "west"];
}

function getDirectionLabel(direction: Direction): string {
  if (direction === "north") return "Northbound";
  if (direction === "south") return "Southbound";
  if (direction === "east") return "Eastbound";
  return "Westbound";
}

function getDirectionShortLabel(direction: Direction): string {
  if (direction === "north") return "NB";
  if (direction === "south") return "SB";
  if (direction === "east") return "EB";
  return "WB";
}

function toApproachDirection(direction: Direction) {
  if (direction === "north") return "Northbound";
  if (direction === "south") return "Southbound";
  if (direction === "east") return "Eastbound";
  return "Westbound";
}

function createQuarterHourCounts(
  hourlyVolume: number,
  peakHourFactor: number
): FifteenMinuteCount {
  const safeHourlyVolume = Math.max(0, hourlyVolume);
  const safePhf = peakHourFactor > 0 ? peakHourFactor : 1;

  if (safeHourlyVolume <= 0) {
    return {
      interval1: 0,
      interval2: 0,
      interval3: 0,
      interval4: 0,
    };
  }

  const peakQuarter = Math.min(safeHourlyVolume, safeHourlyVolume / (4 * safePhf));
  const remaining = Math.max(0, safeHourlyVolume - peakQuarter);
  const otherQuarter = remaining / 3;

  return {
    interval1: Math.round(peakQuarter),
    interval2: Math.round(otherQuarter),
    interval3: Math.round(otherQuarter),
    interval4: Math.max(
      0,
      Math.round(safeHourlyVolume) -
        Math.round(peakQuarter) -
        Math.round(otherQuarter) -
        Math.round(otherQuarter)
    ),
  };
}

function createDefaultSaturationFlowFactors(): SaturationFlowAdjustmentFactors {
  return {
    laneWidthFactor: 1,
    heavyVehicleFactor: 1,
    gradeFactor: 1,
    parkingFactor: 1,
    busBlockageFactor: 1,
    areaTypeFactor: 1,
    laneUtilizationFactor: 1,
    leftTurnFactor: 1,
    rightTurnFactor: 1,
    leftTurnPedestrianFactor: 1,
    rightTurnPedestrianFactor: 1,
  };
}

function getProgressionAdjustmentFactor(arrivalType: ScenarioData["traffic"]["arrivalType"]): number {
  if (arrivalType >= 5) return 0.85;
  if (arrivalType === 4) return 0.9;
  if (arrivalType === 3) return 1;
  return 1.1;
}

function getLeftTurnProtectedProportion(
  phasing: string,
  value: number | ""
): number {
  if (typeof value === "number") {
    return clamp(value, 0, 1);
  }

  if (phasing === "protected") return 1;
  if (phasing === "permitted") return 0;
  return 0.5;
}

function getOptionalNumber(value: number | ""): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getServedMovementsFromDefinition(
  definition: ScenarioData["geometry"]["approaches"][ApproachDirection]["laneGroupDefinitions"]["left"]
): MovementType[] {
  return (["left", "through", "right"] as MovementType[]).filter(
    (movement) => definition.servedMovements[movement]
  );
}

function createApproachLanesAndGroups(
  approachId: string,
  laneWidthMeters: number,
  laneGroupDefinitions: ScenarioData["geometry"]["approaches"][ApproachDirection]["laneGroupDefinitions"],
  laneGroupInputs: ScenarioData["traffic"]["approaches"][ApproachDirection]["laneGroups"]
): { lanes: Lane[]; laneGroups: LaneGroup[] } {
  const lanes: Lane[] = [];
  const laneGroups: LaneGroup[] = [];
  let laneSerial = 0;

  const addLane = (allowedMovements: MovementType[]): string => {
    laneSerial += 1;
    const laneId = `${approachId}_lane_${laneSerial}`;
    lanes.push({
      id: laneId,
      widthMeters: laneWidthMeters,
      allowedMovements,
    });
    return laneId;
  };

  const configuredGroups = (
    Object.entries(laneGroupDefinitions) as Array<
      [
        LaneGroupKey,
        (typeof laneGroupDefinitions)[LaneGroupKey],
      ]
    >
  )
    .map(([groupKey, definition]) => ({
      groupKey,
      definition,
      servedMovements: getServedMovementsFromDefinition(definition),
    }))
    .filter(
      ({ definition, servedMovements }) =>
        definition.enabled && definition.laneCount > 0 && servedMovements.length > 0
    );

  const activeGroups = configuredGroups;


  activeGroups.forEach(({ groupKey, definition, servedMovements }) => {
    const groupInputs = laneGroupInputs[groupKey];
    const laneIds = Array.from({ length: Math.max(1, definition.laneCount) }, () =>
      addLane(servedMovements)
    );

    laneGroups.push({
      id: `${approachId}_lg_${groupKey}`,
      laneIds,
      servedMovements,
      leftTurnPhasing: servedMovements.includes("left")

        ? groupInputs.leftTurnPhasing
        : undefined,
      leftTurnProtectedProportion: servedMovements.includes("left")
        ? getLeftTurnProtectedProportion(
            groupInputs.leftTurnPhasing,
            groupInputs.leftTurnProtectedProportion
          )
        : undefined,
      leftTurnOpposingFlowVehPerHour: servedMovements.includes("left")
        ? getOptionalNumber(groupInputs.leftTurnOpposingFlowVehPerHour) ?? 0
        : undefined,
      leftTurnPedestrianConflict: servedMovements.includes("left")
        ? getOptionalNumber(groupInputs.leftTurnPedestrianConflict) ?? 0
        : undefined,
      rightTurnProtectedProportion: servedMovements.includes("right")
        ? getOptionalNumber(groupInputs.rightTurnProtectedProportion) ?? 0
        : undefined,
      rightTurnPedestrianConflict: servedMovements.includes("right")
        ? getOptionalNumber(groupInputs.rightTurnPedestrianConflict) ?? 0
        : undefined,
      initialQueueVehicles: getOptionalNumber(groupInputs.initialQueueVehicles) ?? 0,
    });
  });

  return { lanes, laneGroups };
}

export function buildHcmIntersectionFromScenario(scenario: ScenarioData): AdapterOutput {
  const approaches: Approach[] = getDirections().map((direction) => {
    const approachDirection = toApproachDirection(direction);
    const geometryForApproach = scenario.geometry.approaches[approachDirection];
    const trafficForApproach = scenario.traffic.approaches[approachDirection];
    const laneWidthMeters =
      typeof geometryForApproach.laneWidth === "number" && geometryForApproach.laneWidth > 0
        ? geometryForApproach.laneWidth
        : 3.6;
    const rawLeftTurnVolume = Math.max(
      0,
      Number(trafficForApproach.leftTurnVolume || 0)
    );
    const rawThroughVolume = Math.max(
      0,
      Number(trafficForApproach.throughVolume || 0)
    );
    const rawRightTurnVolume = Math.max(
      0,
      Number(trafficForApproach.rightTurnVolume || 0)
    );
    const peakHourFactor =
      typeof trafficForApproach.peakHourFactor === "number" &&
      trafficForApproach.peakHourFactor > 0
        ? trafficForApproach.peakHourFactor
        : 0.92;
    // If RTOR is permitted, remove the observed RTOR volume from the approach
    // right-turn demand before building the HCM lane-group counts.
    const observedRtorVolume =
      trafficForApproach.rightTurnOnRedPermitted &&
      typeof trafficForApproach.observedRTORVolume === "number"
        ? clamp(trafficForApproach.observedRTORVolume, 0, rawRightTurnVolume)
        : 0;

    const leftTurnVolume = rawLeftTurnVolume;
    const throughVolume = rawThroughVolume;
    const rightTurnVolume = Math.max(
      0,
      rawRightTurnVolume - observedRtorVolume
    );

    const heavyVehiclesPercent = clamp(
      Number(trafficForApproach.heavyVehiclesPercent || 0),
      0,
      100
    );
    const busShare = Math.min(heavyVehiclesPercent, Math.round(heavyVehiclesPercent * 0.35));
    const hgvShare = Math.max(0, heavyVehiclesPercent - busShare);
    const approachId = `${direction}_approach`;
    const { lanes, laneGroups } = createApproachLanesAndGroups(
      approachId,
      laneWidthMeters,
      geometryForApproach.laneGroupDefinitions,
      trafficForApproach.laneGroups
    );

    return {
      id: approachId,
      direction,
      lanes,
      laneGroups,
      rawCounts15Min: {
        left: createQuarterHourCounts(leftTurnVolume, peakHourFactor),
        through: createQuarterHourCounts(throughVolume, peakHourFactor),
        right: createQuarterHourCounts(rightTurnVolume, peakHourFactor),
      },
      vehicleComposition: {
        car: Math.max(0, 100 - heavyVehiclesPercent),
        motorcycle: 0,
        bus: busShare,
        hgv: hgvShare,
      },
      parkingManeuversPerHour: Number(trafficForApproach.parkingManeuvers || 0),
      busesStoppingPerHour: Number(trafficForApproach.busesStopping || 0),
      areaType: toAreaType(scenario.geometry.areaType),
      progressionAdjustmentFactor: getProgressionAdjustmentFactor(trafficForApproach.arrivalType),
      saturationFlowFactors: createDefaultSaturationFlowFactors(),
      gradePercent: Number(geometryForApproach.grade || 0),
    };
  });

  const cycleLength =
    typeof scenario.signal.cycleLength === "number" && scenario.signal.cycleLength > 0
      ? scenario.signal.cycleLength
      : 90;
  const queueSignalType =
    scenario.signal.controlType === "Actuated" || scenario.signal.controlType === "Semiactuated"
      ? "actuated"
      : "pretimed";
  const normalizedSignalPhases = ensurePhaseTimingCount(
    scenario.signal.phases,
    scenario.signal.numberOfPhases
  );
  const phases: SignalPhase[] =
    normalizedSignalPhases.length > 0
      ? normalizedSignalPhases
          .map((phase, index) => {
            const servedApproaches = getServedApproachDirections(
              phase.movementPermissions
            ).map((approachDirection) => {
              const direction = approachDirection.replace("bound", "").toLowerCase();
              return `${direction}_approach`;
            });
            const greenSeconds = getConfiguredGreenSeconds(
              phase,
              cycleLength,
              scenario.signal.numberOfPhases
            );
            const yellowAllRed =
              typeof phase.yellowAllRed === "number" && phase.yellowAllRed >= 0
                ? phase.yellowAllRed
                : 4;

            return {
              id: `phase_${index + 1}`,
              name: `Phase ${phase.phaseNumber || index + 1}`,
              greenSeconds,
              yellowSeconds: Math.min(4, yellowAllRed),
              allRedSeconds: Math.max(0, yellowAllRed - Math.min(4, yellowAllRed)),
              effectiveGreenSeconds: greenSeconds,

              queueSignalType,
              progressionAdjustmentFactor: getProgressionAdjustmentFactor(
                scenario.traffic.approaches.Northbound.arrivalType
              ),
              incrementalDelayAnalysisPeriodHours:
                scenario.signal.analysisPeriodHours ||
                scenario.traffic.approaches.Northbound.analysisPeriodHours ||
                1,
              incrementalDelayKFactor: 0.5,
              upstreamFilteringFactor: 1,
              servedApproaches:
                servedApproaches.length > 0
                  ? servedApproaches
                  : getDirections().map((direction) => `${direction}_approach`),
            };
          })
      : [
          {
            id: "phase_1",
            name: "Phase 1",
            greenSeconds: Math.max(10, Math.round(cycleLength / 2)),
            yellowSeconds: 3,
            allRedSeconds: 1,
            effectiveGreenSeconds: Math.max(10, Math.round(cycleLength / 2)),

            queueSignalType,
            progressionAdjustmentFactor: getProgressionAdjustmentFactor(
              scenario.traffic.approaches.Northbound.arrivalType
            ),
            incrementalDelayAnalysisPeriodHours:
              scenario.signal.analysisPeriodHours ||
              scenario.traffic.approaches.Northbound.analysisPeriodHours ||
              1,
            incrementalDelayKFactor: 0.5,
            upstreamFilteringFactor: 1,
            servedApproaches: getDirections().map((direction) => `${direction}_approach`),
          },
        ];

  return {
    intersection: {
      id: "scenario_intersection",
      name: scenario.geometry.intersectionName || "Not set yet",
      approaches,
      phases,
      cycleLength,
    },
    assumptions: [
      "Approach demand and geometry now come from per-direction scenario inputs instead of a symmetric demand copy.",
      "Lane groups now come from explicit per-approach lane-group composition instead of inferred left/through/right lane-count assumptions.",
      "Lane-group phasing, pedestrian conflict, opposing flow, and initial queue values now come from explicit UI inputs, but detailed HCM case coverage remains partial.",
      "Signal phase service now comes from structured movement permissions shared by the Signal, Results, and Simulation modules.",
    ],
  };
}


function formatMovementLabel(servedMovements: string[]): string {
  return servedMovements
    .map((movement) => movement.charAt(0).toUpperCase() + movement.slice(1))
    .join("/");
}

function getConfiguredGreenSeconds(
  phase: ScenarioData["signal"]["phases"][number],
  cycleLength: number,
  phaseCount: number
): number {
  return typeof phase.greenTime === "number" && phase.greenTime > 0
    ? phase.greenTime
    : Math.max(10, Math.round(cycleLength / Math.max(1, phaseCount)));
}

function doesPhaseServeLaneGroup(
  phase: ScenarioData["signal"]["phases"][number],
  approachDirection: ApproachDirection,
  laneGroup: LaneGroup
): boolean {
  return laneGroup.servedMovements.some((movement) =>
    Boolean(phase.movementPermissions[approachDirection][movement])
  );
}

function buildLaneGroupSignalPhase(
  scenario: ScenarioData,
  intersection: Intersection,
  approach: Approach,
  laneGroup: LaneGroup
): SignalPhase {
  const approachDirection = toApproachDirection(approach.direction);
  const normalizedSignalPhases = ensurePhaseTimingCount(
    scenario.signal.phases,
    scenario.signal.numberOfPhases
  );

  // Lane groups can be served in more than one phase, so effective service is
  // built from the phases whose movement permissions include that lane group.
  const matchingPhases = normalizedSignalPhases.filter((phase) =>
    doesPhaseServeLaneGroup(phase, approachDirection, laneGroup)
  );

  const totalGreenSeconds = matchingPhases.reduce(
    (sum, phase) =>
      sum +
      getConfiguredGreenSeconds(
        phase,
        intersection.cycleLength,
        scenario.signal.numberOfPhases
      ),
    0
  );

  const fallbackGreenSeconds = Math.max(
    10,
    Math.round(
      intersection.cycleLength / Math.max(1, scenario.signal.numberOfPhases)
    )
  );

  const effectiveGreenSeconds =
    totalGreenSeconds > 0 ? totalGreenSeconds : fallbackGreenSeconds;

  return {
    id: `${laneGroup.id}_phase`,
    name: `Phase service for ${laneGroup.id}`,
    greenSeconds: effectiveGreenSeconds,
    yellowSeconds: 0,
    allRedSeconds: 0,
    effectiveGreenSeconds,
    queueSignalType:
      scenario.signal.controlType === "Actuated" ||
      scenario.signal.controlType === "Semiactuated"
        ? "actuated"
        : "pretimed",
    progressionAdjustmentFactor: getProgressionAdjustmentFactor(
      scenario.traffic.approaches[approachDirection].arrivalType
    ),
    incrementalDelayAnalysisPeriodHours:
      scenario.signal.analysisPeriodHours ||
      scenario.traffic.approaches[approachDirection].analysisPeriodHours ||
      1,
    incrementalDelayKFactor: 0.5,
    upstreamFilteringFactor: 1,
    servedApproaches: [approach.id],
  };
}

type LaneGroupCriticalEntry = {
  approach: Approach;
  laneGroup: {
    adjustedVolume: number;
    saturationFlow: number;
  };
};

function getCriticalFlowGroupKey(direction: Direction): "ns" | "ew" {
  return direction === "north" || direction === "south" ? "ns" : "ew";
}

function calculateIntersectionCriticalVCRatio(
  scenario: ScenarioData,
  laneGroupEntries: LaneGroupCriticalEntry[],
  cycleLength: number
): number {
  if (laneGroupEntries.length === 0 || cycleLength <= 0) {
    return 0;
  }

  // Approximate the intersection critical v/c ratio from the highest lane-group
  // flow ratio in each major corridor family, then normalize by effective cycle.
  const criticalFlowRatiosByGroup = new Map<"ns" | "ew", number>();

  laneGroupEntries.forEach(({ approach, laneGroup }) => {
    if (!Number.isFinite(laneGroup.saturationFlow) || laneGroup.saturationFlow <= 0) {
      return;
    }

    const flowRatio = laneGroup.adjustedVolume / laneGroup.saturationFlow;
    const groupKey = getCriticalFlowGroupKey(approach.direction);

    criticalFlowRatiosByGroup.set(
      groupKey,
      Math.max(criticalFlowRatiosByGroup.get(groupKey) ?? 0, flowRatio)
    );
  });

  const criticalFlowRatioSum = Array.from(
    criticalFlowRatiosByGroup.values()
  ).reduce((sum, ratio) => sum + ratio, 0);

  const normalizedSignalPhases = ensurePhaseTimingCount(
    scenario.signal.phases,
    scenario.signal.numberOfPhases
  );

  const totalClearanceLostTime = normalizedSignalPhases.reduce((sum, phase) => {
    const yellowAllRed =
      typeof phase.yellowAllRed === "number" && phase.yellowAllRed >= 0
        ? phase.yellowAllRed
        : 4;

    return sum + yellowAllRed;
  }, 0);

  const startupLostTimeSeconds = criticalFlowRatiosByGroup.size * 2;

  const effectiveCycleRatio = Math.max(
    0.05,
    1 - (totalClearanceLostTime + startupLostTimeSeconds) / cycleLength
  );

  return criticalFlowRatioSum / effectiveCycleRatio;
}



function isAnalyzableApproach(approach: Approach): boolean {
  return approach.lanes.length > 0 && approach.laneGroups.length > 0;
}


export function runHcmAnalysisForScenario(scenario: ScenarioData): ResultsData {
  const { intersection, assumptions } = buildHcmIntersectionFromScenario(scenario);

  const analyzableApproaches = intersection.approaches.filter(isAnalyzableApproach);

  const approachResults = analyzableApproaches.map((approach) => {
    const laneGroups = approach.laneGroups.map((laneGroup) => {
      const laneGroupPhase = buildLaneGroupSignalPhase(
        scenario,
        intersection,
        approach,
        laneGroup
      );
      const laneGroupResults = analyzeLaneGroups(
        approach,
        laneGroupPhase,
        intersection.cycleLength
      );

      return (
        laneGroupResults.find(
          (candidate) => candidate.laneGroupId === laneGroup.id
        ) ?? laneGroupResults[0]
      );
    });

    const adjustedVolume = laneGroups.reduce(
      (sum, laneGroup) => sum + laneGroup.adjustedVolume,
      0
    );

    const controlDelay =
      adjustedVolume > 0
        ? laneGroups.reduce(
            (sum, laneGroup) =>
              sum + laneGroup.controlDelay * laneGroup.adjustedVolume,
            0
          ) / adjustedVolume
        : 0;

    const percentile95Queue = Math.max(
      ...laneGroups.map((laneGroup) => laneGroup.percentile95Queue),
      0
    );

    return {
      approach,
      result: {
        controlDelay,
        los: getLosFromDelay(controlDelay),
        adjustedVolume,
        percentile95Queue,
      },
      laneGroups,
    };
  });

  const allLaneGroups = approachResults.flatMap(({ approach, laneGroups }) =>
    laneGroups.map((laneGroup) => ({
      approach,
      laneGroup,
    }))
  );

  const worstApproach = approachResults.reduce((worst, current) =>
    current.result.controlDelay > worst.result.controlDelay ? current : worst
  );

  const criticalVCRatio = calculateIntersectionCriticalVCRatio(
    scenario,
    allLaneGroups,
    intersection.cycleLength
  );


  const totalAdjustedVolume = approachResults.reduce(
    (sum, entry) => sum + entry.result.adjustedVolume,
    0
  );

  const averageDelay =
    totalAdjustedVolume > 0
      ? approachResults.reduce(
          (sum, entry) =>
            sum + entry.result.controlDelay * entry.result.adjustedVolume,
          0
        ) / totalAdjustedVolume
      : 0;

  const maxQueue = Math.max(
    ...allLaneGroups.map((entry) => entry.laneGroup.percentile95Queue),
    0
  );


  return {
    scenarioName: scenario.scenarioName,
    intersection: intersection.name,
    controlType: scenario.signal.controlType,
    cycleLength: `${intersection.cycleLength} s`,
    kpis: {
      intersectionDelay: `${averageDelay.toFixed(1)} s/veh`,
      levelOfService: worstApproach.result.los,
      progressionFactor: `${(worstApproach.approach.progressionAdjustmentFactor ?? 1).toFixed(2)}`,
      maxBackOfQueue: `${Math.round(maxQueue)} veh`,
      criticalVCRatio: criticalVCRatio.toFixed(2),
      analysisStatus: `HCM-Oriented Run (${assumptions.length} adapter notes)`,

    },
    laneGroupResults: allLaneGroups.map(({ approach, laneGroup }) => ({
      laneGroup: `${getDirectionShortLabel(approach.direction)} ${formatMovementLabel(
        laneGroup.servedMovements
      )}`,
      delay: laneGroup.controlDelay.toFixed(1),
      los: laneGroup.los,
      vcRatio: laneGroup.volumeToCapacityRatio.toFixed(2),
      backOfQueue: `${Math.round(laneGroup.percentile95Queue)} veh`,
    })),
    approachResults: approachResults.map(({ approach, result }) => ({
      approach: getDirectionLabel(approach.direction),
      delay: result.controlDelay.toFixed(1),
      los: result.los,
      adjustedFlow: Math.round(result.adjustedVolume).toString(),
    })),
  };
}
