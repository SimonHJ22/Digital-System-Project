import { DIRECTION_PAIRS } from "./constants";
import type { DirectionKey, LanePath, QueueSnapshot, Vehicle } from "./types";

const MAX_QUEUED_SPEED = 12;
const FIRST_QUEUE_HEAD_MAX_DISTANCE_PX = 36;
const MAX_QUEUE_SPACING_PX = 55;
const POST_STOPLINE_TOLERANCE_PX = 8;

type LaneVehicleEntry = {
  vehicle: Vehicle;
  path: LanePath;
  distanceToStopLinePx: number;
};

type PhysicalLaneQueueBundle = {
  direction: DirectionKey;
  entries: LaneVehicleEntry[];
};

function createEmptyQueueSnapshot(): QueueSnapshot {
  return {
    northbound: 0,
    southbound: 0,
    eastbound: 0,
    westbound: 0,
  };
}

function groupVehiclesByPhysicalLane(
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>
): Map<string, PhysicalLaneQueueBundle> {
  const grouped = new Map<string, PhysicalLaneQueueBundle>();

  for (const vehicle of vehicles) {
    const path = lanePathMap[vehicle.laneId];

    if (!path) {
      continue;
    }

    const distanceToStopLinePx =
      (path.stopLineProgress - vehicle.progress) * Math.max(path.lengthPx, 1);

    const existing = grouped.get(path.physicalLaneKey);

    if (existing) {
      existing.entries.push({
        vehicle,
        path,
        distanceToStopLinePx,
      });
      continue;
    }

    grouped.set(path.physicalLaneKey, {
      direction: path.direction,
      entries: [
        {
          vehicle,
          path,
          distanceToStopLinePx,
        },
      ],
    });
  }

  return grouped;
}

function countQueuedVehiclesInPhysicalLane(entries: LaneVehicleEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }

  // Queue detection is threshold-based: identify a slow vehicle near the stop
  // line, then count the contiguous slow vehicles behind it in the same lane.
  const sorted = [...entries]
    .filter((entry) => entry.distanceToStopLinePx >= -POST_STOPLINE_TOLERANCE_PX)
    .sort((a, b) => a.distanceToStopLinePx - b.distanceToStopLinePx);

  if (sorted.length === 0) {
    return 0;
  }

  let queueCount = 0;
  let lastQueuedDistancePx = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index];
    const slowEnough = entry.vehicle.speed <= MAX_QUEUED_SPEED;

    if (!slowEnough) {
      if (queueCount > 0) {
        break;
      }
      continue;
    }

    if (queueCount === 0) {
      if (entry.distanceToStopLinePx <= FIRST_QUEUE_HEAD_MAX_DISTANCE_PX) {
        queueCount += 1;
        lastQueuedDistancePx = Math.max(0, entry.distanceToStopLinePx);
      }

      continue;
    }

    const spacingPx = entry.distanceToStopLinePx - lastQueuedDistancePx;
    const isContiguous = spacingPx <= MAX_QUEUE_SPACING_PX;

    if (!isContiguous) {
      break;
    }

    queueCount += 1;
    lastQueuedDistancePx = entry.distanceToStopLinePx;
  }

  return queueCount;
}

export function calculateApproachQueues(
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>
): QueueSnapshot {
  const queues = createEmptyQueueSnapshot();
  const groupedByPhysicalLane = groupVehiclesByPhysicalLane(vehicles, lanePathMap);

  for (const bundle of groupedByPhysicalLane.values()) {
    queues[bundle.direction] += countQueuedVehiclesInPhysicalLane(bundle.entries);
  }

  return queues;
}

export function getMaxQueue(queues: QueueSnapshot): number {
  return Math.max(
    queues.northbound,
    queues.southbound,
    queues.eastbound,
    queues.westbound
  );
}

export function getQueueStatus(maxQueue: number): string {
  if (maxQueue <= 5) return "Low";
  if (maxQueue <= 12) return "Moderate";
  return "Heavy";
}

export function getTotalVehiclesInNetwork(vehicles: Vehicle[]): number {
  return vehicles.length;
}

export function getOrderedQueues(
  queues: QueueSnapshot
): Array<[DirectionKey, number]> {
  return DIRECTION_PAIRS.map(([directionKey]) => [directionKey, queues[directionKey]]);
}
