import { useContext } from "react";
import { ScenarioContext } from "./scenarioContextObject";
import type { ScenarioContextValue } from "./scenarioTypes";

export const useScenario = (): ScenarioContextValue => {
  const context = useContext(ScenarioContext);

  if (!context) {
    throw new Error("useScenario must be used within a ScenarioProvider");
  }

  return context;
};