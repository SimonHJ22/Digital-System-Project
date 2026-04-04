import { useScenario } from "../features/scenario/useScenario";
import { generateMockResults } from "../utils/mockAnalysis";

export default function ResultsPage() {
  const { scenario, setResults } = useScenario();
  const results = scenario.results;

  const kpis = [
    {
      label: "Intersection Delay",
      value: results?.kpis.intersectionDelay ?? "-- s/veh",
    },
    {
      label: "Level of Service",
      value: results?.kpis.levelOfService ?? "--",
    },
    {
      label: "Progression Factor",
      value: results?.kpis.progressionFactor ?? "--",
    },
    {
      label: "Max Back of Queue",
      value: results?.kpis.maxBackOfQueue ?? "-- veh",
    },
    {
      label: "Critical v/c Ratio",
      value: results?.kpis.criticalVCRatio ?? "--",
    },
    {
      label: "Analysis Status",
      value: results?.kpis.analysisStatus ?? "Not Run",
    },
  ];

  const laneGroupRows = results?.laneGroupResults ?? [];
  const approachRows = results?.approachResults ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analysis Results</h1>
          <p className="text-slate-600 mt-1">
            View HCM-based operational outputs for the current scenario.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              const mockResults = generateMockResults(scenario);
              setResults(mockResults);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Run Analysis
          </button>
          <button className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition">
            Export Results
          </button>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4">Summary Indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpis.map((item) => (
            <div
              key={item.label}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-5"
            >
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Intersection Summary</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-sm text-slate-500">Scenario Name</p>
            <p className="mt-2 font-semibold">{scenario.scenarioName}</p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-sm text-slate-500">Intersection</p>
            <p className="mt-2 font-semibold">
              {scenario.geometry.intersectionName || "Not set yet"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-sm text-slate-500">Control Type</p>
            <p className="mt-2 font-semibold">
              {results?.controlType && results.controlType !== "--"
                ? results.controlType
                : scenario.signal.controlType}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-sm text-slate-500">Cycle Length</p>
            <p className="mt-2 font-semibold">
              {scenario.signal.cycleLength === ""
                ? "-- s"
                : `${scenario.signal.cycleLength} s`}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Lane Group Results</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="text-left border-b border-slate-300">
                <th className="py-3 pr-4">Lane Group</th>
                <th className="py-3 pr-4">Delay (s/veh)</th>
                <th className="py-3 pr-4">LOS</th>
                <th className="py-3 pr-4">v/c Ratio</th>
                <th className="py-3 pr-4">Back of Queue</th>
              </tr>
            </thead>
            <tbody>
              {laneGroupRows.map((row) => (
                <tr key={row.laneGroup} className="border-b border-slate-200">
                  <td className="py-3 pr-4 font-medium">{row.laneGroup}</td>
                  <td className="py-3 pr-4">{row.delay}</td>
                  <td className="py-3 pr-4">{row.los}</td>
                  <td className="py-3 pr-4">{row.vcRatio}</td>
                  <td className="py-3 pr-4">{row.backOfQueue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Approach Results</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="text-left border-b border-slate-300">
                <th className="py-3 pr-4">Approach</th>
                <th className="py-3 pr-4">Delay (s/veh)</th>
                <th className="py-3 pr-4">LOS</th>
                <th className="py-3 pr-4">Adjusted Flow</th>
              </tr>
            </thead>
            <tbody>
              {approachRows.map((row) => (
                <tr key={row.approach} className="border-b border-slate-200">
                  <td className="py-3 pr-4 font-medium">{row.approach}</td>
                  <td className="py-3 pr-4">{row.delay}</td>
                  <td className="py-3 pr-4">{row.los}</td>
                  <td className="py-3 pr-4">{row.adjustedFlow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Interpretation Notes</h2>

        <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
          <p>Results now come from the HCM-oriented frontend analysis adapter.</p>
          <p>
            Per-approach demand, explicit lane-group composition, and lane-group HCM
            inputs now influence delay, LOS, and queue outputs.
          </p>
          <p>
            Some Chapter 16 procedures are still partially refined, but lane-group
            structure is no longer inferred only from aggregate L/T/R lane counts.
          </p>
        </div>
      </section>
    </div>
  );
}
