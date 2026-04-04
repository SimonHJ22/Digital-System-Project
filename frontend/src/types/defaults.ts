import type {
  ApproachDirection,
  ApproachGeometryMap,
  ApproachGeometrySettings,
  LaneGroupGeometryDefinitionMap,
  LaneGroupInputMap,
  LaneGroupInputSettings,
  ApproachTrafficMap,
  ApproachTrafficSettings,
  GeometryData,
  ResultsData,
  SignalData,
  TrafficData,
} from "./traffic";
import { ensurePhaseTimingCount } from "../utils/signalPhases";

function createDefaultLaneGroupGeometryMap(): LaneGroupGeometryDefinitionMap {
  return {
    left: {
      enabled: false,
      laneCount: 0,
      servedMovements: {
        left: true,
        through: false,
        right: false,
      },
    },
    through: {
      enabled: true,
      laneCount: 1,
      servedMovements: {
        left: false,
        through: true,
        right: false,
      },
    },
    right: {
      enabled: false,
      laneCount: 0,
      servedMovements: {
        left: false,
        through: false,
        right: true,
      },
    },
  };
}

function createDefaultApproachGeometry(): ApproachGeometrySettings {
  return {
    numberOfLanes: 1,
    laneWidth: "",
    grade: "",
    storageLength: "",
    exclusiveLeftTurnLane: false,
    exclusiveRightTurnLane: false,
    parkingAdjacent: false,
    busStopNearStopLine: false,
    leftTurnLanes: 0,
    throughLanes: 1,
    rightTurnLanes: 0,
    laneGroupDefinitions: createDefaultLaneGroupGeometryMap(),
  };
}

function createDefaultApproachTraffic(): ApproachTrafficSettings {
  return {
    analysisPeriodHours: 0.25,
    peakHourFactor: "",
    heavyVehiclesPercent: "",
    arrivalType: 3,
    leftTurnVolume: "",
    throughVolume: "",
    rightTurnVolume: "",
    pedestrianVolume: "",
    bicycleVolume: "",
    parkingManeuvers: "",
    busesStopping: "",
    rightTurnOnRedPermitted: false,
    observedRTORVolume: "",
    laneGroups: createDefaultLaneGroupInputMap(),
  };
}

function createDefaultLaneGroupInput(): LaneGroupInputSettings {
  return {
    leftTurnPhasing: "protected",
    leftTurnProtectedProportion: 1,
    leftTurnOpposingFlowVehPerHour: "",
    leftTurnPedestrianConflict: "",
    rightTurnProtectedProportion: "",
    rightTurnPedestrianConflict: "",
    initialQueueVehicles: "",
  };
}

function createDefaultLaneGroupInputMap(): LaneGroupInputMap {
  return {
    left: createDefaultLaneGroupInput(),
    through: createDefaultLaneGroupInput(),
    right: createDefaultLaneGroupInput(),
  };
}

function createApproachMap<T>(factory: () => T): Record<ApproachDirection, T> {
  return {
    Northbound: factory(),
    Southbound: factory(),
    Eastbound: factory(),
    Westbound: factory(),
  };
}

export const defaultApproachGeometryMap: ApproachGeometryMap = createApproachMap(
  createDefaultApproachGeometry
);

export const defaultApproachTrafficMap: ApproachTrafficMap = createApproachMap(
  createDefaultApproachTraffic
);

const defaultSelectedGeometry = defaultApproachGeometryMap.Northbound;
const defaultSelectedTraffic = defaultApproachTrafficMap.Northbound;

