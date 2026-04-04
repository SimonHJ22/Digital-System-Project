import type { ResultsData, ScenarioData } from "../types/traffic";
import { runHcmAnalysisForScenario } from "../hcm/scenarioAdapter";

export function generateMockResults(scenario: ScenarioData): ResultsData {
  return runHcmAnalysisForScenario(scenario);
}
