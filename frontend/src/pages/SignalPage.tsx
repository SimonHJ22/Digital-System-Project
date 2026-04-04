import { useEffect, useMemo } from "react";
import { useScenario } from "../features/scenario/useScenario";
import type { ApproachDirection, ControlType, LaneGroupKey } from "../types/traffic";
import {
  APPROACH_DIRECTIONS,
  LANE_GROUP_KEYS,
  ensurePhaseTimingCount,
  formatPhaseMovementSummary,
} from "../utils/signalPhases";

function getApproachLabel(approach: ApproachDirection): string {
  if (approach === "Northbound") return "NB";
  if (approach === "Southbound") return "SB";
  if (approach === "Eastbound") return "EB";
  return "WB";
}

function getMovementLabel(movement: LaneGroupKey): string {
  if (movement === "left") return "LT";
  if (movement === "through") return "TH";
  return "RT";
}

export default function SignalPage() {
  const { scenario, updateSignal, resetSignal } = useScenario();
  const signal = scenario.signal;

  const phases = useMemo(
    () => ensurePhaseTimingCount(signal.phases, signal.numberOfPhases),
    [signal.phases, signal.numberOfPhases]
  );

  const phasesNeedNormalization =
    signal.phases.length !== phases.length ||
    signal.phases.some(
      (phase, index) =>
        !phase.movementPermissions ||
        phase.protectedMovements !== phases[index]?.protectedMovements
    );

  useEffect(() => {
    if (!phasesNeedNormalization) return;
    updateSignal({ phases });
  }, [phases, phasesNeedNormalization, updateSignal]);

  const updatePhaseField = (
    phaseIndex: number,
    field: "greenTime" | "yellowAllRed",
    value: number | ""
  ) => {
    const updatedPhases = phases.map((phase, index) =>
      index === phaseIndex ? { ...phase, [field]: value } : phase
    );

    updateSignal({ phases: updatedPhases });
  };

  const toggleMovementPermission = (
    phaseIndex: number,
    approach: ApproachDirection,
    movement: LaneGroupKey,
    checked: boolean
  ) => {
    const updatedPhases = phases.map((phase, index) => {
      if (index !== phaseIndex) return phase;

      const movementPermissions = {
        ...phase.movementPermissions,
        [approach]: {
          ...phase.movementPermissions[approach],
          [movement]: checked,
        },
      };

      return {
        ...phase,
        movementPermissions,
        protectedMovements: formatPhaseMovementSummary(movementPermissions),
      };
    });

    updateSignal({ phases: updatedPhases });
  };

  const handlePhaseCountChange = (value: number) => {
    updateSignal({
      numberOfPhases: value,
      phases: ensurePhaseTimingCount(signal.phases, value),
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Signal Timing Input</h1>
        <p className="text-slate-600 mt-1">
          Define cycle settings and explicit served movements for each signal phase.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Signal Control Settings</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Control Type
            </label>
            <select
              value={signal.controlType}
              onChange={(e) =>
                updateSignal({ controlType: e.target.value as ControlType })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Pretimed">Pretimed</option>
              <option value="Actuated">Actuated</option>
              <option value="Semiactuated">Semiactuated</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Number of Phases
            </label>
            <select
              value={signal.numberOfPhases}
              onChange={(e) => handlePhaseCountChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
            </select>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={signal.pedestrianPushButtonEnabled}
              onChange={(e) =>
                updateSignal({ pedestrianPushButtonEnabled: e.target.checked })
              }
            />
            <span className="text-sm text-slate-700">
              Pedestrian Push Button Enabled
            </span>
          </label>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Cycle and Timing</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cycle Length (s)
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 90"
                value={signal.cycleLength}
                onChange={(e) =>
                  updateSignal({
                    cycleLength: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Analysis Period (h)
              </label>
              <select
                value={signal.analysisPeriodHours}
                onChange={(e) =>
                  updateSignal({ analysisPeriodHours: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0.25}>0.25</option>
                <option value={0.5}>0.5</option>
                <option value={1.0}>1.0</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Minimum Pedestrian Green (s)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 12"
              value={signal.minimumPedestrianGreen}
              onChange={(e) =>
                updateSignal({
                  minimumPedestrianGreen:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>
      </div>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Phase Timing Plan</h2>
            <p className="text-sm text-slate-500 mt-1">
              Check the movements that receive service in each phase. The phase summary
              is generated automatically from these selections.
            </p>
          </div>

          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            Structured phase permissions enabled
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {phases.map((phase, phaseIndex) => (
            <div
              key={phase.phaseNumber}
              className="rounded-2xl border border-slate-300 bg-white p-4 space-y-4"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Phase {phase.phaseNumber}</h3>
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {phase.protectedMovements}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Use the movement grid below instead of typing movement text manually.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Green Time (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 35"
                    value={phase.greenTime}
                    onChange={(e) =>
                      updatePhaseField(
                        phaseIndex,
                        "greenTime",
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Yellow + All-Red (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 4"
                    value={phase.yellowAllRed}
                    onChange={(e) =>
                      updatePhaseField(
                        phaseIndex,
                        "yellowAllRed",
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-4 bg-slate-100 text-xs font-semibold text-slate-600">
                  <div className="px-4 py-3">Approach</div>
                  {LANE_GROUP_KEYS.map((movement) => (
                    <div key={movement} className="px-4 py-3 text-center">
                      {getMovementLabel(movement)}
                    </div>
                  ))}
                </div>

                {APPROACH_DIRECTIONS.map((approach) => (
                  <div
                    key={approach}
                    className="grid grid-cols-4 border-t border-slate-200 text-sm"
                  >
                    <div className="px-4 py-3 font-medium text-slate-700">
                      {getApproachLabel(approach)}
                    </div>

                    {LANE_GROUP_KEYS.map((movement) => (
                      <label
                        key={`${approach}_${movement}`}
                        className="flex items-center justify-center px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={phase.movementPermissions[approach][movement]}
                          onChange={(e) =>
                            toggleMovementPermission(
                              phaseIndex,
                              approach,
                              movement,
                              e.target.checked
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Signal Timing Notes</h2>

        <textarea
          rows={5}
          placeholder="Add notes about phase plan, protected/permitted turns, controller assumptions, or timing strategy..."
          value={signal.notes}
          onChange={(e) => updateSignal({ notes: e.target.value })}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-xl bg-blue-100 text-blue-700 font-medium cursor-default"
        >
          Inputs Save Automatically
        </button>
        <button
          onClick={resetSignal}
          className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
