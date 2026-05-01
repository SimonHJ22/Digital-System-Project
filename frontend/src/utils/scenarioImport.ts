import {
  defaultGeometryData,
  defaultResultsData,
  defaultSignalData,
  defaultTrafficData,
} from "../types/defaults";
import type {
  ApproachDirection,
  ApproachGeometrySettings,
  ApproachTrafficSettings,
  LaneGroupGeometryDefinition,
  LaneGroupInputSettings,
  LaneGroupKey,
  ScenarioData,
} from "../types/traffic";
import { ensurePhaseTimingCount } from "./signalPhases";

const APPROACH_DIRECTIONS: ApproachDirection[] = [
  "Northbound",
  "Southbound",
  "Eastbound",
  "Westbound",
];

const LANE_GROUP_KEYS: LaneGroupKey[] = ["left", "through", "right"];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLaneGroupDefinition(
  value: unknown,
  fallback: LaneGroupGeometryDefinition
): LaneGroupGeometryDefinition {
  if (!isRecord(value)) {
    return clone(fallback);
  }

  const servedMovements = isRecord(value.servedMovements) ? value.servedMovements : {};

  return {
    enabled:
      typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    laneCount:
      typeof value.laneCount === "number" ? value.laneCount : fallback.laneCount,
    servedMovements: {
      left:
        typeof servedMovements.left === "boolean"
          ? servedMovements.left
          : fallback.servedMovements.left,
      through:
        typeof servedMovements.through === "boolean"
          ? servedMovements.through
          : fallback.servedMovements.through,
      right:
        typeof servedMovements.right === "boolean"
          ? servedMovements.right
          : fallback.servedMovements.right,
    },
  };
}

function normalizeLaneGroupInputSettings(
  value: unknown,
  fallback: LaneGroupInputSettings
): LaneGroupInputSettings {
  if (!isRecord(value)) {
    return clone(fallback);
  }

  return {
    leftTurnPhasing:
      value.leftTurnPhasing === "protected" ||
      value.leftTurnPhasing === "permitted" ||
      value.leftTurnPhasing === "protected-permitted"
        ? value.leftTurnPhasing
        : fallback.leftTurnPhasing,
    leftTurnProtectedProportion:
      typeof value.leftTurnProtectedProportion === "number" ||
      value.leftTurnProtectedProportion === ""
        ? value.leftTurnProtectedProportion
        : fallback.leftTurnProtectedProportion,
    leftTurnOpposingFlowVehPerHour:
      typeof value.leftTurnOpposingFlowVehPerHour === "number" ||
      value.leftTurnOpposingFlowVehPerHour === ""
        ? value.leftTurnOpposingFlowVehPerHour
        : fallback.leftTurnOpposingFlowVehPerHour,
    leftTurnPedestrianConflict:
      typeof value.leftTurnPedestrianConflict === "number" ||
      value.leftTurnPedestrianConflict === ""
        ? value.leftTurnPedestrianConflict
        : fallback.leftTurnPedestrianConflict,
    rightTurnProtectedProportion:
      typeof value.rightTurnProtectedProportion === "number" ||
      value.rightTurnProtectedProportion === ""
        ? value.rightTurnProtectedProportion
        : fallback.rightTurnProtectedProportion,
    rightTurnPedestrianConflict:
      typeof value.rightTurnPedestrianConflict === "number" ||
      value.rightTurnPedestrianConflict === ""
        ? value.rightTurnPedestrianConflict
        : fallback.rightTurnPedestrianConflict,
    initialQueueVehicles:
      typeof value.initialQueueVehicles === "number" || value.initialQueueVehicles === ""
        ? value.initialQueueVehicles
        : fallback.initialQueueVehicles,

  };
}

