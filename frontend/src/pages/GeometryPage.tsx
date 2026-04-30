import { useScenario } from "../features/scenario/useScenario";
import type { ApproachDirection, AreaType, LaneGroupKey } from "../types/traffic";

export default function GeometryPage() {
  const {
    scenario,
    updateGeometry,
    updateGeometryLaneGroupDefinition,
    resetGeometry,
  } = useScenario();
  const geometry = scenario.geometry;
  const approachCards = (Object.entries(geometry.approaches) as Array<
    [ApproachDirection, (typeof geometry.approaches)[ApproachDirection]]
  >).map(([direction, data]) => ({
    direction,
    lanes: `${data.leftTurnLanes}/${data.throughLanes}/${data.rightTurnLanes}`,
    total: data.numberOfLanes,
  }));
  const laneGroupSlots = (Object.entries(geometry.laneGroupDefinitions) as Array<
    [LaneGroupKey, (typeof geometry.laneGroupDefinitions)[LaneGroupKey]]
  >).map(([key, definition]) => ({
    key,
    title:
      key === "left"
        ? "Inside Group Slot"
        : key === "through"
          ? "Middle Group Slot"
          : "Outside Group Slot",
    definition,
    servedMovements: (["left", "through", "right"] as LaneGroupKey[]).filter(
      (movement) => definition.servedMovements[movement]
    ),
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Geometry Input</h1>
        <p className="text-slate-600 mt-1">
          Enter the geometric configuration of the signalized intersection.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">General Intersection Settings</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Intersection Name
            </label>
            <input
              type="text"
              placeholder="Enter intersection name"
              value={geometry.intersectionName}
              onChange={(e) =>
                updateGeometry({ intersectionName: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Area Type
            </label>
            <select
              value={geometry.areaType}
              onChange={(e) =>
                updateGeometry({ areaType: e.target.value as AreaType })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Other">Other</option>
              <option value="CBD">CBD</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Number of Approaches
            </label>
            <select
              value={geometry.numberOfApproaches}
              onChange={(e) =>
                updateGeometry({ numberOfApproaches: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={4}>4</option>
              <option value={3}>3</option>
            </select>
            {geometry.numberOfApproaches === 3 ? (
              <p className="mt-1 text-xs text-amber-600">
                For a 3-leg T test, choose one approach and disable all three lane-group
                slots on that approach. Also remove impossible turn movements and phase
                service for the closed arm.
              </p>
            ) : null}

          </div>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Selected Approach Geometry</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Approach Direction
            </label>
            <select
              value={geometry.selectedApproach}
              onChange={(e) =>
                updateGeometry({
                  selectedApproach: e.target.value as ApproachDirection,
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Northbound">Northbound</option>
              <option value="Southbound">Southbound</option>
              <option value="Eastbound">Eastbound</option>
              <option value="Westbound">Westbound</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Number of Lanes
              </label>
              <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-slate-700">
                {geometry.numberOfLanes}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Derived from the explicit lane-group composition below.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Lane Width (m)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 3.5"
                value={geometry.laneWidth}
                onChange={(e) =>
                  updateGeometry({
                    laneWidth: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Grade (%)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 0"
                value={geometry.grade}
                onChange={(e) =>
                  updateGeometry({
                    grade: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Storage Length (m)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 25"
                value={geometry.storageLength}
                onChange={(e) =>
                  updateGeometry({
                    storageLength:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>
      </div>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Lane Group Side Conditions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-300 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-700">Exclusive Left-Turn Lane</p>
            <p className="mt-1 text-sm text-slate-500">
              {geometry.exclusiveLeftTurnLane ? "Yes" : "No"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-white px-4 py-3">
            <p className="text-sm font-medium text-slate-700">Exclusive Right-Turn Lane</p>
            <p className="mt-1 text-sm text-slate-500">
              {geometry.exclusiveRightTurnLane ? "Yes" : "No"}
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={geometry.parkingAdjacent}
              onChange={(e) =>
                updateGeometry({ parkingAdjacent: e.target.checked })
              }
            />
            <span className="text-sm text-slate-700">
              Parking Adjacent to Lane Group
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={geometry.busStopNearStopLine}
              onChange={(e) =>
                updateGeometry({ busStopNearStopLine: e.target.checked })
              }
            />
            <span className="text-sm text-slate-700">Bus Stop Near Stop Line</span>
          </label>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Explicit Lane-Group Composition</h2>
          <p className="text-sm text-slate-500 mt-1">
            Define the physical lane groups for the selected approach. These group slots
            now drive the HCM adapter directly and can model shared lane groups such as
            LT/TH or TH/RT.
          </p>
        </div>

        <div className="space-y-4">
          {laneGroupSlots.map((slot) => (
            <div
              key={slot.key}
              className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800">{slot.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Served movements:{" "}
                    {slot.servedMovements.length > 0
                      ? slot.servedMovements.join(" / ")
                      : "none selected"}
                  </p>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={slot.definition.enabled}
                    onChange={(e) =>
                      updateGeometryLaneGroupDefinition(slot.key, {
                        enabled: e.target.checked,
                      })
                    }
                  />
                  Enable Group Slot
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Lane Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={slot.definition.laneCount}
                    onChange={(e) =>
                      updateGeometryLaneGroupDefinition(slot.key, {
                        laneCount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {(["left", "through", "right"] as LaneGroupKey[]).map((movement) => (
                  <label
                    key={`${slot.key}_${movement}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={slot.definition.servedMovements[movement]}
                      onChange={(e) =>
                        updateGeometryLaneGroupDefinition(slot.key, {
                          servedMovements: {
                            [movement]: e.target.checked,
                          },
                        })
                      }
                    />
                    <span className="text-sm text-slate-700">
                      Serve {movement.charAt(0).toUpperCase() + movement.slice(1)}
                    </span>
                  </label>
                ))}
              </div>

              {slot.definition.enabled && slot.servedMovements.length === 0 ? (
                <p className="text-sm text-amber-600">
                  Select at least one served movement for this lane group slot.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Total Physical Lanes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {geometry.numberOfLanes}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Exclusive Left Lanes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {geometry.leftTurnLanes}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Through-Serving Lanes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {geometry.throughLanes}
            </p>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Exclusive Right Lanes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {geometry.rightTurnLanes}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Approach Geometry Snapshot</h2>
            <p className="text-sm text-slate-500 mt-1">
              Each approach now stores its own geometry. Switching the selector loads
              that approach&apos;s saved values.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {approachCards.map((card) => (
            <button
              key={card.direction}
              type="button"
              onClick={() => updateGeometry({ selectedApproach: card.direction })}
              className={`rounded-xl border p-4 text-left transition ${
                geometry.selectedApproach === card.direction
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <p className="font-semibold text-slate-800">{card.direction}</p>
              <p className="text-sm text-slate-500 mt-2">
                {card.total === 0 ? "Inactive approach" : `Total lanes: ${card.total}`}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {card.total === 0 ? "Closed arm" : `L/T/R: ${card.lanes}`}
              </p>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition">
          Save Geometry
        </button>
        <button
            onClick={resetGeometry}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
            >
            Reset
        </button>
      </div>
    </div>
  );
}
