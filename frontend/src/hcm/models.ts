export type MovementType = "left" | "through" | "right";
export type Direction = "north" | "south" | "east" | "west";
export type AreaType = "cbd" | "other";
export type LeftTurnPhasing = "protected" | "permitted" | "protected-permitted";

export interface VehicleComposition {
  car: number;
  motorcycle: number;
  bus: number;
  hgv: number;
}

export interface Lane {
  id: string;
  widthMeters: number;
  allowedMovements: MovementType[];
  throughMovementPreferenceWeight?: number;
}

export interface LaneGroup {
  id: string;
  laneIds: string[];
  servedMovements: MovementType[];
  leftTurnPhasing?: LeftTurnPhasing;
  leftTurnProtectedProportion?: number;
  leftTurnOpposingFlowVehPerHour?: number;
  leftTurnPedestrianConflict?: number;
  rightTurnProtectedProportion?: number;
  rightTurnPedestrianConflict?: number;
  saturationFlowFactorOverrides?: Partial<
    Pick<
      SaturationFlowAdjustmentFactors,
      | "leftTurnFactor"
      | "rightTurnFactor"
      | "leftTurnPedestrianFactor"
      | "rightTurnPedestrianFactor"
    >
  >;
  initialQueueVehicles?: number;
}

export interface FifteenMinuteCount {
  interval1: number;
  interval2: number;
  interval3: number;
  interval4: number;
}

export interface RawMovementCounts {
  left: FifteenMinuteCount;
  through: FifteenMinuteCount;
  right: FifteenMinuteCount;
}

export interface Approach {
  id: string;
  direction: Direction;
  lanes: Lane[];
  laneGroups: LaneGroup[];
  rawCounts15Min: RawMovementCounts;
  vehicleComposition: VehicleComposition;
  parkingManeuversPerHour: number;
  busesStoppingPerHour: number;
  areaType: AreaType;
  progressionAdjustmentFactor?: number;
  saturationFlowFactors: SaturationFlowAdjustmentFactors;
  gradePercent: number;
}

export interface SignalPhase {
  id: string;
  name: string;
  greenSeconds: number;
  yellowSeconds: number;
  allRedSeconds: number;
  effectiveGreenSeconds?: number;
  startupLostTimeSeconds?: number;
  clearanceLostTimeSeconds?: number;
  queueSignalType?: "pretimed" | "actuated";
  progressionAdjustmentFactor: number;
  incrementalDelayAnalysisPeriodHours: number;
  incrementalDelayKFactor: number;
  upstreamFilteringFactor: number;
  servedApproaches: string[];
}

export interface Intersection {
  id: string;
  name: string;
  approaches: Approach[];
  phases: SignalPhase[];
  cycleLength: number;
}

export interface SaturationFlowAdjustmentFactors {
  laneWidthFactor: number;
  heavyVehicleFactor: number;
  gradeFactor: number;
  parkingFactor: number;
  busBlockageFactor: number;
  areaTypeFactor: number;
  laneUtilizationFactor: number;
  leftTurnFactor: number;
  rightTurnFactor: number;
  leftTurnPedestrianFactor: number;
  rightTurnPedestrianFactor: number;
}
