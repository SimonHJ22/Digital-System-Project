import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ScenarioProvider } from "./features/scenario/ScenarioContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ScenarioProvider>
      <App />
    </ScenarioProvider>
  </React.StrictMode>
);