function normalizeApproachGeometry(
  value: unknown,
  fallback: ApproachGeometrySettings
): ApproachGeometrySettings {
  if (!isRecord(value)) {
    return clone(fallback);
  }

  const laneGroupDefinitions = isRecord(value.laneGroupDefinitions)
    ? value.laneGroupDefinitions
    : {};

  return {
    numberOfLanes:
      typeof value.numberOfLanes === "number" ? value.numberOfLanes : fallback.numberOfLanes,
    laneWidth:
      typeof value.laneWidth === "number" || value.laneWidth === ""
        ? value.laneWidth
        : fallback.laneWidth,
    grade:
      typeof value.grade === "number" || value.grade === ""
        ? value.grade
        : fallback.grade,
    storageLength:
      typeof value.storageLength === "number" || value.storageLength === ""
        ? value.storageLength
        : fallback.storageLength,
    exclusiveLeftTurnLane:
      typeof value.exclusiveLeftTurnLane === "boolean"
        ? value.exclusiveLeftTurnLane
        : fallback.exclusiveLeftTurnLane,
    exclusiveRightTurnLane:
      typeof value.exclusiveRightTurnLane === "boolean"
        ? value.exclusiveRightTurnLane
        : fallback.exclusiveRightTurnLane,
    parkingAdjacent:
      typeof value.parkingAdjacent === "boolean"
        ? value.parkingAdjacent
        : fallback.parkingAdjacent,
    busStopNearStopLine:
      typeof value.busStopNearStopLine === "boolean"
        ? value.busStopNearStopLine
        : fallback.busStopNearStopLine,
    leftTurnLanes:
      typeof value.leftTurnLanes === "number" ? value.leftTurnLanes : fallback.leftTurnLanes,
    throughLanes:
      typeof value.throughLanes === "number" ? value.throughLanes : fallback.throughLanes,
    rightTurnLanes:
      typeof value.rightTurnLanes === "number" ? value.rightTurnLanes : fallback.rightTurnLanes,
    laneGroupDefinitions: Object.fromEntries(
      LANE_GROUP_KEYS.map((key) => [
        key,
        normalizeLaneGroupDefinition(laneGroupDefinitions[key], fallback.laneGroupDefinitions[key]),
      ])
    ) as ApproachGeometrySettings["laneGroupDefinitions"],
  };
}

function normalizeApproachTraffic(
  value: unknown,
  fallback: ApproachTrafficSettings
): ApproachTrafficSettings {
  if (!isRecord(value)) {
    return clone(fallback);
  }

  const laneGroups = isRecord(value.laneGroups) ? value.laneGroups : {};

  return {
    analysisPeriodHours:
      typeof value.analysisPeriodHours === "number"
        ? value.analysisPeriodHours
        : fallback.analysisPeriodHours,
    peakHourFactor:
      typeof value.peakHourFactor === "number" || value.peakHourFactor === ""
        ? value.peakHourFactor
        : fallback.peakHourFactor,
    heavyVehiclesPercent:
      typeof value.heavyVehiclesPercent === "number" || value.heavyVehiclesPercent === ""
        ? value.heavyVehiclesPercent
        : fallback.heavyVehiclesPercent,
    arrivalType:
      value.arrivalType === 1 ||
      value.arrivalType === 2 ||
      value.arrivalType === 3 ||
      value.arrivalType === 4 ||
      value.arrivalType === 5 ||
      value.arrivalType === 6
        ? value.arrivalType
        : fallback.arrivalType,
    leftTurnVolume:
      typeof value.leftTurnVolume === "number" || value.leftTurnVolume === ""
        ? value.leftTurnVolume
        : fallback.leftTurnVolume,
    throughVolume:
      typeof value.throughVolume === "number" || value.throughVolume === ""
        ? value.throughVolume
        : fallback.throughVolume,
    rightTurnVolume:
      typeof value.rightTurnVolume === "number" || value.rightTurnVolume === ""
        ? value.rightTurnVolume
        : fallback.rightTurnVolume,
    pedestrianVolume:
      typeof value.pedestrianVolume === "number" || value.pedestrianVolume === ""
        ? value.pedestrianVolume
        : fallback.pedestrianVolume,
    bicycleVolume:
      typeof value.bicycleVolume === "number" || value.bicycleVolume === ""
        ? value.bicycleVolume
        : fallback.bicycleVolume,
    parkingManeuvers:
      typeof value.parkingManeuvers === "number" || value.parkingManeuvers === ""
        ? value.parkingManeuvers
        : fallback.parkingManeuvers,
    busesStopping:
      typeof value.busesStopping === "number" || value.busesStopping === ""
        ? value.busesStopping
        : fallback.busesStopping,
    rightTurnOnRedPermitted:
      typeof value.rightTurnOnRedPermitted === "boolean"
        ? value.rightTurnOnRedPermitted
        : fallback.rightTurnOnRedPermitted,
    observedRTORVolume:
      typeof value.observedRTORVolume === "number" || value.observedRTORVolume === ""
        ? value.observedRTORVolume
        : fallback.observedRTORVolume,
    laneGroups: Object.fromEntries(
      LANE_GROUP_KEYS.map((key) => [
        key,
        normalizeLaneGroupInputSettings(laneGroups[key], fallback.laneGroups[key]),
      ])
    ) as ApproachTrafficSettings["laneGroups"],
  };
}

