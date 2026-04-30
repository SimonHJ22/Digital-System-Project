import { MAX_FRAME_DELTA_MS } from "./constants";
import { getPointOnPath } from "./worldBuilder";
import type { DirectionSignalMap, LanePath, Vehicle } from "./types";

const STANDSTILL_GAP_PX = 10;
const MIN_STOPLINE_BUFFER_PX = 10;
const TIME_HEADWAY_SECONDS = 0.28;
const CLOSING_SPEED_BUFFER_FACTOR = 0.1;
const YELLOW_COMMIT_BASE_DISTANCE_PX = 28;
const YELLOW_COMMIT_SPEED_FACTOR = 0.22;
const JUNCTION_CONFLICT_DISTANCE_PX = 12;
const JUNCTION_OCCUPANCY_DISTANCE_PX = 170;
const JUNCTION_CONFLICT_SAMPLE_COUNT = 10;




function groupVehiclesByPhysicalLane(
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>
): Map<string, Vehicle[]> {
  const grouped = new Map<string, Vehicle[]>();

  for (const vehicle of vehicles) {
    const path = lanePathMap[vehicle.laneId];

    if (!path) {
      continue;
    }

    if (!grouped.has(path.physicalLaneKey)) {
      grouped.set(path.physicalLaneKey, []);
    }

    grouped.get(path.physicalLaneKey)!.push(vehicle);
  }

  return grouped;
}

function getDistanceToStopLinePx(vehicle: Vehicle, path: LanePath): number {
  return (path.stopLineProgress - vehicle.progress) * Math.max(path.lengthPx, 1);
}

function shouldProceedOnYellow(vehicle: Vehicle, path: LanePath): boolean {
  const distanceToStopLinePx = getDistanceToStopLinePx(vehicle, path);
  const commitDistancePx =
    YELLOW_COMMIT_BASE_DISTANCE_PX +
    vehicle.speed * YELLOW_COMMIT_SPEED_FACTOR;

  return distanceToStopLinePx <= commitDistancePx;
}

function getDesiredFollowingGapPx(
  vehicle: Vehicle,
  leader: Vehicle | null
): number {
  // Simplified car-following gap: standstill spacing plus extra space for
  // leader length and the follower's current speed.
  const leaderLengthAllowance = leader ? leader.length * 0.65 : 0;
  const speedHeadwayPx = vehicle.speed * TIME_HEADWAY_SECONDS;

  return STANDSTILL_GAP_PX + leaderLengthAllowance + speedHeadwayPx;
}

function getClosingSpeedBufferPx(
  vehicle: Vehicle,
  leader: Vehicle | null
): number {
  if (!leader) {
    return 0;
  }

  return Math.max(0, vehicle.speed - leader.speed) * CLOSING_SPEED_BUFFER_FACTOR;
}

function getDesiredStoplineBufferPx(vehicle: Vehicle): number {
  return MIN_STOPLINE_BUFFER_PX + vehicle.speed * 0.12;
}


function getSamePathLeader(vehicle: Vehicle, vehicles: Vehicle[]): Vehicle | null {
  let samePathLeader: Vehicle | null = null;
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const candidate of vehicles) {
    if (candidate.id === vehicle.id || candidate.laneId !== vehicle.laneId) {
      continue;
    }

    if (candidate.progress <= vehicle.progress) {
      continue;
    }

    const gap = candidate.progress - vehicle.progress;

    if (gap < smallestGap) {
      smallestGap = gap;
      samePathLeader = candidate;
    }
  }

  return samePathLeader;
}

function getEffectiveLeader(
  vehicle: Vehicle,
  path: LanePath,
  physicalLaneLeader: Vehicle | null,
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>
): { leader: Vehicle | null; leaderPath: LanePath | null } {
  if (vehicle.progress < path.stopLineProgress) {
    return {
      leader: physicalLaneLeader,
      leaderPath: physicalLaneLeader
        ? lanePathMap[physicalLaneLeader.laneId] ?? null
        : null,
    };
  }

  const samePathLeader = getSamePathLeader(vehicle, vehicles);

  return {
    leader: samePathLeader,
    leaderPath: samePathLeader ? lanePathMap[samePathLeader.laneId] ?? null : null,
  };
}

