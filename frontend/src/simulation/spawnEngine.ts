import {
  DIRECTION_PAIRS,
  VEHICLE_COLORS,
  VEHICLE_DIMENSIONS,
} from "./constants";

import type {
  ApproachSimulationConfig,
  ApproachSimulationMap,
  DirectionKey,
  LanePath,
  MovementType,
  Vehicle,
} from "./types";

type SerialRef = { current: number };

export type SpawnRuntimeState = {
  timeSinceLastSpawnByDirection: Record<DirectionKey, number>;
  spawnCursorByDirection: Record<DirectionKey, number>;
  nextSpawnIntervalByDirection: Record<DirectionKey, number>;
};



type SpawnCandidate = {
  path: LanePath;
  weight: number;
};


type PhysicalLaneBundle = {
  physicalLaneKey: string;
  direction: DirectionKey;
  lanePaths: LanePath[];
};

const MAX_SEEDED_VEHICLES_PER_LANE = 14;
const MIN_PROGRESS = 0.02;
const CRUISE_ENTRY_PROGRESS = 0.08;
const STOP_LINE_QUEUE_BUFFER_PROGRESS = 0.02;
const STOP_LINE_SEED_LIMIT_PROGRESS = 0.03;
const SEED_STANDSTILL_GAP_PX = 10;


function groupLanePathsByPhysicalLane(lanePaths: LanePath[]): PhysicalLaneBundle[] {
  const grouped = new Map<string, PhysicalLaneBundle>();

  for (const path of lanePaths) {
    const existing = grouped.get(path.physicalLaneKey);

    if (existing) {
      existing.lanePaths.push(path);
      continue;
    }

    grouped.set(path.physicalLaneKey, {
      physicalLaneKey: path.physicalLaneKey,
      direction: path.direction,
      lanePaths: [path],
    });
  }

  return Array.from(grouped.values());
}

function getMovementDemandPerServingLane(
  movement: MovementType,
  config: ApproachSimulationConfig
): number {
  return (
    config.demandCounts[movement] / Math.max(1, config.movementLaneCounts[movement])
  );
}

function getDemandWeightForPath(
  path: LanePath,
  config: ApproachSimulationConfig
): number {
  return getMovementDemandPerServingLane(path.movement, config);
}

function getInitialQueueShareForLane(
  laneIndex: number,
  laneCount: number,
  initialQueueVehicles: number
): number {
  if (laneCount <= 0 || initialQueueVehicles <= 0) {
    return 0;
  }

  const baseShare = Math.floor(initialQueueVehicles / laneCount);
  const remainder = initialQueueVehicles % laneCount;

  return baseShare + (laneIndex < remainder ? 1 : 0);
}

function getFallbackPath(bundle: PhysicalLaneBundle): LanePath {
  return (
    bundle.lanePaths.find((path) => path.movement === "through") ??
    bundle.lanePaths[0]
  );
}

function getSeedGapPx(path: LanePath): number {
  const dimensions = VEHICLE_DIMENSIONS[path.movement];
  return SEED_STANDSTILL_GAP_PX + dimensions.length * 0.65;
}

function getSlotKeyFromPhysicalLaneKey(physicalLaneKey: string): MovementType {
  const [, slotKey] = physicalLaneKey.split("_");

  if (slotKey === "left" || slotKey === "through" || slotKey === "right") {
    return slotKey;
  }

  return "through";
}

function getSlotLaneIndexFromPhysicalLaneKey(physicalLaneKey: string): number {
  const laneIndex = Number(physicalLaneKey.split("_")[2]);

  return Number.isFinite(laneIndex) && laneIndex >= 0 ? laneIndex : 0;
}



function hasRoomToSpawn(
  path: LanePath,
  vehicles: Vehicle[],
  lanePaths: LanePath[]
): boolean {
  const samePhysicalLaneIds = new Set(
    lanePaths
      .filter((candidatePath) => candidatePath.physicalLaneKey === path.physicalLaneKey)
      .map((candidatePath) => candidatePath.laneId)
  );

  const vehiclesInPhysicalLane = vehicles
    .filter((vehicle) => samePhysicalLaneIds.has(vehicle.laneId))
    .sort((a, b) => a.progress - b.progress);

  if (vehiclesInPhysicalLane.length === 0) {
    return true;
  }

  const firstVehicle = vehiclesInPhysicalLane[0];
  const requiredGapProgress =
    getSeedGapPx(path) / Math.max(path.lengthPx, 1);


  return firstVehicle.progress > CRUISE_ENTRY_PROGRESS + requiredGapProgress;
}



