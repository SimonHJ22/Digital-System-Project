import { useMemo, useState, type ReactNode } from "react";
import {
  defaultApproachGeometryMap,
  defaultApproachTrafficMap,
  defaultGeometryData,
  defaultResultsData,
  defaultSignalData,
  defaultTrafficData,
} from "../../types/defaults";
import type {
  ApproachDirection,
  ApproachGeometrySettings,
  LaneGroupGeometryDefinition,
  LaneGroupGeometryDefinitionPatch,
  LaneGroupInputSettings,
  LaneGroupKey,
  ApproachTrafficSettings,
  GeometryData,
  ResultsData,
  ScenarioData,
  SignalData,
  TrafficData,
} from "../../types/traffic";
import { normalizeImportedScenario } from "../../utils/scenarioImport";
import { ScenarioContext } from "./scenarioContextObject";

const initialScenario: ScenarioData = {
  scenarioName: "Baseline Scenario",
  geometry: defaultGeometryData,
  traffic: defaultTrafficData,
  signal: defaultSignalData,
  results: defaultResultsData,
};

type GeometrySnapshotKey = Exclude<
  keyof GeometryData,
  "intersectionName" | "areaType" | "numberOfApproaches" | "selectedApproach" | "approaches"
>;

type TrafficSnapshotKey = Exclude<
  keyof TrafficData,
  "approachDirection" | "approaches"
>;

const geometryApproachKeys: GeometrySnapshotKey[] = [
  "numberOfLanes",
  "laneWidth",
  "grade",
  "storageLength",
  "exclusiveLeftTurnLane",
  "exclusiveRightTurnLane",
  "parkingAdjacent",
  "busStopNearStopLine",
  "leftTurnLanes",
  "throughLanes",
  "rightTurnLanes",
];

const trafficApproachKeys: TrafficSnapshotKey[] = [
  "analysisPeriodHours",
  "peakHourFactor",
  "heavyVehiclesPercent",
  "arrivalType",
  "leftTurnVolume",
  "throughVolume",
  "rightTurnVolume",
  "pedestrianVolume",
  "bicycleVolume",
  "parkingManeuvers",
  "busesStopping",
  "rightTurnOnRedPermitted",
  "observedRTORVolume",
];

const laneGroupKeys: LaneGroupKey[] = ["left", "through", "right"];

function syncGeometrySnapshot(
  geometry: GeometryData,
  selectedApproach: ApproachDirection
): GeometryData {
  return {
    ...geometry,
    selectedApproach,
    ...geometry.approaches[selectedApproach],
  };
}

function syncTrafficSnapshot(
  traffic: TrafficData,
  approachDirection: ApproachDirection
): TrafficData {
  return {
    ...traffic,
    approachDirection,
    ...traffic.approaches[approachDirection],
  };
}

function extractApproachGeometryPatch(
  data: Partial<GeometryData>
): Partial<ApproachGeometrySettings> {
  const patch: Partial<ApproachGeometrySettings> = {};
  const mutablePatch = patch as Record<string, number | boolean | "">;

  geometryApproachKeys.forEach((key) => {
    const value = data[key];

    if (value !== undefined) {
      mutablePatch[key] = value as number | boolean | "";
    }
  });

  return patch;
}

function extractApproachTrafficPatch(
  data: Partial<TrafficData>
): Partial<ApproachTrafficSettings> {
  const patch: Partial<ApproachTrafficSettings> = {};
  const mutablePatch = patch as Record<string, number | boolean | "">;

  trafficApproachKeys.forEach((key) => {
    const value = data[key];

    if (value !== undefined) {
      mutablePatch[key] = value as number | boolean | "";
    }
  });

  return patch;
}

function getServedMovementKeys(
  definition: LaneGroupGeometryDefinition
): LaneGroupKey[] {
  return laneGroupKeys.filter((movement) => definition.servedMovements[movement]);
}