function samplePathInsideJunction(path: LanePath): { x: number; y: number }[] {
  const startProgress = path.stopLineProgress;
  const endProgress = Math.min(
    1,
    path.stopLineProgress +
      JUNCTION_OCCUPANCY_DISTANCE_PX / Math.max(path.lengthPx, 1)
  );

  return Array.from(
    { length: JUNCTION_CONFLICT_SAMPLE_COUNT + 1 },
    (_, index) =>
      getPointOnPath(
        path,
        startProgress +
          ((endProgress - startProgress) * index) /
            JUNCTION_CONFLICT_SAMPLE_COUNT
      )
  );
}

function pathsConflict(pathA: LanePath, pathB: LanePath): boolean {
  if (
    pathA.laneId === pathB.laneId ||
    pathA.physicalLaneKey === pathB.physicalLaneKey
  ) {
    return false;
  }

  const samplesA = samplePathInsideJunction(pathA);
  const samplesB = samplePathInsideJunction(pathB);
  const conflictDistanceSquared = JUNCTION_CONFLICT_DISTANCE_PX ** 2;

  for (const pointA of samplesA) {
    for (const pointB of samplesB) {
      const dx = pointA.x - pointB.x;
      const dy = pointA.y - pointB.y;

      if (dx * dx + dy * dy <= conflictDistanceSquared) {
        return true;
      }
    }
  }

  return false;
}

function buildPathConflictMap(
  lanePathMap: Record<string, LanePath>
): Map<string, Set<string>> {
  // Precompute which lane paths intersect inside the junction so vehicles can
  // hold at the stop line instead of occupying the same conflict area.
  const conflictMap = new Map<string, Set<string>>();
  const paths = Object.values(lanePathMap);

  for (const path of paths) {
    conflictMap.set(path.laneId, new Set<string>());
  }

  for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < paths.length;
      rightIndex += 1
    ) {
      const pathA = paths[leftIndex];
      const pathB = paths[rightIndex];

      if (!pathsConflict(pathA, pathB)) {
        continue;
      }

      conflictMap.get(pathA.laneId)?.add(pathB.laneId);
      conflictMap.get(pathB.laneId)?.add(pathA.laneId);
    }
  }

  return conflictMap;
}

function isVehicleOccupyingJunction(vehicle: Vehicle, path: LanePath): boolean {
  if (vehicle.progress < path.stopLineProgress) {
    return false;
  }

  const junctionClearProgress =
    JUNCTION_OCCUPANCY_DISTANCE_PX / Math.max(path.lengthPx, 1);

  return vehicle.progress <= path.stopLineProgress + junctionClearProgress;
}

function hasConflictingVehicleInJunction(
  vehicle: Vehicle,
  path: LanePath,
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>,
  conflictMap: Map<string, Set<string>>
): boolean {
  const conflictingLaneIds = conflictMap.get(path.laneId);

  if (!conflictingLaneIds || conflictingLaneIds.size === 0) {
    return false;
  }

  for (const candidate of vehicles) {
    if (candidate.id === vehicle.id) {
      continue;
    }

    const candidatePath = lanePathMap[candidate.laneId];

    if (!candidatePath || !conflictingLaneIds.has(candidatePath.laneId)) {
      continue;
    }

    if (isVehicleOccupyingJunction(candidate, candidatePath)) {
      return true;
    }
  }

  return false;
}