function allocatePathsForLaneVehicles(
  bundle: PhysicalLaneBundle,
  config: ApproachSimulationConfig,
  vehicleCount: number
): LanePath[] {
  if (vehicleCount <= 0) {
    return [];
  }

  const weightedPaths = bundle.lanePaths.map((path) => {
    const weight = getDemandWeightForPath(path, config);

    return {
      path,
      weight,
    };
  });

  const totalWeight = weightedPaths.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    const fallbackPath = getFallbackPath(bundle);
    return Array.from({ length: vehicleCount }, () => fallbackPath);
  }

  const allocations = weightedPaths.map(({ path, weight }) => {
    const rawCount = (weight / totalWeight) * vehicleCount;
    const count = Math.floor(rawCount);

    return {
      path,
      count,
      remainder: rawCount - count,
    };
  });

  let assigned = allocations.reduce((sum, entry) => sum + entry.count, 0);

  if (assigned < vehicleCount) {
    const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);

    for (let index = 0; index < byRemainder.length && assigned < vehicleCount; index += 1) {
      byRemainder[index].count += 1;
      assigned += 1;
    }
  }

  const allocatedPaths: LanePath[] = [];

  allocations.forEach(({ path, count }) => {
    for (let index = 0; index < count; index += 1) {
      allocatedPaths.push(path);
    }
  });

  return allocatedPaths;
}

function buildSpawnSequenceForDirection(
  direction: DirectionKey,
  lanePaths: LanePath[],
  approachConfigs: ApproachSimulationMap
): LanePath[] {
  const config = approachConfigs[direction];
  const directionLanePaths = lanePaths.filter((path) => path.direction === direction);

  if (directionLanePaths.length === 0 || config.totalVolume <= 0) {
    return [];
  }

  // Approximate movement choice by weighting each lane path with the demand
  // that can be served by that path, then cycling through a short sequence.
  const candidates: SpawnCandidate[] = directionLanePaths
    .map((path) => ({
      path,
      weight: getDemandWeightForPath(path, config),
    }))
    .filter((candidate) => candidate.weight > 0);

  if (candidates.length === 0) {
    return [];
  }

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const sequenceSize = Math.max(candidates.length, 12);

  const allocations = candidates.map((candidate) => {
    const rawCount = (candidate.weight / totalWeight) * sequenceSize;
    const count = Math.floor(rawCount);

    return {
      path: candidate.path,
      count,
      remainder: rawCount - count,
    };
  });

  let assigned = allocations.reduce((sum, allocation) => sum + allocation.count, 0);

  if (assigned < sequenceSize) {
    const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder);
    let remainderIndex = 0;

    while (assigned < sequenceSize) {
      byRemainder[remainderIndex % byRemainder.length].count += 1;
      assigned += 1;
      remainderIndex += 1;
    }
  }

  const sequence: LanePath[] = [];

  allocations.forEach(({ path, count }) => {
    for (let index = 0; index < count; index += 1) {
      sequence.push(path);
    }
  });

  return sequence.length > 0 ? sequence : [candidates[0].path];
}

function getNextSpawnPathForDirection(
  direction: DirectionKey,
  lanePaths: LanePath[],
  approachConfigs: ApproachSimulationMap,
  vehicles: Vehicle[],
  runtimeState: SpawnRuntimeState
): LanePath | null {
  const sequence = buildSpawnSequenceForDirection(
    direction,
    lanePaths,
    approachConfigs
  );

  if (sequence.length === 0) {
    return null;
  }

  const startIndex =
    runtimeState.spawnCursorByDirection[direction] % sequence.length;

  for (let offset = 0; offset < sequence.length; offset += 1) {
    const sequenceIndex = (startIndex + offset) % sequence.length;
    const path = sequence[sequenceIndex];

    if (hasRoomToSpawn(path, vehicles, lanePaths)) {
      runtimeState.spawnCursorByDirection[direction] = sequenceIndex + 1;
      return path;
    }
  }

  return null;
}

function getRandomizedSpawnInterval(baseIntervalSeconds: number): number {
  if (!Number.isFinite(baseIntervalSeconds) || baseIntervalSeconds <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  // A small random variation avoids perfectly periodic arrivals and acts as a
  // simple stochastic headway model for new vehicles.
  const variationFactor = 0.75 + Math.random() * 0.5;
  return baseIntervalSeconds * variationFactor;
}


export function createVehicle(
  path: LanePath,
  progress: number,
  serial: number
): Vehicle {
  const dimensions = VEHICLE_DIMENSIONS[path.movement];

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
    color: VEHICLE_COLORS[path.movement],
  };
}

export function createSpawnRuntimeState(): SpawnRuntimeState {
  return {
    timeSinceLastSpawnByDirection: {
      northbound: 0,
      southbound: 0,
      eastbound: 0,
      westbound: 0,
    },
    spawnCursorByDirection: {
      northbound: 0,
      southbound: 0,
      eastbound: 0,
      westbound: 0,
    },
    nextSpawnIntervalByDirection: {
      northbound: 0,
      southbound: 0,
      eastbound: 0,
      westbound: 0,
    },
  };
}



