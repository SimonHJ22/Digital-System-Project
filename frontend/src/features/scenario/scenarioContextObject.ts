import { createContext } from "react";
import type { ScenarioContextValue } from "./scenarioTypes";

export const ScenarioContext = createContext<ScenarioContextValue | undefined>(undefined);