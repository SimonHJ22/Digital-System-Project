import { useEffect, useMemo, useRef, useState } from "react";
import { useScenario } from "../features/scenario/useScenario";
import type {
  ApproachDirection,
  ApproachGeometryMap,
  ApproachTrafficMap,
  LaneGroupKey,
  PhaseMovementPermissions,
} from "../types/traffic";
import { ensurePhaseTimingCount, formatPhaseMovementSummary } from "../utils/signalPhases";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type PhaseSegment = {
  phaseIndex: number;
  phaseNumber: number;
  segmentType: "Green" | "Change & Clearance";
  duration: number;
  movementPermissions: PhaseMovementPermissions;
  movementSummary: string;
};

type DirectionKey = "northbound" | "southbound" | "eastbound" | "westbound";
type MovementType = "left" | "through" | "right";
type SignalState = "green" | "yellow" | "red";
type MovementSignalMap = Record<MovementType, SignalState>;
type DirectionSignalMap = Record<DirectionKey, MovementSignalMap>;

type LanePath = {
  laneId: string;
  physicalLaneKey: string;
  direction: DirectionKey;
  movement: MovementType;
  start: { x: number; y: number };
  end: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
  stopLineProgress: number;
  lengthPx: number;
};

type Vehicle = {
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

type MovementDemand = Record<MovementType, number>;

type LaneGroupSlot = {
  slotKey: LaneGroupKey;
  laneCount: number;
  servedMovements: MovementType[];
};

type ApproachSimulationConfig = {
  direction: DirectionKey;
  demandCounts: MovementDemand;
  movementLaneCounts: MovementDemand;
  totalVolume: number;
  totalPhysicalLanes: number;
  heavyVehiclePercent: number;
  laneGroupSlots: LaneGroupSlot[];
  compositionLabel: string;
};

type ApproachSimulationMap = Record<DirectionKey, ApproachSimulationConfig>;

const directionPairs: Array<[DirectionKey, ApproachDirection]> = [
  ["northbound", "Northbound"],
  ["southbound", "Southbound"],
  ["eastbound", "Eastbound"],
  ["westbound", "Westbound"],
];

const movementKeys: MovementType[] = ["left", "through", "right"];

function getServedMovementsFromSlot(
  servedMovements: Record<LaneGroupKey, boolean>
): MovementType[] {
  return movementKeys.filter((movement) => servedMovements[movement]);
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

function getApproachDirectionFromDirectionKey(
  direction: DirectionKey
): ApproachDirection {
  if (direction === "northbound") return "Northbound";
  if (direction === "southbound") return "Southbound";
  if (direction === "eastbound") return "Eastbound";
  return "Westbound";
}

function getMovementSignal(
  direction: DirectionKey,
  movement: MovementType,
  movementPermissions: PhaseMovementPermissions,
  segmentType: "Green" | "Change & Clearance"
): SignalState {
  const approachDirection = getApproachDirectionFromDirectionKey(direction);
  const isServed = Boolean(movementPermissions[approachDirection]?.[movement]);

  if (!isServed) return "red";
  if (segmentType === "Change & Clearance") return "yellow";
  return "green";
}

function getDirectionSignal(movementSignals: MovementSignalMap): SignalState {
  if (movementKeys.some((movement) => movementSignals[movement] === "green")) {
    return "green";
  }

  if (movementKeys.some((movement) => movementSignals[movement] === "yellow")) {
    return "yellow";
  }

  return "red";
}

function buildDirectionSignalMap(
  movementPermissions: PhaseMovementPermissions,
  segmentType: "Green" | "Change & Clearance"
): DirectionSignalMap {
  return Object.fromEntries(
    directionPairs.map(([direction]) => [
      direction,
      {
        left: getMovementSignal(direction, "left", movementPermissions, segmentType),
        through: getMovementSignal(direction, "through", movementPermissions, segmentType),
        right: getMovementSignal(direction, "right", movementPermissions, segmentType),
      },
    ])
  ) as DirectionSignalMap;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPolylineLength(points: Array<{ x: number; y: number }>): number {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }

  return total;
}

function getPointOnPath(path: LanePath, progress: number) {
  const t = clamp(progress, 0, 1);
  const targetDistance = path.lengthPx * t;
  let traveled = 0;

  for (let index = 1; index < path.points.length; index += 1) {
    const segmentStart = path.points[index - 1];
    const segmentEnd = path.points[index];
    const segmentLength = Math.hypot(
      segmentEnd.x - segmentStart.x,
      segmentEnd.y - segmentStart.y
    );

    if (segmentLength === 0) continue;

    if (traveled + segmentLength >= targetDistance) {
      const segmentT = (targetDistance - traveled) / segmentLength;
      return {
        x: lerp(segmentStart.x, segmentEnd.x, segmentT),
        y: lerp(segmentStart.y, segmentEnd.y, segmentT),
      };
    }

    traveled += segmentLength;
  }

  return path.points[path.points.length - 1] ?? path.end;
}

function getAngleOnPath(path: LanePath, progress: number): number {
  const sampleA = getPointOnPath(path, clamp(progress, 0, 1));
  const sampleB = getPointOnPath(path, clamp(progress + 0.01, 0, 1));
  return Math.atan2(sampleB.y - sampleA.y, sampleB.x - sampleA.x);
}

function getLaneOffsets(count: number, spacing: number): number[] {
  if (count <= 0) return [0];

  const centerIndex = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => (index - centerIndex) * spacing);
}

function getLaneMarkProgress(path: LanePath, offset: number): number {
  return clamp(path.stopLineProgress - offset, 0.1, 0.9);
}

function getVehicleColor(movement: MovementType): string {
  if (movement === "left") return "#f97316";
  if (movement === "right") return "#8b5cf6";
  return "#38bdf8";
}

function getVehicleDimensions(movement: MovementType) {
  if (movement === "left") {
    return {
      desiredSpeed: 74,
      acceleration: 120,
      width: 10,
      length: 22,
    };
  }

  if (movement === "right") {
    return {
      desiredSpeed: 68,
      acceleration: 110,
      width: 10,
      length: 18,
    };
  }

  return {
    desiredSpeed: 96,
    acceleration: 160,
    width: 10,
    length: 20,
  };
}

function createLanePath(
  laneId: string,
  physicalLaneKey: string,
  direction: DirectionKey,
  movement: MovementType,
  points: Array<{ x: number; y: number }>,
  stopLineProgress: number
): LanePath {
  const start = points[0];
  const end = points[points.length - 1];

  return {
    laneId,
    physicalLaneKey,
    direction,
    movement,
    start,
    end,
    points,
    stopLineProgress,
    lengthPx: getPolylineLength(points),
  };
}

function buildPathPoints(
  direction: DirectionKey,
  movement: MovementType,
  axisOffset: number,
  slotInMovement: number,
  movementLaneCount: number,
  laneSpacing: number,
  canvasWidth: number,
  canvasHeight: number,
  cx: number,
  cy: number
): Array<{ x: number; y: number }> {
  const outerMargin = 120;
  const turnInset = 92;
  const exitReach = 150;
  const clampedSlot = Math.max(0, slotInMovement);
  const spread = Math.max(0, movementLaneCount - 1);
  const centeredShift = (clampedSlot - spread / 2) * laneSpacing;
  const innerTurnShift = centeredShift * 0.45;

  const northboundOutboundX = cx + 27 + centeredShift;
  const southboundOutboundX = cx - 27 - centeredShift;
  const westboundOutboundY = cy - 27 - centeredShift;
  const eastboundOutboundY = cy + 27 + centeredShift;

  if (direction === "northbound") {
    if (movement === "left") {
      return [
        { x: axisOffset, y: -outerMargin },
        { x: axisOffset, y: cy - turnInset },
        { x: cx + turnInset, y: cy + 27 + innerTurnShift },
        { x: canvasWidth + exitReach, y: eastboundOutboundY },
      ];
    }

    if (movement === "right") {
      return [
        { x: axisOffset, y: -outerMargin },
        { x: axisOffset, y: cy - turnInset },
        { x: cx - turnInset, y: cy - 27 - innerTurnShift },
        { x: -exitReach, y: westboundOutboundY },
      ];
    }

    return [
      { x: axisOffset, y: -outerMargin },
      { x: axisOffset, y: canvasHeight + outerMargin },
    ];
  }

  if (direction === "southbound") {
    if (movement === "left") {
      return [
        { x: axisOffset, y: canvasHeight + outerMargin },
        { x: axisOffset, y: cy + turnInset },
        { x: cx - turnInset, y: cy - 27 - innerTurnShift },
        { x: -exitReach, y: westboundOutboundY },
      ];
    }

    if (movement === "right") {
      return [
        { x: axisOffset, y: canvasHeight + outerMargin },
        { x: axisOffset, y: cy + turnInset },
        { x: cx + turnInset, y: cy + 27 + innerTurnShift },
        { x: canvasWidth + exitReach, y: eastboundOutboundY },
      ];
    }

    return [
      { x: axisOffset, y: canvasHeight + outerMargin },
      { x: axisOffset, y: -outerMargin },
    ];
  }

  if (direction === "westbound") {
    if (movement === "left") {
      return [
        { x: -outerMargin, y: axisOffset },
        { x: cx - turnInset, y: axisOffset },
        { x: cx + 27 + innerTurnShift, y: cy - turnInset },
        { x: northboundOutboundX, y: -exitReach },
      ];
    }

    if (movement === "right") {
      return [
        { x: -outerMargin, y: axisOffset },
        { x: cx - turnInset, y: axisOffset },
        { x: cx - 27 - innerTurnShift, y: cy + turnInset },
        { x: southboundOutboundX, y: canvasHeight + exitReach },
      ];
    }

    return [
      { x: -outerMargin, y: axisOffset },
      { x: canvasWidth + outerMargin, y: axisOffset },
    ];
  }

  if (movement === "left") {
    return [
      { x: canvasWidth + outerMargin, y: axisOffset },
      { x: cx + turnInset, y: axisOffset },
      { x: cx - 27 - innerTurnShift, y: cy + turnInset },
      { x: southboundOutboundX, y: canvasHeight + exitReach },
    ];
  }

  if (movement === "right") {
    return [
      { x: canvasWidth + outerMargin, y: axisOffset },
      { x: cx + turnInset, y: axisOffset },
      { x: cx + 27 + innerTurnShift, y: cy - turnInset },
      { x: northboundOutboundX, y: -exitReach },
    ];
  }

  return [
    { x: canvasWidth + outerMargin, y: axisOffset },
    { x: -outerMargin, y: axisOffset },
  ];
}

function getAxisOffsetForDirection(
  direction: DirectionKey,
  offset: number,
  cx: number,
  cy: number
): number {
  if (direction === "northbound") return cx - 27 + offset;
  if (direction === "southbound") return cx + 27 - offset;
  if (direction === "westbound") return cy + 27 - offset;
  return cy - 27 + offset;
}

function buildApproachSimulationConfigs(
  geometryApproaches: ApproachGeometryMap,
  trafficApproaches: ApproachTrafficMap
): ApproachSimulationMap {
  return Object.fromEntries(
    directionPairs.map(([directionKey, approachDirection]) => {
      const geometryForApproach = geometryApproaches[approachDirection];
      const trafficForApproach = trafficApproaches[approachDirection];
      const configuredSlots = (["left", "through", "right"] as LaneGroupKey[])
        .map((slotKey) => {
          const definition = geometryForApproach.laneGroupDefinitions[slotKey];
          const servedMovements = getServedMovementsFromSlot(definition.servedMovements);

          return {
            slotKey,
            laneCount: Math.max(0, Number(definition.laneCount || 0)),
            enabled: definition.enabled,
            servedMovements,
          };
        })
        .filter(
          (slot) => slot.enabled && slot.laneCount > 0 && slot.servedMovements.length > 0
        )
        .map(({ slotKey, laneCount, servedMovements }) => ({
          slotKey,
          laneCount,
          servedMovements,
        }));

      const laneGroupSlots =
        configuredSlots.length > 0
          ? configuredSlots
          : [
              {
                slotKey: "through" as LaneGroupKey,
                laneCount: 1,
                servedMovements: ["through"] as MovementType[],
              },
            ];

      const movementLaneCounts = movementKeys.reduce<MovementDemand>(
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

      const demandCounts = getMovementDemandCounts(
        Number(trafficForApproach.leftTurnVolume || 0),
        Number(trafficForApproach.throughVolume || 0),
        Number(trafficForApproach.rightTurnVolume || 0)
      );

      const totalPhysicalLanes = laneGroupSlots.reduce(
        (sum, slot) => sum + slot.laneCount,
        0
      );

      return [
        directionKey,
        {
          direction: directionKey,
          demandCounts,
          movementLaneCounts,
          totalVolume: demandCounts.left + demandCounts.through + demandCounts.right,
          totalPhysicalLanes: Math.max(totalPhysicalLanes, 1),
          heavyVehiclePercent: Number(trafficForApproach.heavyVehiclesPercent || 0),
          laneGroupSlots,
          compositionLabel: formatLaneGroupComposition(laneGroupSlots),
        } satisfies ApproachSimulationConfig,
      ];
    })
  ) as ApproachSimulationMap;
}

function buildLanePaths(params: {
  canvasWidth: number;
  canvasHeight: number;
  approachConfigs: ApproachSimulationMap;
}): LanePath[] {
  const { canvasWidth, canvasHeight, approachConfigs } = params;

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const laneSpacing = 18;
  const paths: LanePath[] = [];

  directionPairs.forEach(([directionKey]) => {
    const approachConfig = approachConfigs[directionKey];
    const offsets = getLaneOffsets(approachConfig.totalPhysicalLanes, laneSpacing);
    const orderedOffsets = [...offsets].reverse();
    const movementSlotCounters: MovementDemand = {
      left: 0,
      through: 0,
      right: 0,
    };
    let physicalLaneIndex = 0;

    approachConfig.laneGroupSlots.forEach((slot) => {
      for (let laneIndex = 0; laneIndex < slot.laneCount; laneIndex += 1) {
        const offset = orderedOffsets[physicalLaneIndex] ?? 0;
        const physicalLaneKey = `${directionKey}_${slot.slotKey}_${laneIndex}`;
        const axisOffset = getAxisOffsetForDirection(directionKey, offset, cx, cy);

        slot.servedMovements.forEach((movement) => {
          const slotInMovement = movementSlotCounters[movement];
          movementSlotCounters[movement] += 1;

          paths.push(
            createLanePath(
              `${physicalLaneKey}_${movement}`,
              physicalLaneKey,
              directionKey,
              movement,
              buildPathPoints(
                directionKey,
                movement,
                axisOffset,
                slotInMovement,
                Math.max(1, approachConfig.movementLaneCounts[movement]),
                laneSpacing,
                canvasWidth,
                canvasHeight,
                cx,
                cy
              ),
              0.42
            )
          );
        });

        physicalLaneIndex += 1;
      }
    });
  });

  return paths;
}

function createVehicle(path: LanePath, progress: number, serial: number): Vehicle {
  const dimensions = getVehicleDimensions(path.movement);

  return {
    id: `${path.laneId}_${serial}`,
    laneId: path.laneId,
    direction: path.direction,
    movement: path.movement,
    progress,
    speed: 0,
    desiredSpeed: dimensions.desiredSpeed,
    acceleration: dimensions.acceleration,
    width: dimensions.width,
    length: dimensions.length,
    color: getVehicleColor(path.movement),
  };
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

function getTargetVehiclesForLane(
  movement: MovementType,
  demandCounts: MovementDemand,
  laneCounts: MovementDemand,
  fallbackPerLane: number
): number {
  const movementDemand = demandCounts[movement];
  const movementLaneCount = Math.max(1, laneCounts[movement]);

  if (movementDemand <= 0) {
    return movement === "through" ? Math.max(1, Math.round(fallbackPerLane / 2)) : 0;
  }

  const demandPerLane = movementDemand / movementLaneCount;
  return Math.min(14, Math.max(1, Math.round(demandPerLane / 80)));
}

function seedVehicles(
  lanePaths: LanePath[],
  approachConfigs: ApproachSimulationMap,
  fallbackPerLane: number,
  serialRef: { current: number }
): Vehicle[] {
  const vehicles: Vehicle[] = [];

  for (const path of lanePaths) {
    const approachConfig = approachConfigs[path.direction];
    const targetPerLane = getTargetVehiclesForLane(
      path.movement,
      approachConfig.demandCounts,
      approachConfig.movementLaneCounts,
      fallbackPerLane
    );
    const safeGapPx =
      path.movement === "through" ? 32 : path.movement === "left" ? 38 : 34;

    for (let i = 0; i < targetPerLane; i += 1) {
      const progress = 0.08 + (i * safeGapPx) / path.lengthPx;

      if (progress >= path.stopLineProgress - 0.03) break;

      serialRef.current += 1;
      vehicles.push(createVehicle(path, progress, serialRef.current));
    }
  }

  return vehicles;
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  vehicle: Vehicle,
  path: LanePath
): void {
  const point = getPointOnPath(path, vehicle.progress);
  const angle = getAngleOnPath(path, vehicle.progress);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);

  ctx.fillStyle = vehicle.color;
  ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(vehicle.length / 6, -vehicle.width / 2 + 1.5, 4, vehicle.width - 3);

  ctx.restore();
}

function drawMovementArrow(
  ctx: CanvasRenderingContext2D,
  path: LanePath
): void {
  const progress = getLaneMarkProgress(
    path,
    path.movement === "left" ? 0.16 : path.movement === "right" ? 0.08 : 0.12
  );
  const point = getPointOnPath(path, progress);
  const angle = getAngleOnPath(path, progress);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (path.movement === "through") {
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -10);
    ctx.moveTo(0, -10);
    ctx.lineTo(-5, -4);
    ctx.moveTo(0, -10);
    ctx.lineTo(5, -4);
    ctx.stroke();
  } else if (path.movement === "left") {
    ctx.beginPath();
    ctx.moveTo(4, 12);
    ctx.lineTo(4, -2);
    ctx.quadraticCurveTo(4, -10, -6, -10);
    ctx.lineTo(-12, -10);
    ctx.moveTo(-12, -10);
    ctx.lineTo(-6, -15);
    ctx.moveTo(-12, -10);
    ctx.lineTo(-6, -5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.lineTo(-4, -2);
    ctx.quadraticCurveTo(-4, -10, 6, -10);
    ctx.lineTo(12, -10);
    ctx.moveTo(12, -10);
    ctx.lineTo(6, -15);
    ctx.moveTo(12, -10);
    ctx.lineTo(6, -5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawApproachLaneGuide(
  ctx: CanvasRenderingContext2D,
  path: LanePath
): void {
  const start = getPointOnPath(path, 0.08);
  const end = getPointOnPath(path, getLaneMarkProgress(path, 0.18));

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function estimateApproachQueue(
  config: ApproachSimulationConfig,
  cycleLength: number,
  movementSignals: MovementSignalMap
): number {
  if (config.totalVolume <= 0) {
    return getDirectionSignal(movementSignals) === "green" ? 0 : 1;
  }

  const demandPerLane = config.totalVolume / Math.max(config.totalPhysicalLanes, 1);
  const baseQueue = Math.max(
    1,
    Math.round(demandPerLane / 12 + cycleLength / 25 + config.heavyVehiclePercent / 4)
  );
  const blockedDemand = movementKeys.reduce((sum, movement) => {
    const demand = config.demandCounts[movement];
    const signalState = movementSignals[movement];

    if (signalState === "green") return sum;
    if (signalState === "yellow") return sum + demand * 0.5;
    return sum + demand;
  }, 0);
  const blockedShare =
    config.totalVolume > 0 ? blockedDemand / config.totalVolume : 0;
  const queueAdjustment = Math.round(blockedShare * 4 - 1.5);

  return Math.max(0, baseQueue + queueAdjustment);
}

export default function SimulationPage() {
  const { scenario } = useScenario();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const vehicleSerialRef = useRef(0);

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [timeStep, setTimeStep] = useState(1);
  const [showLaneLabels, setShowLaneLabels] = useState(true);
  const [showQueueOverlay, setShowQueueOverlay] = useState(true);
  const [showSignalStates, setShowSignalStates] = useState(true);

  const geometry = scenario.geometry;
  const traffic = scenario.traffic;
  const signal = scenario.signal;

  const cycleLength =
    typeof signal.cycleLength === "number" && signal.cycleLength > 0
      ? signal.cycleLength
      : 90;
  const approachConfigs = useMemo(
    () => buildApproachSimulationConfigs(geometry.approaches, traffic.approaches),
    [geometry.approaches, traffic.approaches]
  );
  const totalVolume = useMemo(
    () =>
      directionPairs.reduce(
        (sum, [directionKey]) => sum + approachConfigs[directionKey].totalVolume,
        0
      ),
    [approachConfigs]
  );
  const rawPhases = ensurePhaseTimingCount(
    signal.phases,
    Math.max(signal.numberOfPhases, 1)
  );

  const phasesForDisplay =
    rawPhases.length > 0
      ? rawPhases.map((phase, index) => ({
          phaseNumber: phase.phaseNumber || index + 1,
          greenTime:
            typeof phase.greenTime === "number" && phase.greenTime > 0
              ? phase.greenTime
              : Math.max(10, Math.round(cycleLength / Math.max(signal.numberOfPhases, 1))),
          yellowAllRed:
            typeof phase.yellowAllRed === "number" && phase.yellowAllRed >= 0
              ? phase.yellowAllRed
              : 4,
          movementPermissions: phase.movementPermissions,
          movementSummary:
            phase.protectedMovements?.trim() ||
            formatPhaseMovementSummary(phase.movementPermissions),
        }))
      : Array.from({ length: Math.max(signal.numberOfPhases, 1) }, (_, index) => ({
          phaseNumber: index + 1,
          greenTime: Math.max(10, Math.round(cycleLength / Math.max(signal.numberOfPhases, 1))),
          yellowAllRed: 4,
          movementPermissions: rawPhases[index]?.movementPermissions,
          movementSummary: "No served movements selected",
        }));

  const phaseSegments: PhaseSegment[] = phasesForDisplay.flatMap((phase, index) => {
    const segments: PhaseSegment[] = [
      {
        phaseIndex: index,
        phaseNumber: phase.phaseNumber,
        segmentType: "Green",
        duration: Math.max(1, phase.greenTime),
        movementPermissions: phase.movementPermissions,
        movementSummary: phase.movementSummary,
      },
    ];

    if (phase.yellowAllRed > 0) {
      segments.push({
        phaseIndex: index,
        phaseNumber: phase.phaseNumber,
        segmentType: "Change & Clearance",
        duration: phase.yellowAllRed,
        movementPermissions: phase.movementPermissions,
        movementSummary: phase.movementSummary,
      });
    }

    return segments;
  });

  const totalSegmentTime = phaseSegments.reduce((sum, segment) => sum + segment.duration, 0);
  const timeInCycle = totalSegmentTime > 0 ? elapsedSeconds % totalSegmentTime : 0;

  let accumulatedTime = 0;
  let activeSegmentInfo = phaseSegments[0];

  for (const segment of phaseSegments) {
    const segmentStart = accumulatedTime;
    const segmentEnd = accumulatedTime + segment.duration;

    if (timeInCycle < segmentEnd) {
      activeSegmentInfo = segment;
      accumulatedTime = segmentStart;
      break;
    }

    accumulatedTime = segmentEnd;
  }

  const activeSegmentStart = accumulatedTime;
  const activeSegmentEnd = activeSegmentStart + activeSegmentInfo.duration;

  const activeSegmentInfoWithTiming = {
    ...activeSegmentInfo,
    start: activeSegmentStart,
    end: activeSegmentEnd,
    elapsedInSegment: timeInCycle - activeSegmentStart,
    remainingInSegment: Math.max(0, activeSegmentEnd - timeInCycle),
  };

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + Math.max(1, timeStep));
    }, 1000 / speed);

    return () => window.clearInterval(interval);
  }, [isRunning, speed, timeStep]);

  const activePhaseLabel = `Phase ${activeSegmentInfoWithTiming.phaseNumber}`;
  const activeMovementSummary =
    activeSegmentInfoWithTiming.movementSummary || "No served movements selected";
  const movementSignals = buildDirectionSignalMap(
    activeSegmentInfoWithTiming.movementPermissions,
    activeSegmentInfoWithTiming.segmentType
  );
  const northSignal = getDirectionSignal(movementSignals.northbound);
  const southSignal = getDirectionSignal(movementSignals.southbound);
  const eastSignal = getDirectionSignal(movementSignals.eastbound);
  const westSignal = getDirectionSignal(movementSignals.westbound);

  const queues: Record<DirectionKey, number> = {
    northbound: estimateApproachQueue(
      approachConfigs.northbound,
      cycleLength,
      movementSignals.northbound
    ),
    southbound: estimateApproachQueue(
      approachConfigs.southbound,
      cycleLength,
      movementSignals.southbound
    ),
    eastbound: estimateApproachQueue(
      approachConfigs.eastbound,
      cycleLength,
      movementSignals.eastbound
    ),
    westbound: estimateApproachQueue(
      approachConfigs.westbound,
      cycleLength,
      movementSignals.westbound
    ),
  };

  const maxQueue = Math.max(
    queues.northbound,
    queues.southbound,
    queues.eastbound,
    queues.westbound
  );

  const vehiclesInNetwork = Math.max(
    totalVolume > 0 ? Math.round(totalVolume / 18 + maxQueue) : maxQueue
  );

  const queueStatus = maxQueue <= 5 ? "Low" : maxQueue <= 12 ? "Moderate" : "Heavy";

  const lanePaths = useMemo(
    () =>
      buildLanePaths({
        canvasWidth: 1600,
        canvasHeight: 900,
        approachConfigs,
      }),
    [approachConfigs]
  );

  const lanePathMap = useMemo(
    () =>
      Object.fromEntries(lanePaths.map((path) => [path.laneId, path])) as Record<
        string,
        LanePath
      >,
    [lanePaths]
  );

  const targetVehiclesPerLane = useMemo(
    () => (totalVolume <= 0 ? 4 : Math.min(12, Math.max(4, Math.round(totalVolume / 220)))),
    [totalVolume]
  );

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    vehiclesRef.current = seedVehicles(
      lanePaths,
      approachConfigs,
      targetVehiclesPerLane,
      vehicleSerialRef
    );
  };

  const approachCards = directionPairs.map(([directionKey, approachDirection]) => ({
    label: approachDirection,
    value: `${queues[directionKey]} veh`,
    composition: `${approachConfigs[directionKey].compositionLabel} • L${
      approachConfigs[directionKey].movementLaneCounts.left
    } T${approachConfigs[directionKey].movementLaneCounts.through} R${
      approachConfigs[directionKey].movementLaneCounts.right
    }`,
  }));

  useEffect(() => {
    vehiclesRef.current = seedVehicles(
      lanePaths,
      approachConfigs,
      targetVehiclesPerLane,
      vehicleSerialRef
    );
  }, [lanePaths, approachConfigs, targetVehiclesPerLane]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let lastTimestamp = 0;

    const drawSignalHead = (
      x: number,
      y: number,
      state: SignalState,
      label: string
    ) => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x - 20, y - 34, 40, 68);

      const colors = {
        red: "#ef4444",
        yellow: "#facc15",
        green: "#22c55e",
      };

      const topColor = state === "red" ? colors.red : "#334155";
      const midColor = state === "yellow" ? colors.yellow : "#334155";
      const botColor = state === "green" ? colors.green : "#334155";

      ctx.beginPath();
      ctx.fillStyle = topColor;
      ctx.arc(x, y - 18, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = midColor;
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = botColor;
      ctx.arc(x, y + 18, 7, 0, Math.PI * 2);
      ctx.fill();

      if (showSignalStates) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x, y + 56);
      }
    };

    const updateVehicles = (dtMs: number) => {
      if (!isRunning) return;

      const dtSeconds = (Math.min(dtMs, 50) / 1000) * speed * timeStep;
      const grouped = new Map<string, Vehicle[]>();

      for (const vehicle of vehiclesRef.current) {
        if (!grouped.has(vehicle.laneId)) {
          grouped.set(vehicle.laneId, []);
        }
        grouped.get(vehicle.laneId)!.push(vehicle);
      }

      for (const [laneId, laneVehicles] of grouped.entries()) {
        const path = lanePathMap[laneId];
        if (!path) continue;

        const signalState = movementSignals[path.direction][path.movement];
        const canMove = signalState === "green";

        laneVehicles.sort((a, b) => b.progress - a.progress);

        for (let index = 0; index < laneVehicles.length; index += 1) {
          const vehicle = laneVehicles[index];
          const leader = index === 0 ? null : laneVehicles[index - 1];

          if (vehicle.speed < vehicle.desiredSpeed) {
            vehicle.speed = Math.min(
              vehicle.desiredSpeed,
              vehicle.speed + vehicle.acceleration * dtSeconds
            );
          }

          let targetProgress =
            vehicle.progress + (vehicle.speed * dtSeconds) / Math.max(path.lengthPx, 1);

          const vehicleGapProgress = 26 / Math.max(path.lengthPx, 1);

          if (!canMove && vehicle.progress < path.stopLineProgress) {
            targetProgress = Math.min(
              targetProgress,
              path.stopLineProgress - vehicleGapProgress
            );
          }

          if (leader) {
            targetProgress = Math.min(targetProgress, leader.progress - vehicleGapProgress);
          }

          if (targetProgress < vehicle.progress) {
            targetProgress = vehicle.progress;
          }

          if (Math.abs(targetProgress - vehicle.progress) < 0.000001) {
            vehicle.speed = 0;
          }

          vehicle.progress = targetProgress;

          if (vehicle.progress > 1.08) {
            const farthestBackProgress = laneVehicles.reduce(
              (min, candidate) =>
                candidate.id === vehicle.id ? min : Math.min(min, candidate.progress),
              1
            );

            const respawnGap =
              (path.movement === "left" ? 40 : path.movement === "right" ? 34 : 32) /
              path.lengthPx;
            vehicle.progress = Math.max(0.02, farthestBackProgress - respawnGap);
            vehicle.speed = 0;
          }
        }
      }
    };

    const drawScene = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "#dff3ea";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const roadW = 180;
      const roadH = 180;
      const laneLineColor = "rgba(250, 204, 21, 0.85)";

      ctx.fillStyle = "#334155";
      ctx.fillRect(cx - roadW / 2, 0, roadW, height);

      ctx.fillStyle = "#334155";
      ctx.fillRect(0, cy - roadH / 2, width, roadH);

      ctx.fillStyle = "#64748b";
      ctx.fillRect(cx - 110, cy - 110, 220, 220);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - roadW / 2, cy - 130);
      ctx.lineTo(cx + roadW / 2, cy - 130);
      ctx.moveTo(cx - roadW / 2, cy + 130);
      ctx.lineTo(cx + roadW / 2, cy + 130);
      ctx.moveTo(cx - 130, cy - roadH / 2);
      ctx.lineTo(cx - 130, cy + roadH / 2);
      ctx.moveTo(cx + 130, cy - roadH / 2);
      ctx.lineTo(cx + 130, cy + roadH / 2);
      ctx.stroke();

      ctx.strokeStyle = laneLineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      for (const path of lanePaths) {
        if (path.movement === "through") continue;

        ctx.beginPath();
        path.points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      }

      const drawnPhysicalLanes = new Set<string>();
      for (const path of lanePaths) {
        if (drawnPhysicalLanes.has(path.physicalLaneKey)) continue;
        drawApproachLaneGuide(ctx, path);
        drawnPhysicalLanes.add(path.physicalLaneKey);
      }

      for (const path of lanePaths) {
        drawMovementArrow(ctx, path);
      }

      drawSignalHead(cx, cy - 170, northSignal, "NB");
      drawSignalHead(cx, cy + 170, southSignal, "SB");
      drawSignalHead(cx + 170, cy, eastSignal, "EB");
      drawSignalHead(cx - 170, cy, westSignal, "WB");

      for (const vehicle of vehiclesRef.current) {
        const path = lanePathMap[vehicle.laneId];
        if (!path) continue;
        drawVehicle(ctx, vehicle, path);
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(activePhaseLabel, cx, cy - 10);
      ctx.font = "20px sans-serif";
      ctx.fillText(activeSegmentInfoWithTiming.segmentType, cx, cy + 30);

      if (showLaneLabels) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(cx - 74, 20, 148, 30);
        ctx.fillRect(cx - 74, height - 50, 148, 30);
        ctx.fillRect(20, cy - 15, 148, 30);
        ctx.fillRect(width - 168, cy - 15, 148, 30);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `NB • L${approachConfigs.northbound.movementLaneCounts.left} T${approachConfigs.northbound.movementLaneCounts.through} R${approachConfigs.northbound.movementLaneCounts.right}`,
          cx,
          39
        );
        ctx.fillText(
          `SB • L${approachConfigs.southbound.movementLaneCounts.left} T${approachConfigs.southbound.movementLaneCounts.through} R${approachConfigs.southbound.movementLaneCounts.right}`,
          cx,
          height - 30
        );
        ctx.fillText(
          `WB • L${approachConfigs.westbound.movementLaneCounts.left} T${approachConfigs.westbound.movementLaneCounts.through} R${approachConfigs.westbound.movementLaneCounts.right}`,
          94,
          cy + 5
        );
        ctx.fillText(
          `EB • L${approachConfigs.eastbound.movementLaneCounts.left} T${approachConfigs.eastbound.movementLaneCounts.through} R${approachConfigs.eastbound.movementLaneCounts.right}`,
          width - 94,
          cy + 5
        );
      }

      if (showQueueOverlay) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(cx - 48, 58, 96, 24);
        ctx.fillRect(cx - 48, height - 82, 96, 24);
        ctx.fillRect(28, cy + 24, 96, 24);
        ctx.fillRect(width - 124, cy + 24, 96, 24);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Q: ${queues.northbound}`, cx, 74);
        ctx.fillText(`Q: ${queues.southbound}`, cx, height - 66);
        ctx.fillText(`Q: ${queues.westbound}`, 76, cy + 40);
        ctx.fillText(`Q: ${queues.eastbound}`, width - 76, cy + 40);
      }
    };

    const animate = (timestamp: number) => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const dt = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      updateVehicles(dt);
      drawScene();

      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    isRunning,
    speed,
    timeStep,
    approachConfigs,
    northSignal,
    southSignal,
    eastSignal,
    westSignal,
    activePhaseLabel,
    activeSegmentInfoWithTiming.segmentType,
    queues.northbound,
    queues.southbound,
    queues.eastbound,
    queues.westbound,
    showLaneLabels,
    showQueueOverlay,
    showSignalStates,
    lanePaths,
    lanePathMap,
    movementSignals,
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Simulation</h1>
          <p className="text-slate-600 mt-1">
            Visualize intersection operation, signal changes, and queue behavior.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsRunning(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Start
          </button>
          <button
            onClick={() => setIsRunning(false)}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Pause
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-10 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Intersection Canvas</h2>
            <span className="text-sm text-slate-500">
              Scenario-driven simulation preview
            </span>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-6 flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Intersection</p>
                <p className="text-lg font-semibold mt-2">
                  {geometry.intersectionName || "Not set yet"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Control Type</p>
                <p className="text-lg font-semibold mt-2">{signal.controlType}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Configured Cycle Length</p>
                <p className="text-lg font-semibold mt-2">{cycleLength} s</p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <div className="text-center mb-5">
                <p className="text-lg font-medium text-slate-700">
                  Current Phase: {activePhaseLabel}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Segment Type: {activeSegmentInfoWithTiming.segmentType}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Remaining Time in Segment: {activeSegmentInfoWithTiming.remainingInSegment}s
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {showSignalStates
                    ? `Served Movements: ${activeMovementSummary}`
                    : "Signal state display hidden"}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {showQueueOverlay
                    ? `Queue overlay active • Max queue ${maxQueue} veh`
                    : "Queue overlay hidden"}
                </p>
              </div>

              <div className="w-full rounded-2xl border border-slate-200 overflow-hidden bg-emerald-50">
                <canvas
                  ref={canvasRef}
                  width={1600}
                  height={900}
                  className="w-full h-auto block"
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Phase Timeline Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {phasesForDisplay.map((phase) => (
                  <div
                    key={phase.phaseNumber}
                    className={`rounded-xl border p-4 ${
                      phase.phaseNumber === activeSegmentInfoWithTiming.phaseNumber
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">Phase {phase.phaseNumber}</p>
                    <p className="text-sm text-slate-600 mt-2">
                      Green: {phase.greenTime}s
                    </p>
                    <p className="text-sm text-slate-600">
                      Yellow + All Red: {phase.yellowAllRed}s
                    </p>
                    <p className="text-sm text-slate-600 mt-2">
                      Served: {phase.movementSummary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {approachCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center"
                >
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="text-xl font-bold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-2">{card.composition}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="xl:col-span-2 space-y-4">
          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-4">Simulation Controls</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Speed
                </label>
                <select
                  value={`${speed}x`}
                  onChange={(e) => setSpeed(Number(e.target.value.replace("x", "")))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>1x</option>
                  <option>2x</option>
                  <option>4x</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Time Step (s)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={timeStep}
                  onChange={(e) => setTimeStep(Number(e.target.value) || 1)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showLaneLabels}
                  onChange={(e) => setShowLaneLabels(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Lane Labels</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showQueueOverlay}
                  onChange={(e) => setShowQueueOverlay(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Queue Overlay</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showSignalStates}
                  onChange={(e) => setShowSignalStates(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Signal States</span>
              </label>
            </div>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
            <h2 className="text-lg font-semibold mb-4">Live Status</h2>

            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Simulation Time</span>
                <span className="font-medium">{formatClock(elapsedSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="font-medium">{isRunning ? "Running" : "Paused"}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Phase</span>
                <span className="font-medium">{activePhaseLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>Signal State</span>
                <span className="font-medium">{activeSegmentInfoWithTiming.segmentType}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Time</span>
                <span className="font-medium">
                  {activeSegmentInfoWithTiming.remainingInSegment}s
                </span>
              </div>
              <div className="flex justify-between">
                <span>Vehicles in Network</span>
                <span className="font-medium">{vehiclesInNetwork}</span>
              </div>
              <div className="flex justify-between">
                <span>Queue Status</span>
                <span className="font-medium">{queueStatus}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
          <h2 className="text-lg font-semibold mb-4">Approach Queue Snapshot</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {approachCards.map((dir) => (
              <div
                key={dir.label}
                className="rounded-xl border border-slate-300 bg-white p-4"
              >
                <p className="text-sm text-slate-500">{dir.label}</p>
                <p className="text-xl font-bold mt-2">{dir.value}</p>
                <p className="text-xs text-slate-500 mt-2">{dir.composition}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
          <h2 className="text-lg font-semibold mb-4">Simulation Notes</h2>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
            <p>• Vehicles are now drawn directly on the HTML canvas.</p>
            <p>• Vehicles stop at stop lines on red/yellow and move on green.</p>
            <p>• Vehicle rectangles are lane-based and scalable for higher counts later.</p>
            <p>• Left, through, and right vehicles now follow different canvas paths.</p>
            <p>• Active approach for editing: {traffic.approachDirection}.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