export function spawnVehiclesForTick(
  vehicles: Vehicle[],
  lanePaths: LanePath[],
  approachConfigs: ApproachSimulationMap,
  serialRef: SerialRef,
  runtimeState: SpawnRuntimeState,
  dtSeconds: number
): void {
  if (dtSeconds <= 0) {
    return;
  }

  DIRECTION_PAIRS.forEach(([direction]) => {
    const config = approachConfigs[direction];
    const hourlyDemand = config.totalVolume;

    if (hourlyDemand <= 0) {
      runtimeState.timeSinceLastSpawnByDirection[direction] = 0;
      runtimeState.nextSpawnIntervalByDirection[direction] = 0;
      return;
    }


    runtimeState.timeSinceLastSpawnByDirection[direction] += dtSeconds;

    // Convert hourly demand to a base inter-arrival time, then randomize it
    // slightly to approximate non-uniform arrivals at the approach entry.
    const vehiclesPerSecond = hourlyDemand / 3600;
    const baseSpawnIntervalSeconds =
      vehiclesPerSecond > 0 ? 1 / vehiclesPerSecond : Number.POSITIVE_INFINITY;

    if (!Number.isFinite(baseSpawnIntervalSeconds)) {
      return;
    }

    if (runtimeState.nextSpawnIntervalByDirection[direction] <= 0) {
      runtimeState.nextSpawnIntervalByDirection[direction] =
        getRandomizedSpawnInterval(baseSpawnIntervalSeconds);
    }

    if (
      runtimeState.timeSinceLastSpawnByDirection[direction] <
      runtimeState.nextSpawnIntervalByDirection[direction]
    ) {
      return;
    }


    const spawnPath = getNextSpawnPathForDirection(
      direction,
      lanePaths,
      approachConfigs,
      vehicles,
      runtimeState
    );

    if (!spawnPath) {
      return;
    }

    serialRef.current += 1;
    vehicles.push(
      createVehicle(spawnPath, CRUISE_ENTRY_PROGRESS, serialRef.current)
    );
    runtimeState.timeSinceLastSpawnByDirection[direction] = 0;
    runtimeState.nextSpawnIntervalByDirection[direction] =
      getRandomizedSpawnInterval(baseSpawnIntervalSeconds);

  });
}


export function seedVehicles(
  lanePaths: LanePath[],
  approachConfigs: ApproachSimulationMap,
  serialRef: SerialRef
): Vehicle[] {
  const vehicles: Vehicle[] = [];

  DIRECTION_PAIRS.forEach(([directionKey]) => {
    const config = approachConfigs[directionKey];
    const directionLanePaths = lanePaths.filter((path) => path.direction === directionKey);
    const physicalLanes = groupLanePathsByPhysicalLane(directionLanePaths);

    physicalLanes.forEach((bundle) => {
      const slotKey = getSlotKeyFromPhysicalLaneKey(bundle.physicalLaneKey);
      const slotLaneIndex = getSlotLaneIndexFromPhysicalLaneKey(
        bundle.physicalLaneKey
      );
      const slotConfig = config.laneGroupSlots.find(
        (slot) => slot.slotKey === slotKey
      );

      // Startup queue seeding is lane-group-specific: each physical lane only
      // receives its share of the user-entered initial queue for that slot.
      const initialQueueTarget = slotConfig
        ? getInitialQueueShareForLane(
            slotLaneIndex,
            slotConfig.laneCount,
            slotConfig.initialQueueVehicles
          )
        : 0;


      const totalTarget = Math.min(
        MAX_SEEDED_VEHICLES_PER_LANE,
        initialQueueTarget
      );



      const allocatedPaths = allocatePathsForLaneVehicles(bundle, config, totalTarget);

      for (let index = 0; index < allocatedPaths.length; index += 1) {
        const path = allocatedPaths[index];
        const gapProgress = getSeedGapPx(path) / Math.max(path.lengthPx, 1);


        const progress =
          index < initialQueueTarget
            ? Math.max(
                MIN_PROGRESS,
                path.stopLineProgress -
                  STOP_LINE_QUEUE_BUFFER_PROGRESS -
                  index * gapProgress
              )
            : CRUISE_ENTRY_PROGRESS;

        if (
          index >= initialQueueTarget &&
          progress >= path.stopLineProgress - STOP_LINE_SEED_LIMIT_PROGRESS
        ) {
          break;
        }

        serialRef.current += 1;
        vehicles.push(createVehicle(path, progress, serialRef.current));
      }
    });
  });

  return vehicles;
}
