import { useScenario } from "../features/scenario/useScenario";
import { generateMockResults } from "../utils/mockAnalysis";
import type { ApproachResult, LaneGroupResult, ScenarioData, SummaryKPI } from "../types/traffic";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSummaryKpiRows(kpis: SummaryKPI): Array<{ label: string; value: string }> {
  return [
    { label: "Intersection Delay", value: kpis.intersectionDelay },
    { label: "Level of Service", value: kpis.levelOfService },
    { label: "Progression Factor", value: kpis.progressionFactor },
    { label: "Max Back of Queue", value: kpis.maxBackOfQueue },
    { label: "Critical v/c Ratio", value: kpis.criticalVCRatio },
    { label: "Analysis Status", value: kpis.analysisStatus },
  ];
}

function buildResultsPrintHtml(
  scenario: ScenarioData,
  summaryRows: Array<{ label: string; value: string }>,
  laneGroupRows: LaneGroupResult[],
  approachRows: ApproachResult[]
): string {
  const printedAt = new Date().toLocaleString();
  const kpiCardsHtml = summaryRows
    .map(
      (row) => `
        <div class="kpi-card">
          <div class="kpi-label">${escapeHtml(row.label)}</div>
          <div class="kpi-value">${escapeHtml(row.value)}</div>
        </div>
      `
    )
    .join("");

  const laneGroupTableRowsHtml =
    laneGroupRows.length > 0
      ? laneGroupRows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.laneGroup)}</td>
                <td>${escapeHtml(row.delay)}</td>
                <td>${escapeHtml(row.los)}</td>
                <td>${escapeHtml(row.vcRatio)}</td>
                <td>${escapeHtml(row.backOfQueue)}</td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="5" class="empty-cell">No lane-group results available.</td>
          </tr>
        `;

  const approachTableRowsHtml =
    approachRows.length > 0
      ? approachRows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.approach)}</td>
                <td>${escapeHtml(row.delay)}</td>
                <td>${escapeHtml(row.los)}</td>
                <td>${escapeHtml(row.adjustedFlow)}</td>
              </tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="4" class="empty-cell">No approach results available.</td>
          </tr>
        `;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(scenario.scenarioName)} - Results Report</title>
        <style>
          :root {
            color-scheme: light;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            font-family: "Segoe UI", Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
          }

          h1, h2 {
            margin: 0 0 12px;
          }

          p {
            margin: 0;
          }

          .page-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #cbd5e1;
          }

          .meta-grid,
          .kpi-grid {
            display: grid;
            gap: 12px;
          }

          .meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-top: 16px;
          }

          .kpi-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin: 20px 0 28px;
          }

          .meta-card,
          .kpi-card {
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 14px 16px;
            background: #f8fafc;
          }

          .meta-label,
          .kpi-label {
            font-size: 12px;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 6px;
          }

          .meta-value,
          .kpi-value {
            font-size: 18px;
            font-weight: 700;
          }

          .section {
            margin-top: 24px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }

          th,
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #cbd5e1;
            text-align: left;
            font-size: 14px;
            vertical-align: top;
          }

          th {
            background: #e2e8f0;
            font-weight: 700;
          }

          .empty-cell {
            color: #64748b;
            font-style: italic;
          }

          .footer {
            margin-top: 28px;
            padding-top: 12px;
            border-top: 1px solid #cbd5e1;
            font-size: 12px;
            color: #64748b;
          }

          @media print {
            body {
              padding: 18px;
            }
          }
        </style>
      </head>
      <body>
        <div class="page-header">
          <h1>Analysis Results Report</h1>
          <p>HCM-oriented operational output summary for the selected scenario.</p>

          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-label">Scenario Name</div>
              <div class="meta-value">${escapeHtml(scenario.scenarioName)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Intersection</div>
              <div class="meta-value">${escapeHtml(
                scenario.geometry.intersectionName || "Not set yet"
              )}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Control Type</div>
              <div class="meta-value">${escapeHtml(scenario.signal.controlType)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">Cycle Length</div>
              <div class="meta-value">${escapeHtml(
                scenario.signal.cycleLength === ""
                  ? "-- s"
                  : `${scenario.signal.cycleLength} s`
              )}</div>
            </div>
          </div>
        </div>

        <div class="kpi-grid">
          ${kpiCardsHtml}
        </div>

        <div class="section">
          <h2>Lane Group Results</h2>
          <table>
            <thead>
              <tr>
                <th>Lane Group</th>
                <th>Delay (s/veh)</th>
                <th>LOS</th>
                <th>v/c Ratio</th>
                <th>Back of Queue</th>
              </tr>
            </thead>
            <tbody>
              ${laneGroupTableRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>Approach Results</h2>
          <table>
            <thead>
              <tr>
                <th>Approach</th>
                <th>Delay (s/veh)</th>
                <th>LOS</th>
                <th>Adjusted Flow</th>
              </tr>
            </thead>
            <tbody>
              ${approachTableRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Printed: ${escapeHtml(printedAt)}
        </div>
      </body>
    </html>
  `;
}

function exportResultsToPdf(
  scenario: ScenarioData,
  summaryRows: Array<{ label: string; value: string }>,
  laneGroupRows: LaneGroupResult[],
  approachRows: ApproachResult[]
): void {
  const exportWindow = window.open("", "_blank");

  if (!exportWindow) {
    window.alert("The report window was blocked. Please allow pop-ups and try again.");
    return;
  }

  exportWindow.document.open();
  exportWindow.document.write(
    buildResultsPrintHtml(scenario, summaryRows, laneGroupRows, approachRows)
  );
  exportWindow.document.close();
  exportWindow.focus();
  window.setTimeout(() => {
    exportWindow.print();
  }, 250);
}

export default function ResultsPage() {
  const { scenario, setResults } = useScenario();
  const results = scenario.results;
  const activeApproaches = (
    ["Northbound", "Southbound", "Eastbound", "Westbound"] as const
  ).filter((approach) => scenario.geometry.approaches[approach].numberOfLanes > 0);

  const approachShortLabels: Record<(typeof activeApproaches)[number], string> = {
    Northbound: "NB",
    Southbound: "SB",
    Eastbound: "EB",
    Westbound: "WB",
  };

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
  const canExport = Boolean(results);

  const activeLanePrefixes = new Set(
    activeApproaches.flatMap((approach) => [approach, approachShortLabels[approach]])
  );

  const laneGroupRows = (results?.laneGroupResults ?? []).filter((row) =>
    Array.from(activeLanePrefixes).some((prefix) => row.laneGroup.startsWith(prefix))
  );

  const approachRows = (results?.approachResults ?? []).filter((row) =>
    activeApproaches.includes(row.approach as (typeof activeApproaches)[number])
  );


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
          <button
            onClick={() =>
              results
                ? exportResultsToPdf(scenario, buildSummaryKpiRows(results.kpis), laneGroupRows, approachRows)
                : undefined
            }
            disabled={!canExport}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
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