function syncLegacyGeometryFromLaneGroups(
  settings: ApproachGeometrySettings
): ApproachGeometrySettings {
  const activeDefinitions = laneGroupKeys
    .map((key) => settings.laneGroupDefinitions[key])
    .filter(
      (definition) =>
        definition.enabled &&
        definition.laneCount > 0 &&
        getServedMovementKeys(definition).length > 0
    );

  const numberOfLanes = activeDefinitions.reduce(
    (sum, definition) => sum + definition.laneCount,
    0
  );
  const leftTurnLanes = activeDefinitions.reduce((sum, definition) => {
    const servedMovements = getServedMovementKeys(definition);
    return servedMovements.length === 1 && servedMovements[0] === "left"
      ? sum + definition.laneCount
      : sum;
  }, 0);
  const throughLanes = activeDefinitions.reduce((sum, definition) => {
    const servedMovements = getServedMovementKeys(definition);
    return servedMovements.includes("through") ? sum + definition.laneCount : sum;
  }, 0);
  const rightTurnLanes = activeDefinitions.reduce((sum, definition) => {
    const servedMovements = getServedMovementKeys(definition);
    return servedMovements.length === 1 && servedMovements[0] === "right"
      ? sum + definition.laneCount
      : sum;
  }, 0);

  return {
    ...settings,
    numberOfLanes: Math.max(numberOfLanes, 1),
    leftTurnLanes,
    throughLanes: Math.max(throughLanes, activeDefinitions.length > 0 ? 0 : 1),
    rightTurnLanes,
    exclusiveLeftTurnLane: leftTurnLanes > 0,
    exclusiveRightTurnLane: rightTurnLanes > 0,
  };
}