export const defaultGeometryData: GeometryData = {
  intersectionName: "",
  areaType: "Other",
  numberOfApproaches: 4,
  selectedApproach: "Northbound",
  approaches: defaultApproachGeometryMap,
  numberOfLanes: defaultSelectedGeometry.numberOfLanes,
  laneWidth: defaultSelectedGeometry.laneWidth,
  grade: defaultSelectedGeometry.grade,
  storageLength: defaultSelectedGeometry.storageLength,
  exclusiveLeftTurnLane: defaultSelectedGeometry.exclusiveLeftTurnLane,
  exclusiveRightTurnLane: defaultSelectedGeometry.exclusiveRightTurnLane,
  parkingAdjacent: defaultSelectedGeometry.parkingAdjacent,
  busStopNearStopLine: defaultSelectedGeometry.busStopNearStopLine,
  leftTurnLanes: defaultSelectedGeometry.leftTurnLanes,
  throughLanes: defaultSelectedGeometry.throughLanes,
  rightTurnLanes: defaultSelectedGeometry.rightTurnLanes,
  laneGroupDefinitions: defaultSelectedGeometry.laneGroupDefinitions,
};

export const defaultTrafficData: TrafficData = {
  approachDirection: "Northbound",
  approaches: defaultApproachTrafficMap,
  analysisPeriodHours: defaultSelectedTraffic.analysisPeriodHours,
  peakHourFactor: defaultSelectedTraffic.peakHourFactor,
  heavyVehiclesPercent: defaultSelectedTraffic.heavyVehiclesPercent,
  arrivalType: defaultSelectedTraffic.arrivalType,
  leftTurnVolume: defaultSelectedTraffic.leftTurnVolume,
  throughVolume: defaultSelectedTraffic.throughVolume,
  rightTurnVolume: defaultSelectedTraffic.rightTurnVolume,
  pedestrianVolume: defaultSelectedTraffic.pedestrianVolume,
  bicycleVolume: defaultSelectedTraffic.bicycleVolume,
  parkingManeuvers: defaultSelectedTraffic.parkingManeuvers,
  busesStopping: defaultSelectedTraffic.busesStopping,
  rightTurnOnRedPermitted: defaultSelectedTraffic.rightTurnOnRedPermitted,
  observedRTORVolume: defaultSelectedTraffic.observedRTORVolume,
};

export const defaultSignalData: SignalData = {
  controlType: "Pretimed",
  numberOfPhases: 2,
  pedestrianPushButtonEnabled: false,
  cycleLength: "",
  analysisPeriodHours: 0.25,
  minimumPedestrianGreen: "",
  phases: ensurePhaseTimingCount([], 2),
  notes: "",
};

export const defaultResultsData: ResultsData = {
  scenarioName: "Baseline Scenario",
  intersection: "Not set yet",
  controlType: "--",
  cycleLength: "-- s",
  kpis: {
    intersectionDelay: "-- s/veh",
    levelOfService: "--",
    progressionFactor: "--",
    maxBackOfQueue: "-- veh",
    criticalVCRatio: "--",
    analysisStatus: "Not Run",
  },
  laneGroupResults: [
    {
      laneGroup: "NB Through",
      delay: "--",
      los: "--",
      vcRatio: "--",
      backOfQueue: "--",
    },
    {
      laneGroup: "SB Through",
      delay: "--",
      los: "--",
      vcRatio: "--",
      backOfQueue: "--",
    },
    {
      laneGroup: "EB Through/Right",
      delay: "--",
      los: "--",
      vcRatio: "--",
      backOfQueue: "--",
    },
    {
      laneGroup: "WB Through/Right",
      delay: "--",
      los: "--",
      vcRatio: "--",
      backOfQueue: "--",
    },
  ],
  approachResults: [
    {
      approach: "Northbound",
      delay: "--",
      los: "--",
      adjustedFlow: "--",
    },
    {
      approach: "Southbound",
      delay: "--",
      los: "--",
      adjustedFlow: "--",
    },
    {
      approach: "Eastbound",
      delay: "--",
      los: "--",
      adjustedFlow: "--",
    },
    {
      approach: "Westbound",
      delay: "--",
      los: "--",
      adjustedFlow: "--",
    },
  ],
};
