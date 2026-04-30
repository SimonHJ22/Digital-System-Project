import type { PhaseMovementPermissions } from "../types/traffic";
import { DIRECTION_PAIRS, MOVEMENT_KEYS } from "./constants";
import type {
  ActiveSignalSegment,
  DirectionKey,
  DirectionSignalMap,
  MovementSignalMap,
  MovementType,
  SegmentType,
  SignalDisplayState,
  SignalSegment,
} from "./types";

function getApproachDirectionFromDirectionKey(direction: DirectionKey) {
  if (direction === "northbound") return "Northbound";
  if (direction === "southbound") return "Southbound";
  if (direction === "eastbound") return "Eastbound";
  return "Westbound";
}

export function getMovementSignalState(
  direction: DirectionKey,
  movement: MovementType,
  movementPermissions: PhaseMovementPermissions,
  segmentType: SegmentType
): SignalDisplayState {
  const approachDirection = getApproachDirectionFromDirectionKey(direction);
  const isServed = Boolean(movementPermissions[approachDirection]?.[movement]);

  if (!isServed) return "red";
  if (segmentType === "Yellow") return "yellow";
  if (segmentType === "All Red") return "red";
  return "green";
}

export function getDirectionSignalState(
  movementSignals: MovementSignalMap
): SignalDisplayState {
  if (MOVEMENT_KEYS.some((movement) => movementSignals[movement] === "green")) {
    return "green";
  }

  if (MOVEMENT_KEYS.some((movement) => movementSignals[movement] === "yellow")) {
    return "yellow";
  }

  return "red";
}

export function buildDirectionSignalMap(
  movementPermissions: PhaseMovementPermissions,
  segmentType: SegmentType
): DirectionSignalMap {
  return Object.fromEntries(
    DIRECTION_PAIRS.map(([direction]) => [
      direction,
      {
        left: getMovementSignalState(direction, "left", movementPermissions, segmentType),
        through: getMovementSignalState(direction, "through", movementPermissions, segmentType),
        right: getMovementSignalState(direction, "right", movementPermissions, segmentType),
      },
    ])
  ) as DirectionSignalMap;
}

export function getTotalSignalCycleTime(segments: SignalSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.duration, 0);
}

export function getActiveSignalSegment(
  elapsedSeconds: number,
  segments: SignalSegment[]
): ActiveSignalSegment {
  if (segments.length === 0) {
    return {
      phaseIndex: 0,
      phaseNumber: 1,
      segmentType: "Green",
      duration: 1,
      movementPermissions: {
        Northbound: { left: false, through: false, right: false },
        Southbound: { left: false, through: false, right: false },
        Eastbound: { left: false, through: false, right: false },
        Westbound: { left: false, through: false, right: false },
      },
      movementSummary: "No served movements selected",
      start: 0,
      end: 1,
      elapsedInSegment: 0,
      remainingInSegment: 1,
    };
  }

  const totalCycleTime = getTotalSignalCycleTime(segments);
  const timeInCycle = totalCycleTime > 0 ? elapsedSeconds % totalCycleTime : 0;

  let accumulatedTime = 0;
  let activeSegment = segments[0];

  for (const segment of segments) {
    const segmentStart = accumulatedTime;
    const segmentEnd = accumulatedTime + segment.duration;

    if (timeInCycle < segmentEnd) {
      activeSegment = segment;
      accumulatedTime = segmentStart;
      break;
    }

    accumulatedTime = segmentEnd;
  }

  const start = accumulatedTime;
  const end = start + activeSegment.duration;

  return {
    ...activeSegment,
    start,
    end,
    elapsedInSegment: timeInCycle - start,
    remainingInSegment: Math.max(0, end - timeInCycle),
  };
}