function getGeometrySharedPatch(data: Partial<GeometryData>): Partial<GeometryData> {
  const sharedPatch = { ...data };

  delete sharedPatch.numberOfLanes;
  delete sharedPatch.laneWidth;
  delete sharedPatch.grade;
  delete sharedPatch.storageLength;
  delete sharedPatch.exclusiveLeftTurnLane;
  delete sharedPatch.exclusiveRightTurnLane;
  delete sharedPatch.parkingAdjacent;
  delete sharedPatch.busStopNearStopLine;
  delete sharedPatch.leftTurnLanes;
  delete sharedPatch.throughLanes;
  delete sharedPatch.rightTurnLanes;
  delete sharedPatch.laneGroupDefinitions;
  delete sharedPatch.approaches;

  return sharedPatch;
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<ScenarioData>(initialScenario);

  const setScenarioName = (name: string) => {
    setScenario((prev) => ({
      ...prev,
      scenarioName: name,
    }));
  };

  const replaceScenario = (nextScenario: ScenarioData) => {
    setScenario(normalizeImportedScenario(nextScenario));
  };

  const updateGeometry = (data: Partial<GeometryData>) => {
    setScenario((prev) => ({
      ...prev,
      geometry: (() => {
        const selectedApproach = data.selectedApproach ?? prev.geometry.selectedApproach;
        const approachPatch = extractApproachGeometryPatch(data);
        const nextApproaches = {
          ...prev.geometry.approaches,
          [selectedApproach]: syncLegacyGeometryFromLaneGroups({
            ...prev.geometry.approaches[selectedApproach],
            ...approachPatch,
          }),
        };
        const nextGeometry = {
          ...prev.geometry,
          ...getGeometrySharedPatch(data),
          approaches: nextApproaches,
        };

        return syncGeometrySnapshot(nextGeometry, selectedApproach);
      })(),
    }));
  };

  const updateGeometryLaneGroupDefinition = (
    laneGroupKey: LaneGroupKey,
    data: LaneGroupGeometryDefinitionPatch
  ) => {
    setScenario((prev) => {
      const selectedApproach = prev.geometry.selectedApproach;
      const currentDefinition =
        prev.geometry.approaches[selectedApproach].laneGroupDefinitions[laneGroupKey];
      const nextDefinition: LaneGroupGeometryDefinition = {
        ...currentDefinition,
        ...data,
        servedMovements: {
          ...currentDefinition.servedMovements,
          ...(data.servedMovements ?? {}),
        },
      };
      const nextApproachGeometry = syncLegacyGeometryFromLaneGroups({
        ...prev.geometry.approaches[selectedApproach],
        laneGroupDefinitions: {
          ...prev.geometry.approaches[selectedApproach].laneGroupDefinitions,
          [laneGroupKey]: nextDefinition,
        },
      });
      const nextGeometry = {
        ...prev.geometry,
        approaches: {
          ...prev.geometry.approaches,
          [selectedApproach]: nextApproachGeometry,
        },
      };

      return {
        ...prev,
        geometry: syncGeometrySnapshot(nextGeometry, selectedApproach),
      };
    });
  };

  const updateTraffic = (data: Partial<TrafficData>) => {
    setScenario((prev) => ({
      ...prev,
      traffic: (() => {
        const approachDirection = data.approachDirection ?? prev.traffic.approachDirection;
        const approachPatch = extractApproachTrafficPatch(data);
        const nextTraffic = {
          ...prev.traffic,
          approaches: {
            ...prev.traffic.approaches,
            [approachDirection]: {
              ...prev.traffic.approaches[approachDirection],
              ...approachPatch,
            },
          },
        };

        return syncTrafficSnapshot(nextTraffic, approachDirection);
      })(),
    }));
  };

  const updateTrafficLaneGroup = (
    laneGroupKey: LaneGroupKey,
    data: Partial<LaneGroupInputSettings>
  ) => {
    setScenario((prev) => {
      const approachDirection = prev.traffic.approachDirection;
      const nextApproachTraffic = {
        ...prev.traffic.approaches[approachDirection],
        laneGroups: {
          ...prev.traffic.approaches[approachDirection].laneGroups,
          [laneGroupKey]: {
            ...prev.traffic.approaches[approachDirection].laneGroups[laneGroupKey],
            ...data,
          },
        },
      };

      const nextTraffic = {
        ...prev.traffic,
        approaches: {
          ...prev.traffic.approaches,
          [approachDirection]: nextApproachTraffic,
        },
      };

      return {
        ...prev,
        traffic: syncTrafficSnapshot(nextTraffic, approachDirection),
      };
    });
  };

  const updateSignal = (data: Partial<SignalData>) => {
    setScenario((prev) => ({
      ...prev,
      signal: {
        ...prev.signal,
        ...data,
      },
    }));
  };

  const setResults = (results: ResultsData | null) => {
    setScenario((prev) => ({
      ...prev,
      results,
    }));
  };

  const resetGeometry = () => {
    setScenario((prev) => ({
      ...prev,
      geometry: syncGeometrySnapshot(
        {
          ...defaultGeometryData,
          approaches: {
            ...defaultApproachGeometryMap,
          },
        },
        "Northbound"
      ),
    }));
  };

  const resetTraffic = () => {
    setScenario((prev) => ({
      ...prev,
      traffic: syncTrafficSnapshot(
        {
          ...defaultTrafficData,
          approaches: {
            ...defaultApproachTrafficMap,
          },
        },
        "Northbound"
      ),
    }));
  };

  const resetSignal = () => {
    setScenario((prev) => ({
      ...prev,
      signal: defaultSignalData,
    }));
  };

  const resetScenario = () => {
    setScenario(initialScenario);
  };

  const value = useMemo(
    () => ({
      scenario,
      setScenarioName,
      replaceScenario,
      updateGeometry,
      updateGeometryLaneGroupDefinition,
      updateTraffic,
      updateTrafficLaneGroup,
      updateSignal,
      setResults,
      resetGeometry,
      resetTraffic,
      resetSignal,
      resetScenario,
    }),
    [scenario]
  );

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}
