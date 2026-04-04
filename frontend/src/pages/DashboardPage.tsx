import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useScenario } from "../features/scenario/useScenario";
import { generateMockResults } from "../utils/mockAnalysis";
import { buildScenarioTemplate, normalizeImportedScenario } from "../utils/scenarioImport";

export default function DashboardPage() {
  const { scenario, setResults, replaceScenario } = useScenario();
  const navigate = useNavigate();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleDownloadTemplate = () => {
    const template = buildScenarioTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "traffic-scenario-template.json";
    link.click();

    window.URL.revokeObjectURL(url);
  };

  const handleImportScenario = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const fileText = await file.text();
      const importedScenario = normalizeImportedScenario(JSON.parse(fileText));

      replaceScenario(importedScenario);
      setImportStatus({
        type: "success",
        message: `Imported scenario "${importedScenario.scenarioName}" successfully.`,
      });
    } catch (error) {
      setImportStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Import failed. Please check the template format and try again.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const kpis = [
    {
      label: "Intersection Delay",
      value: scenario.results?.kpis.intersectionDelay ?? "-- s/veh",
    },
    {
      label: "LOS",
      value: scenario.results?.kpis.levelOfService ?? "--",
    },
    {
      label: "Max Queue",
      value: scenario.results?.kpis.maxBackOfQueue ?? "-- veh",
    },
    {
      label: "Critical v/c",
      value: scenario.results?.kpis.criticalVCRatio ?? "--",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Manage your traffic simulation project, scenarios, and analysis workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mb-3">Project Overview</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Project Name:</span> Traffic Simulation System
            </p>
            <p>
              <span className="font-medium">Current Study:</span> Signalized Intersection Analysis
            </p>
            <p>
              <span className="font-medium">Status:</span> HCM-oriented frontend integration in progress
            </p>
            <p>
              <span className="font-medium">HCM Engine:</span> Explicit lane-group geometry connected, refinement continuing
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mb-3">Active Scenario</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">Scenario Name:</span> {scenario.scenarioName}
            </p>
            <p>
              <span className="font-medium">Intersection:</span>{" "}
              {scenario.geometry.intersectionName || "Not set yet"}
            </p>
            <p>
              <span className="font-medium">Last Analysis:</span>{" "}
              {scenario.results?.kpis.analysisStatus ?? "Not run yet"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/geometry")}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Create Scenario
          </button>
          <button
            onClick={() => navigate("/geometry")}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Enter Geometry
          </button>
          <button
            onClick={() => navigate("/traffic")}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Enter Traffic Data
          </button>
          <button
            onClick={() => navigate("/signal")}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Enter Signal Timing
          </button>
          <button
                onClick={() => {
                    const mockResults = generateMockResults(scenario);
                    setResults(mockResults);
                    navigate("/results");
                }}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
                >
                Run Analysis
           </button>
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Download Template
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Import Scenario
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportScenario}
            className="hidden"
          />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Download the JSON template, fill in your geometry, traffic, and signal data,
          then import it back into the system.
        </p>
        {importStatus ? (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              importStatus.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {importStatus.message}
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-5"
            >
              <p className="text-sm text-slate-500">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
