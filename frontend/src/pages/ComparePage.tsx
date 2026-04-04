import { useMemo, useState } from "react";
import { useScenario } from "../features/scenario/useScenario";
import { generateMockResults } from "../utils/mockAnalysis";
import type { ResultsData, ScenarioData } from "../types/traffic";

const BASELINE_STORAGE_KEY = "ui_simulation_compare_baseline";

type StoredBaseline = {
  capturedAt: string;
  scenario: ScenarioData;
};

type ComparisonRow = {
  metric: string;
  baseline: string;
  proposed: string;
  change: string;
  impact: "Improved" | "Worsened" | "No Change" | "Pending";
};

type ApproachComparisonRow = {
  approach: string;
  baselineDelay: string;
  proposedDelay: string;
  baselineLOS: string;
  proposedLOS: string;
};

function cloneScenario(scenario: ScenarioData): ScenarioData {
  return JSON.parse(JSON.stringify(scenario)) as ScenarioData;
}

function loadStoredBaseline(): StoredBaseline | null {
  if (typeof window === "undefined") return null;

  const rawValue = window.localStorage.getItem(BASELINE_STORAGE_KEY);

  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as StoredBaseline;
  } catch {
    return null;
  }
}

function saveStoredBaseline(snapshot: StoredBaseline | null): void {
  if (typeof window === "undefined") return;

  if (!snapshot) {
    window.localStorage.removeItem(BASELINE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(snapshot));
}

function extractNumericValue(value: string): number | null {
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getLosRank(los: string): number {
  const normalized = los.trim().toUpperCase();

  if (normalized === "A") return 1;
  if (normalized === "B") return 2;
  if (normalized === "C") return 3;
  if (normalized === "D") return 4;
  if (normalized === "E") return 5;
  if (normalized === "F") return 6;
  return 99;
}

function formatNumericChange(
  baseline: string,
  proposed: string,
  decimals: number
): { change: string; impact: ComparisonRow["impact"] } {
  const baselineValue = extractNumericValue(baseline);
  const proposedValue = extractNumericValue(proposed);

  if (baselineValue === null || proposedValue === null) {
    return {
      change: "--",
      impact: "Pending",
    };
  }

  const difference = proposedValue - baselineValue;

  if (Math.abs(difference) < 0.05) {
    return {
      change: "0.00",
      impact: "No Change",
    };
  }

  return {
    change: `${difference > 0 ? "+" : ""}${difference.toFixed(decimals)}`,
    impact: difference < 0 ? "Improved" : "Worsened",
  };
}

function buildComparisonRows(
  baselineResults: ResultsData | null,
  proposedResults: ResultsData | null
): ComparisonRow[] {
  if (!baselineResults || !proposedResults) {
    return [
      {
        metric: "Intersection Delay (s/veh)",
        baseline: "--",
        proposed: "--",
        change: "--",
        impact: "Pending",
      },
      {
        metric: "Level of Service",
        baseline: "--",
        proposed: "--",
        change: "--",
        impact: "Pending",
      },
      {
        metric: "Max Back of Queue (veh)",
        baseline: "--",
        proposed: "--",
        change: "--",
        impact: "Pending",
      },
      {
        metric: "Critical v/c Ratio",
        baseline: "--",
        proposed: "--",
        change: "--",
        impact: "Pending",
      },
    ];
  }

  const delayChange = formatNumericChange(
    baselineResults.kpis.intersectionDelay,
    proposedResults.kpis.intersectionDelay,
    1
  );
  const queueChange = formatNumericChange(
    baselineResults.kpis.maxBackOfQueue,
    proposedResults.kpis.maxBackOfQueue,
    0
  );
  const vcChange = formatNumericChange(
    baselineResults.kpis.criticalVCRatio,
    proposedResults.kpis.criticalVCRatio,
    2
  );
  const baselineLosRank = getLosRank(baselineResults.kpis.levelOfService);
  const proposedLosRank = getLosRank(proposedResults.kpis.levelOfService);
  const losImpact =
    proposedLosRank === baselineLosRank
      ? "No Change"
      : proposedLosRank < baselineLosRank
        ? "Improved"
        : "Worsened";

  return [
    {
      metric: "Intersection Delay (s/veh)",
      baseline: baselineResults.kpis.intersectionDelay,
      proposed: proposedResults.kpis.intersectionDelay,
      change: delayChange.change,
      impact: delayChange.impact,
    },
    {
      metric: "Level of Service",
      baseline: baselineResults.kpis.levelOfService,
      proposed: proposedResults.kpis.levelOfService,
      change:
        baselineResults.kpis.levelOfService === proposedResults.kpis.levelOfService
          ? "No change"
          : `${baselineResults.kpis.levelOfService} → ${proposedResults.kpis.levelOfService}`,
      impact: losImpact,
    },
    {
      metric: "Max Back of Queue (veh)",
      baseline: baselineResults.kpis.maxBackOfQueue,
      proposed: proposedResults.kpis.maxBackOfQueue,
      change: queueChange.change,
      impact: queueChange.impact,
    },
    {
      metric: "Critical v/c Ratio",
      baseline: baselineResults.kpis.criticalVCRatio,
      proposed: proposedResults.kpis.criticalVCRatio,
      change: vcChange.change,
      impact: vcChange.impact,
    },
  ];
}

function buildApproachRows(
  baselineResults: ResultsData | null,
  proposedResults: ResultsData | null
): ApproachComparisonRow[] {
  if (!baselineResults || !proposedResults) {
    return ["Northbound", "Southbound", "Eastbound", "Westbound"].map((approach) => ({
      approach,
      baselineDelay: "--",
      proposedDelay: "--",
      baselineLOS: "--",
      proposedLOS: "--",
    }));
  }

  return proposedResults.approachResults.map((proposedRow) => {
    const baselineRow =
      baselineResults.approachResults.find(
        (candidate) => candidate.approach === proposedRow.approach
      ) ?? null;

    return {
      approach: proposedRow.approach,
      baselineDelay: baselineRow?.delay ?? "--",
      proposedDelay: proposedRow.delay,
      baselineLOS: baselineRow?.los ?? "--",
      proposedLOS: proposedRow.los,
    };
  });
}

function getImpactBadgeClasses(impact: ComparisonRow["impact"]): string {
  if (impact === "Improved") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (impact === "Worsened") {
    return "bg-rose-100 text-rose-700";
  }

  if (impact === "No Change") {
    return "bg-slate-200 text-slate-700";
  }

  return "bg-amber-100 text-amber-700";
}

function buildRecommendationLines(comparisonRows: ComparisonRow[]): string[] {
  const delayRow = comparisonRows.find(
    (row) => row.metric === "Intersection Delay (s/veh)"
  );
  const queueRow = comparisonRows.find(
    (row) => row.metric === "Max Back of Queue (veh)"
  );
  const vcRow = comparisonRows.find(
    (row) => row.metric === "Critical v/c Ratio"
  );

  if (!delayRow || delayRow.impact === "Pending") {
    return [
      "Capture a baseline scenario first, then change geometry or signal timing and run the comparison again.",
      "This page now compares two real HCM-oriented runs instead of placeholder values.",
    ];
  }

  const recommendations: string[] = [];

  if (delayRow.impact === "Improved") {
    recommendations.push(
      `The proposed configuration reduces intersection delay by ${delayRow.change.replace("-", "")} s/veh.`
    );
  } else if (delayRow.impact === "Worsened") {
    recommendations.push(
      `The proposed configuration increases delay by ${delayRow.change.replace("+", "")} s/veh and should be reviewed.`
    );
  }

  if (queueRow && queueRow.impact === "Improved") {
    recommendations.push("Queue spillback risk is lower in the proposed scenario.");
  } else if (queueRow && queueRow.impact === "Worsened") {
    recommendations.push(
      "Back-of-queue performance worsened, so lane-group or phase allocation may need refinement."
    );
  }

  if (vcRow && vcRow.impact === "Worsened") {
    recommendations.push(
      "The critical v/c ratio increased, which suggests the proposed design may be pushing one movement closer to capacity."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "The current changes produce little measurable difference, so a stronger geometry or signal revision may be needed."
    );
  }

  return recommendations;
}

export default function ComparePage() {
  const { scenario, setResults } = useScenario();
  const [baselineSnapshot, setBaselineSnapshot] = useState<StoredBaseline | null>(
    () => loadStoredBaseline()
  );

  const baselineResults = useMemo(
    () =>
      baselineSnapshot ? generateMockResults(baselineSnapshot.scenario) : null,
    [baselineSnapshot]
  );
  const proposedResults = useMemo(() => generateMockResults(scenario), [scenario]);
  const comparisonRows = useMemo(
    () => buildComparisonRows(baselineResults, baselineSnapshot ? proposedResults : null),
    [baselineResults, baselineSnapshot, proposedResults]
  );
  const approachRows = useMemo(
    () => buildApproachRows(baselineResults, baselineSnapshot ? proposedResults : null),
    [baselineResults, baselineSnapshot, proposedResults]
  );
  const recommendationLines = useMemo(
    () => buildRecommendationLines(comparisonRows),
    [comparisonRows]
  );

  const handleCaptureBaseline = () => {
    const snapshot: StoredBaseline = {
      capturedAt: new Date().toLocaleString(),
      scenario: cloneScenario({
        ...scenario,
        results: proposedResults,
      }),
    };

    setBaselineSnapshot(snapshot);
    saveStoredBaseline(snapshot);
  };

  const handleCompareNow = () => {
    setResults(proposedResults);
  };

  const handleExportComparison = () => {
    if (!baselineSnapshot) return;

    const exportPayload = {
      baseline: {
        capturedAt: baselineSnapshot.capturedAt,
        scenarioName: baselineSnapshot.scenario.scenarioName,
        intersection: baselineSnapshot.scenario.geometry.intersectionName || "Not set yet",
        results: baselineResults,
      },
      proposed: {
        scenarioName: scenario.scenarioName,
        intersection: scenario.geometry.intersectionName || "Not set yet",
        results: proposedResults,
      },
      overallComparison: comparisonRows,
      approachComparison: approachRows,
      recommendations: recommendationLines,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "traffic-scenario-comparison.json";
    link.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compare Scenarios</h1>
          <p className="text-slate-600 mt-1">
            Capture a baseline, modify the current scenario, and compare both HCM-oriented
            runs side by side.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleCaptureBaseline}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            {baselineSnapshot ? "Replace Baseline" : "Set Current as Baseline"}
          </button>
          <button
            onClick={handleCompareNow}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Compare Now
          </button>
          <button
            onClick={handleExportComparison}
            disabled={!baselineSnapshot}
            className={`px-4 py-2 rounded-xl border font-medium transition ${
              baselineSnapshot
                ? "bg-white border-slate-300 text-slate-800 hover:bg-slate-100"
                : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            Export Comparison
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Baseline Scenario</h2>
            {baselineSnapshot ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                Captured
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                Awaiting baseline
              </span>
            )}
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
            <p>
              <span className="font-medium">Scenario Name:</span>{" "}
              {baselineSnapshot?.scenario.scenarioName ?? "--"}
            </p>
            <p>
              <span className="font-medium">Intersection:</span>{" "}
              {baselineSnapshot?.scenario.geometry.intersectionName || "Not set yet"}
            </p>
            <p>
              <span className="font-medium">Analysis Status:</span>{" "}
              {baselineResults?.kpis.analysisStatus ?? "Capture baseline first"}
            </p>
            <p>
              <span className="font-medium">Control Type:</span>{" "}
              {baselineSnapshot?.scenario.signal.controlType ?? "--"}
            </p>
            <p>
              <span className="font-medium">Captured At:</span>{" "}
              {baselineSnapshot?.capturedAt ?? "--"}
            </p>
          </div>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Proposed Scenario</h2>
            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              Current workspace state
            </span>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
            <p>
              <span className="font-medium">Scenario Name:</span>{" "}
              {scenario.scenarioName}
            </p>
            <p>
              <span className="font-medium">Intersection:</span>{" "}
              {scenario.geometry.intersectionName || "Not set yet"}
            </p>
            <p>
              <span className="font-medium">Analysis Status:</span>{" "}
              {proposedResults.kpis.analysisStatus}
            </p>
            <p>
              <span className="font-medium">Control Type:</span>{" "}
              {scenario.signal.controlType}
            </p>
            <p>
              <span className="font-medium">Cycle Length:</span>{" "}
              {scenario.signal.cycleLength === "" ? "-- s" : `${scenario.signal.cycleLength} s`}
            </p>
          </div>
        </section>
      </div>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Overall Comparison</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-sm">
            <thead>
              <tr className="text-left border-b border-slate-300">
                <th className="py-3 pr-4">Metric</th>
                <th className="py-3 pr-4">Baseline</th>
                <th className="py-3 pr-4">Proposed</th>
                <th className="py-3 pr-4">Change</th>
                <th className="py-3 pr-4">Impact</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.metric} className="border-b border-slate-200">
                  <td className="py-3 pr-4 font-medium">{row.metric}</td>
                  <td className="py-3 pr-4">{row.baseline}</td>
                  <td className="py-3 pr-4">{row.proposed}</td>
                  <td className="py-3 pr-4">{row.change}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getImpactBadgeClasses(
                        row.impact
                      )}`}
                    >
                      {row.impact}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Approach-by-Approach Comparison</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left border-b border-slate-300">
                <th className="py-3 pr-4">Approach</th>
                <th className="py-3 pr-4">Baseline Delay</th>
                <th className="py-3 pr-4">Proposed Delay</th>
                <th className="py-3 pr-4">Baseline LOS</th>
                <th className="py-3 pr-4">Proposed LOS</th>
              </tr>
            </thead>
            <tbody>
              {approachRows.map((row) => (
                <tr key={row.approach} className="border-b border-slate-200">
                  <td className="py-3 pr-4 font-medium">{row.approach}</td>
                  <td className="py-3 pr-4">{row.baselineDelay}</td>
                  <td className="py-3 pr-4">{row.proposedDelay}</td>
                  <td className="py-3 pr-4">{row.baselineLOS}</td>
                  <td className="py-3 pr-4">{row.proposedLOS}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Recommendation Summary</h2>

        <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
          {recommendationLines.map((line) => (
            <p key={line}>• {line}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
