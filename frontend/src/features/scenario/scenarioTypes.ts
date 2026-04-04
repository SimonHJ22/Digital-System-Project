import type {
  LaneGroupGeometryDefinitionPatch,
  LaneGroupInputSettings,
  LaneGroupKey,
  GeometryData,
  ResultsData,
  ScenarioData,
  SignalData,
  TrafficData,
} from "../../types/traffic";

export interface ScenarioContextValue {
  scenario: ScenarioData;
  setScenarioName: (name: string) => void;
  replaceScenario: (scenario: ScenarioData) => void;
  updateGeometry: (data: Partial<GeometryData>) => void;
  updateGeometryLaneGroupDefinition: (
    laneGroupKey: LaneGroupKey,
    data: LaneGroupGeometryDefinitionPatch
  ) => void;
  updateTraffic: (data: Partial<TrafficData>) => void;
  updateTrafficLaneGroup: (
    laneGroupKey: LaneGroupKey,
    data: Partial<LaneGroupInputSettings>
  ) => void;
  updateSignal: (data: Partial<SignalData>) => void;
  setResults: (results: ResultsData | null) => void;
  resetGeometry: () => void;
  resetTraffic: () => void;
  resetSignal: () => void;
  resetScenario: () => void;
}