export function updateVehicles(
  vehicles: Vehicle[],
  lanePathMap: Record<string, LanePath>,
  movementSignals: DirectionSignalMap,
  dtMs: number,
  speed: number,
  timeStep: number
): void {
  if (vehicles.length === 0) {
    return;
  }

  const boundedDtMs = Math.min(Math.max(dtMs, 0), MAX_FRAME_DELTA_MS);
  const dtSeconds = (boundedDtMs / 1000) * speed * timeStep;

  if (dtSeconds <= 0) {
    return;
  }

  const groupedVehicles = groupVehiclesByPhysicalLane(vehicles, lanePathMap);
  const conflictMap = buildPathConflictMap(lanePathMap);

  for (const laneVehicles of groupedVehicles.values()) {
    laneVehicles.sort((a, b) => {
      const pathA = lanePathMap[a.laneId];
      const pathB = lanePathMap[b.laneId];

      if (!pathA || !pathB) {
        return 0;
      }

      return getDistanceToStopLinePx(a, pathA) - getDistanceToStopLinePx(b, pathB);
    });

    for (let index = 0; index < laneVehicles.length; index += 1) {
      const vehicle = laneVehicles[index];
      const path = lanePathMap[vehicle.laneId];

      if (!path) {
        continue;
      }

      const physicalLaneLeader = index === 0 ? null : laneVehicles[index - 1];
      const { leader, leaderPath } = getEffectiveLeader(
        vehicle,
        path,
        physicalLaneLeader,
        vehicles,
        lanePathMap
      );

      const signalState = movementSignals[path.direction][path.movement];
      const isSignalPermissive =
        signalState === "green" ||
        (signalState === "yellow" && shouldProceedOnYellow(vehicle, path));

      if (vehicle.speed < vehicle.desiredSpeed) {
        vehicle.speed = Math.min(
          vehicle.desiredSpeed,
          vehicle.speed + vehicle.acceleration * dtSeconds
        );
      }

      let targetProgress =
        vehicle.progress + (vehicle.speed * dtSeconds) / Math.max(path.lengthPx, 1);



      const laneLeaderGapPx =
        getDesiredFollowingGapPx(vehicle, physicalLaneLeader) +
        getClosingSpeedBufferPx(vehicle, physicalLaneLeader);

      const followingGapProgress =
        laneLeaderGapPx / Math.max(path.lengthPx, 1);

      const stoplineBufferProgress =
        getDesiredStoplineBufferPx(vehicle) / Math.max(path.lengthPx, 1);


      // Stop-line control: a red signal caps progress before the stop bar, and
      // the cap depends on whether the vehicle is first in queue or following.
      if (!isSignalPermissive && vehicle.progress < path.stopLineProgress) {
        const stoplineLimitProgress = physicalLaneLeader
          ? path.stopLineProgress - followingGapProgress
          : path.stopLineProgress - stoplineBufferProgress;

        targetProgress = Math.min(targetProgress, stoplineLimitProgress);
      }

      // Conflict-area control prevents vehicles on crossing movements from
      // entering the junction at the same time.
      if (
        isSignalPermissive &&
        vehicle.progress < path.stopLineProgress &&
        hasConflictingVehicleInJunction(
          vehicle,
          path,
          vehicles,
          lanePathMap,
          conflictMap
        )
      ) {
        const conflictLimitProgress = physicalLaneLeader
          ? path.stopLineProgress - followingGapProgress
          : path.stopLineProgress - stoplineBufferProgress;

        targetProgress = Math.min(targetProgress, conflictLimitProgress);
      }

      // Once vehicles are on the same path, a follower cannot advance closer
      // than the desired dynamic gap behind its leader.
      if (leader && leaderPath) {
        const leaderDistanceToStopLinePx = getDistanceToStopLinePx(leader, leaderPath);
        const leaderGapPx =
          getDesiredFollowingGapPx(vehicle, leader) +
          getClosingSpeedBufferPx(vehicle, leader);

        const followerLimitProgress =
          path.stopLineProgress -
          (leaderDistanceToStopLinePx + leaderGapPx) /
            Math.max(path.lengthPx, 1);

        targetProgress = Math.min(targetProgress, followerLimitProgress);
      }


      if (targetProgress < vehicle.progress) {
        targetProgress = vehicle.progress;
      }

      const actualProgressDelta = targetProgress - vehicle.progress;
      const actualDistancePx = actualProgressDelta * Math.max(path.lengthPx, 1);
      const actualSpeed = actualDistancePx / dtSeconds;

      vehicle.progress = targetProgress;

      if (
        !isSignalPermissive &&
        vehicle.progress < path.stopLineProgress &&
        actualProgressDelta < 0.000001
      ) {
        vehicle.speed = 0;
      } else {
        vehicle.speed = Math.max(0, Math.min(vehicle.desiredSpeed, actualSpeed));
      }

      if (vehicle.progress > 1.02) {
        vehicle.progress = 1.2;
      }


    }
  }

  for (let index = vehicles.length - 1; index >= 0; index -= 1) {
    if (vehicles[index].progress > 1.1) {
      vehicles.splice(index, 1);
    }
  }
}
