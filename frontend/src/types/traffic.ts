export type AreaType = "CBD" | "Other";

export type ControlType = "Pretimed" | "Actuated" | "Semiactuated";

export type ApproachDirection =
  | "Northbound"
  | "Southbound"
  | "Eastbound"
  | "Westbound";

export type ArrivalType = 1 | 2 | 3 | 4 | 5 | 6;
export type LeftTurnPhasing = "protected" | "permitted" | "protected-permitted";
export type LaneGroupKey = "left" | "through" | "right";
export type PhaseMovementPermissions = Record<
  ApproachDirection,
  Record<LaneGroupKey, boolean>
>;

export interface LaneGroupGeometryDefinition {
  enabled: boolean;
  laneCount: number;
  servedMovements: Record<LaneGroupKey, boolean>;
}

export type LaneGroupGeometryDefinitionMap = Record<
  LaneGroupKey,
  LaneGroupGeometryDefinition
>;

export type LaneGroupGeometryDefinitionPatch = Partial<
  Omit<LaneGroupGeometryDefinition, "servedMovements">
> & {
  servedMovements?: Partial<LaneGroupGeometryDefinition["servedMovements"]>;
};

export interface LaneGroupInputSettings {
  leftTurnPhasing: LeftTurnPhasing;
  leftTurnProtectedProportion: number | "";
  leftTurnOpposingFlowVehPerHour: number | "";
  leftTurnPedestrianConflict: number | "";
  rightTurnProtectedProportion: number | "";
  rightTurnPedestrianConflict: number | "";
  leftTurnFactorOverride: number | "";
  rightTurnFactorOverride: number | "";
  leftTurnPedestrianFactorOverride: number | "";
  rightTurnPedestrianFactorOverride: number | "";
  saturationFlowOverrideVehPerHour: number | "";
  initialQueueVehicles: number | "";
}



export type LaneGroupInputMap = Record<LaneGroupKey, LaneGroupInputSettings>;

export interface ApproachGeometrySettings {
  numberOfLanes: number;
  laneWidth: number | "";
  grade: number | "";
  storageLength: number | "";
  exclusiveLeftTurnLane: boolean;
  exclusiveRightTurnLane: boolean;
  parkingAdjacent: boolean;
  busStopNearStopLine: boolean;
  leftTurnLanes: number;
  throughLanes: number;
  rightTurnLanes: number;
  laneGroupDefinitions: LaneGroupGeometryDefinitionMap;
}

export interface ApproachTrafficSettings {
  analysisPeriodHours: number;
  peakHourFactor: number | "";
  heavyVehiclesPercent: number | "";
  arrivalType: ArrivalType;
  leftTurnVolume: number | "";
  throughVolume: number | "";
  rightTurnVolume: number | "";
  pedestrianVolume: number | "";
  bicycleVolume: number | "";
  parkingManeuvers: number | "";
  busesStopping: number | "";
  rightTurnOnRedPermitted: boolean;
  observedRTORVolume: number | "";
  laneGroups: LaneGroupInputMap;
}

export type ApproachGeometryMap = Record<ApproachDirection, ApproachGeometrySettings>;
export type ApproachTrafficMap = Record<ApproachDirection, ApproachTrafficSettings>;

export interface ProjectInfo {
  projectName: string;
  currentStudy: string;
  status: string;
  hcmEngineStatus: string;
}

export interface GeometryData {
  intersectionName: string;
  areaType: AreaType;
  numberOfApproaches: number;
  selectedApproach: ApproachDirection;
  approaches: ApproachGeometryMap;
  numberOfLanes: number;
  laneWidth: number | "";
  grade: number | "";
  storageLength: number | "";
  exclusiveLeftTurnLane: boolean;
  exclusiveRightTurnLane: boolean;
  parkingAdjacent: boolean;
  busStopNearStopLine: boolean;
  leftTurnLanes: number;
  throughLanes: number;
  rightTurnLanes: number;
  laneGroupDefinitions: LaneGroupGeometryDefinitionMap;
}

export interface TrafficData {
  approachDirection: ApproachDirection;
  approaches: ApproachTrafficMap;
  analysisPeriodHours: number;
  peakHourFactor: number | "";
  heavyVehiclesPercent: number | "";
  arrivalType: ArrivalType;
  leftTurnVolume: number | "";
  throughVolume: number | "";
  rightTurnVolume: number | "";
  pedestrianVolume: number | "";
  bicycleVolume: number | "";
  parkingManeuvers: number | "";
  busesStopping: number | "";
  rightTurnOnRedPermitted: boolean;
  observedRTORVolume: number | "";
}

export interface PhaseTiming {
  phaseNumber: number;
  greenTime: number | "";
  yellowAllRed: number | "";
  protectedMovements: string;
  movementPermissions: PhaseMovementPermissions;
}

export interface SignalData {
  controlType: ControlType;
  numberOfPhases: number;
  pedestrianPushButtonEnabled: boolean;
  cycleLength: number | "";
  analysisPeriodHours: number;
  minimumPedestrianGreen: number | "";
  phases: PhaseTiming[];
  notes: string;
}

export interface SummaryKPI {
  intersectionDelay: string;
  levelOfService: string;
  progressionFactor: string;
  maxBackOfQueue: string;
  criticalVCRatio: string;
  analysisStatus: string;
}

export interface LaneGroupResult {
  laneGroup: string;
  delay: string;
  los: string;
  vcRatio: string;
  backOfQueue: string;
}

export interface ApproachResult {
  approach: string;
  delay: string;
  los: string;
  adjustedFlow: string;
}

export interface ResultsData {
  scenarioName: string;
  intersection: string;
  controlType: string;
  cycleLength: string;
  kpis: SummaryKPI;
  laneGroupResults: LaneGroupResult[];
  approachResults: ApproachResult[];
}

export interface ScenarioData {
  scenarioName: string;
  geometry: GeometryData;
  traffic: TrafficData;
  signal: SignalData;
  results: ResultsData | null;
}
