import type {
  ApproachDirection,
  PhaseMovementPermissions,
} from "../types/traffic";

export type DirectionKey = "northbound" | "southbound" | "eastbound" | "westbound";
export type MovementType = "left" | "through" | "right";
export type SignalDisplayState = "green" | "yellow" | "red";
export type SegmentType = "Green" | "Yellow" | "All Red";

export type Point = {
  x: number;
  y: number;
};

export type LanePath = {
  laneId: string;
  physicalLaneKey: string;
  direction: DirectionKey;
  movement: MovementType;
  points: Point[];
  stopLineProgress: number;
  lengthPx: number;
};

export type Vehicle = {
  id: string;
  laneId: string;
  direction: DirectionKey;
  movement: MovementType;
  progress: number;
  speed: number;
  desiredSpeed: number;
  acceleration: number;
  width: number;
  length: number;
  color: string;
};

export type MovementDemand = Record<MovementType, number>;
export type MovementSignalMap = Record<MovementType, SignalDisplayState>;
export type DirectionSignalMap = Record<DirectionKey, MovementSignalMap>;

export type LaneGroupSlot = {
  slotKey: "left" | "through" | "right";
  laneCount: number;
  servedMovements: MovementType[];
  initialQueueVehicles: number;
};


export type ApproachSimulationConfig = {
  direction: DirectionKey;
  demandCounts: MovementDemand;
  movementLaneCounts: MovementDemand;
  totalVolume: number;
  totalPhysicalLanes: number;
  heavyVehiclePercent: number;
  laneGroupSlots: LaneGroupSlot[];
  compositionLabel: string;
};

export type ApproachSimulationMap = Record<DirectionKey, ApproachSimulationConfig>;

export type SignalSegment = {
  phaseIndex: number;
  phaseNumber: number;
  segmentType: SegmentType;
  duration: number;
  movementPermissions: PhaseMovementPermissions;
  movementSummary: string;
};

export type ActiveSignalSegment = SignalSegment & {
  start: number;
  end: number;
  elapsedInSegment: number;
  remainingInSegment: number;
};

export type QueueSnapshot = Record<DirectionKey, number>;

export type SimulationConfig = {
  cycleLength: number;
  approachConfigs: ApproachSimulationMap;
  phaseSegments: SignalSegment[];
};

export type SimulationRuntimeState = {
  elapsedSeconds: number;
  vehicles: Vehicle[];
  queues: QueueSnapshot;
};

export type DirectionPair = [DirectionKey, ApproachDirection];
