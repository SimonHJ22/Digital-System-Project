import { useScenario } from "../features/scenario/useScenario";
import type {
  ApproachDirection,
  ArrivalType,
  LaneGroupKey,
  LeftTurnPhasing,
} from "../types/traffic";

export default function TrafficPage() {
  const { scenario, updateTraffic, updateTrafficLaneGroup, resetTraffic } = useScenario();
  const traffic = scenario.traffic;
  const geometry = scenario.geometry;
  const approachCards = (Object.entries(traffic.approaches) as Array<
    [ApproachDirection, (typeof traffic.approaches)[ApproachDirection]]
  >).map(([direction, data]) => ({
    direction,
    totalVolume:
      Number(data.leftTurnVolume || 0) +
      Number(data.throughVolume || 0) +
      Number(data.rightTurnVolume || 0),
    movements: `L ${Number(data.leftTurnVolume || 0)} / T ${Number(
      data.throughVolume || 0
    )} / R ${Number(data.rightTurnVolume || 0)}`,
  }));
  const activeLaneGroups = (Object.entries(geometry.laneGroupDefinitions) as Array<
    [LaneGroupKey, (typeof geometry.laneGroupDefinitions)[LaneGroupKey]]
  >)
    .map(([key, definition]) => {
      const servedMovements = (["left", "through", "right"] as LaneGroupKey[]).filter(
        (movement) => definition.servedMovements[movement]
      );

      return {
        key,
        title:
          key === "left"
            ? "Inside Lane Group Slot"
            : key === "through"
              ? "Middle Lane Group Slot"
              : "Outside Lane Group Slot",
        servedMovements,
        hint: `${definition.laneCount} lane(s)`,
        active: definition.enabled && definition.laneCount > 0 && servedMovements.length > 0,
      };
    })
    .filter((group) => group.active);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Traffic Data Input</h1>
        <p className="text-slate-600 mt-1">
          Enter turning movement demand and traffic-related HCM inputs.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Approach Selection</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Approach Direction
            </label>
            <select
              value={traffic.approachDirection}
              onChange={(e) =>
                updateTraffic({
                  approachDirection: e.target.value as ApproachDirection,
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Analysis Period (hours)
            </label>
            <select
              value={traffic.analysisPeriodHours}
              onChange={(e) =>
                updateTraffic({ analysisPeriodHours: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0.25}>0.25</option>
              <option value={0.5}>0.5</option>
              <option value={1.0}>1.0</option>
            </select>
          </div>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Traffic Adjustment Inputs</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Peak Hour Factor (PHF)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                placeholder="e.g. 0.92"
                value={traffic.peakHourFactor}
                onChange={(e) =>
                  updateTraffic({
                    peakHourFactor:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Heavy Vehicles (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 5"
                value={traffic.heavyVehiclesPercent}
                onChange={(e) =>
                  updateTraffic({
                    heavyVehiclesPercent:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Arrival Type
            </label>
            <select
              value={traffic.arrivalType}
              onChange={(e) =>
                updateTraffic({ arrivalType: Number(e.target.value) as ArrivalType })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 - Very Poor Progression</option>
              <option value={2}>2 - Unfavorable</option>
              <option value={3}>3 - Random Arrivals</option>
              <option value={4}>4 - Favorable</option>
              <option value={5}>5 - Highly Favorable</option>
              <option value={6}>6 - Exceptional</option>
            </select>
          </div>
        </section>
      </div>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Turning Movement Volumes</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Left Turn Volume (veh/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 120"
              value={traffic.leftTurnVolume}
              onChange={(e) =>
                updateTraffic({
                  leftTurnVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Through Volume (veh/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 650"
              value={traffic.throughVolume}
              onChange={(e) =>
                updateTraffic({
                  throughVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Right Turn Volume (veh/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 80"
              value={traffic.rightTurnVolume}
              onChange={(e) =>
                updateTraffic({
                  rightTurnVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">
          Pedestrian, Bicycle, and Side Friction Inputs
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Pedestrian Volume (p/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 100"
              value={traffic.pedestrianVolume}
              onChange={(e) =>
                updateTraffic({
                  pedestrianVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Bicycle Volume (bikes/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 20"
              value={traffic.bicycleVolume}
              onChange={(e) =>
                updateTraffic({
                  bicycleVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Parking Maneuvers (veh/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 0"
              value={traffic.parkingManeuvers}
              onChange={(e) =>
                updateTraffic({
                  parkingManeuvers:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Buses Stopping (buses/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 0"
              value={traffic.busesStopping}
              onChange={(e) =>
                updateTraffic({
                  busesStopping:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Right Turn on Red (RTOR)</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={traffic.rightTurnOnRedPermitted}
              onChange={(e) =>
                updateTraffic({ rightTurnOnRedPermitted: e.target.checked })
              }
            />
            <span className="text-sm text-slate-700">Right Turn on Red Permitted</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Observed RTOR Volume (veh/h)
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 15"
              value={traffic.observedRTORVolume}
              onChange={(e) =>
                updateTraffic({
                  observedRTORVolume:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Lane-Group HCM Inputs</h2>
        <p className="text-sm text-slate-500 mb-4">
          Enter Chapter 16 inputs for each explicit lane-group slot on the selected
          approach. These values now follow the lane-group composition defined on the
          Geometry page instead of inferred L/T/R lane counts.
        </p>

        <div className="space-y-4">
          {activeLaneGroups.map((group) => {
            const laneGroup = traffic.approaches[traffic.approachDirection].laneGroups[group.key];
            const servesLeft = group.servedMovements.includes("left");
            const servesRight = group.servedMovements.includes("right");

            return (
              <div
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
              >
                <div>
                  <h3 className="font-semibold text-slate-800">{group.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Serves: {group.servedMovements.join(" / ")} • {group.hint}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Initial Queue (veh)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 3"
                      value={laneGroup.initialQueueVehicles}
                      onChange={(e) =>
                        updateTrafficLaneGroup(group.key, {
                          initialQueueVehicles:
                            e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {servesLeft ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Left-Turn Phasing
                      </label>
                      <select
                        value={laneGroup.leftTurnPhasing}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            leftTurnPhasing: e.target.value as LeftTurnPhasing,
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="protected">Protected</option>
                        <option value="permitted">Permitted</option>
                        <option value="protected-permitted">Protected-Permitted</option>
                      </select>
                    </div>
                  ) : null}

                  {servesLeft ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        LT Protected Share (0-1)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="e.g. 0.50"
                        value={laneGroup.leftTurnProtectedProportion}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            leftTurnProtectedProportion:
                              e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : null}

                  {servesLeft ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        LT Opposing Flow (veh/h)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 450"
                        value={laneGroup.leftTurnOpposingFlowVehPerHour}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            leftTurnOpposingFlowVehPerHour:
                              e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : null}

                  {servesLeft ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        LT Ped Conflict (0-1)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="e.g. 0.30"
                        value={laneGroup.leftTurnPedestrianConflict}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            leftTurnPedestrianConflict:
                              e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : null}

                  {servesRight ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        RT Protected Share (0-1)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="e.g. 0.20"
                        value={laneGroup.rightTurnProtectedProportion}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            rightTurnProtectedProportion:
                              e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : null}

                  {servesRight ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        RT Ped Conflict (0-1)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="e.g. 0.25"
                        value={laneGroup.rightTurnPedestrianConflict}
                        onChange={(e) =>
                          updateTrafficLaneGroup(group.key, {
                            rightTurnPedestrianConflict:
                              e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Approach Demand Snapshot</h2>
        <p className="text-sm text-slate-500 mb-4">
          Each direction now stores its own demand and adjustment inputs. Click a card
          to jump to that approach.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {approachCards.map((card) => (
            <button
              key={card.direction}
              type="button"
              onClick={() => updateTraffic({ approachDirection: card.direction })}
              className={`rounded-xl border p-4 text-left transition ${
                traffic.approachDirection === card.direction
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <p className="font-semibold text-slate-800">{card.direction}</p>
              <p className="text-sm text-slate-500 mt-2">
                Total volume: {card.totalVolume} veh/h
              </p>
              <p className="text-sm text-slate-500 mt-1">{card.movements}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition">
          Save Traffic Data
        </button>
        <button
            onClick={resetTraffic}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
            >
            Reset
        </button>
      </div>
    </div>
  );
}