export function buildScenarioTemplate(): ScenarioData {
  return {
    scenarioName: "Imported Scenario",
    geometry: clone(defaultGeometryData),
    traffic: clone(defaultTrafficData),
    signal: clone(defaultSignalData),
    results: clone(defaultResultsData),
  };
}

export function normalizeImportedScenario(rawValue: unknown): ScenarioData {
  if (!isRecord(rawValue)) {
    throw new Error("Imported file must contain a JSON object.");
  }

  const template = buildScenarioTemplate();
  const rawGeometry = isRecord(rawValue.geometry) ? rawValue.geometry : {};
  const rawTraffic = isRecord(rawValue.traffic) ? rawValue.traffic : {};
  const rawSignal = isRecord(rawValue.signal) ? rawValue.signal : {};
  const rawGeometryApproaches = isRecord(rawGeometry.approaches) ? rawGeometry.approaches : {};
  const rawTrafficApproaches = isRecord(rawTraffic.approaches) ? rawTraffic.approaches : {};
  const selectedApproach =
    rawGeometry.selectedApproach === "Northbound" ||
    rawGeometry.selectedApproach === "Southbound" ||
    rawGeometry.selectedApproach === "Eastbound" ||
    rawGeometry.selectedApproach === "Westbound"
      ? rawGeometry.selectedApproach
      : template.geometry.selectedApproach;
  const approachDirection =
    rawTraffic.approachDirection === "Northbound" ||
    rawTraffic.approachDirection === "Southbound" ||
    rawTraffic.approachDirection === "Eastbound" ||
    rawTraffic.approachDirection === "Westbound"
      ? rawTraffic.approachDirection
      : template.traffic.approachDirection;

  const approachesGeometry = Object.fromEntries(
    APPROACH_DIRECTIONS.map((direction) => [
      direction,
      normalizeApproachGeometry(
        rawGeometryApproaches[direction],
        template.geometry.approaches[direction]
      ),
    ])
  ) as ScenarioData["geometry"]["approaches"];

  const approachesTraffic = Object.fromEntries(
    APPROACH_DIRECTIONS.map((direction) => [
      direction,
      normalizeApproachTraffic(
        rawTrafficApproaches[direction],
        template.traffic.approaches[direction]
      ),
    ])
  ) as ScenarioData["traffic"]["approaches"];

  const normalizedSignal = {
    ...template.signal,
    ...(isRecord(rawSignal) ? rawSignal : {}),
    controlType:
      rawSignal.controlType === "Pretimed" ||
      rawSignal.controlType === "Actuated" ||
      rawSignal.controlType === "Semiactuated"
        ? rawSignal.controlType
        : template.signal.controlType,
    numberOfPhases:
      typeof rawSignal.numberOfPhases === "number"
        ? rawSignal.numberOfPhases
        : template.signal.numberOfPhases,
    pedestrianPushButtonEnabled:
      typeof rawSignal.pedestrianPushButtonEnabled === "boolean"
        ? rawSignal.pedestrianPushButtonEnabled
        : template.signal.pedestrianPushButtonEnabled,
    cycleLength:
      typeof rawSignal.cycleLength === "number" || rawSignal.cycleLength === ""
        ? rawSignal.cycleLength
        : template.signal.cycleLength,
    analysisPeriodHours:
      typeof rawSignal.analysisPeriodHours === "number"
        ? rawSignal.analysisPeriodHours
        : template.signal.analysisPeriodHours,
    minimumPedestrianGreen:
      typeof rawSignal.minimumPedestrianGreen === "number" ||
      rawSignal.minimumPedestrianGreen === ""
        ? rawSignal.minimumPedestrianGreen
        : template.signal.minimumPedestrianGreen,
    notes: typeof rawSignal.notes === "string" ? rawSignal.notes : template.signal.notes,
  };

  const phases = ensurePhaseTimingCount(
    Array.isArray(rawSignal.phases) ? rawSignal.phases : [],
    normalizedSignal.numberOfPhases
  );

  return {
    scenarioName:
      typeof rawValue.scenarioName === "string" && rawValue.scenarioName.trim().length > 0
        ? rawValue.scenarioName
        : template.scenarioName,
    geometry: {
      ...template.geometry,
      ...(isRecord(rawGeometry) ? rawGeometry : {}),
      selectedApproach,
      approaches: approachesGeometry,
      ...approachesGeometry[selectedApproach],
    },
    traffic: {
      ...template.traffic,
      ...(isRecord(rawTraffic) ? rawTraffic : {}),
      approachDirection,
      approaches: approachesTraffic,
      ...approachesTraffic[approachDirection],
    },
    signal: {
      ...normalizedSignal,
      phases,
    },
    results: null,
  };
}
