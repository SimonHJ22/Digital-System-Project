import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateApproachQueues,
  getMaxQueue,
  getQueueStatus,
  getTotalVehiclesInNetwork,
} from "../simulation/queueEngine";
import { useScenario } from "../features/scenario/useScenario";
import type { ApproachDirection } from "../types/traffic";
import { ensurePhaseTimingCount, formatPhaseMovementSummary } from "../utils/signalPhases";
import { renderSimulationCanvas } from "../simulation/renderCanvas";
import {
  buildDirectionSignalMap as buildSimulationDirectionSignalMap,
  getActiveSignalSegment as getSimulationActiveSignalSegment,
} from "../simulation/signalEngine";
import { buildSimulationConfig } from "../simulation/buildSimulationConfig";
import {
  createSpawnRuntimeState,
  seedVehicles,
  spawnVehiclesForTick,
} from "../simulation/spawnEngine";

import { updateVehicles as updateSimulationVehicles } from "../simulation/vehicleEngine";
import { buildLanePathMap, buildLanePaths } from "../simulation/worldBuilder";
import type { DirectionKey, Vehicle } from "../simulation/types";




function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}



const directionPairs: Array<[DirectionKey, ApproachDirection]> = [
  ["northbound", "Northbound"],
  ["southbound", "Southbound"],
  ["eastbound", "Eastbound"],
  ["westbound", "Westbound"],
];



export default function SimulationPage() {
  const { scenario } = useScenario();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const vehicleSerialRef = useRef(0);
  const spawnRuntimeRef = useRef(createSpawnRuntimeState());
  const elapsedSecondsRef = useRef(0);
  const lastStatusSyncRef = useRef(0);

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [timeStep, setTimeStep] = useState(1);
  const [showLaneLabels, setShowLaneLabels] = useState(true);
  const [showQueueOverlay, setShowQueueOverlay] = useState(true);
  const [showSignalStates, setShowSignalStates] = useState(true);
  
  const [queues, setQueues] = useState<Record<DirectionKey, number>>({
    northbound: 0,
    southbound: 0,
    eastbound: 0,
    westbound: 0,
  });

  const [vehiclesInNetwork, setVehiclesInNetwork] = useState(0);


  const geometry = scenario.geometry;
  const traffic = scenario.traffic;
  const signal = scenario.signal;

  const simulationConfig = useMemo(() => buildSimulationConfig(scenario), [scenario]);

  const cycleLength = simulationConfig.cycleLength;
  const approachConfigs = simulationConfig.approachConfigs;
  const rawPhases = ensurePhaseTimingCount(
    signal.phases,
    Math.max(signal.numberOfPhases, 1)
  );

  const phasesForDisplay =
    rawPhases.length > 0
      ? rawPhases.map((phase, index) => ({
          phaseNumber: phase.phaseNumber || index + 1,
          greenTime:
            typeof phase.greenTime === "number" && phase.greenTime > 0
              ? phase.greenTime
              : Math.max(10, Math.round(cycleLength / Math.max(signal.numberOfPhases, 1))),
          yellowAllRed:
            typeof phase.yellowAllRed === "number" && phase.yellowAllRed >= 0
              ? phase.yellowAllRed
              : 4,
          movementPermissions: phase.movementPermissions,
          movementSummary:
            phase.protectedMovements?.trim() ||
            formatPhaseMovementSummary(phase.movementPermissions),
        }))
      : Array.from({ length: Math.max(signal.numberOfPhases, 1) }, (_, index) => ({
          phaseNumber: index + 1,
          greenTime: Math.max(10, Math.round(cycleLength / Math.max(signal.numberOfPhases, 1))),
          yellowAllRed: 4,
          movementPermissions: rawPhases[index]?.movementPermissions,
          movementSummary: "No served movements selected",
        }));

  const phaseSegments = simulationConfig.phaseSegments;


  const activeSegmentInfoWithTiming = getSimulationActiveSignalSegment(
    elapsedSeconds,
    phaseSegments
  );

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + Math.max(1, timeStep);
        elapsedSecondsRef.current = next;
        return next;
      });
    }, 1000 / speed);

    return () => window.clearInterval(interval);
  }, [isRunning, speed, timeStep]);


  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);


  const activePhaseLabel = `Phase ${activeSegmentInfoWithTiming.phaseNumber}`;
  const activeSegmentDisplayLabel =
    activeSegmentInfoWithTiming.segmentType === "Green"
      ? "Green"
      : "Change & Clearance";
  const activeMovementSummary =
    activeSegmentInfoWithTiming.movementSummary || "No served movements selected";
  

  const lanePaths = useMemo(
    () => buildLanePaths(approachConfigs, 1600, 900),
    [approachConfigs]
  );

  const lanePathMap = useMemo(() => buildLanePathMap(lanePaths), [lanePaths]);

  const maxQueue = getMaxQueue(queues);
  const queueStatus = getQueueStatus(maxQueue);

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    vehiclesRef.current = seedVehicles(
      lanePaths,
      approachConfigs,
      vehicleSerialRef
    );
    setQueues(calculateApproachQueues(vehiclesRef.current, lanePathMap));
    setVehiclesInNetwork(getTotalVehiclesInNetwork(vehiclesRef.current));
    spawnRuntimeRef.current = createSpawnRuntimeState();
    lastStatusSyncRef.current = 0;
    elapsedSecondsRef.current = 0;

  };

  const approachCards = directionPairs.map(([directionKey, approachDirection]) => ({
    label: approachDirection,
    value: `${queues[directionKey]} veh`,
    composition: `${approachConfigs[directionKey].compositionLabel} • L${
      approachConfigs[directionKey].movementLaneCounts.left
    } T${approachConfigs[directionKey].movementLaneCounts.through} R${
      approachConfigs[directionKey].movementLaneCounts.right
    }`,
  }));

  useEffect(() => {
    vehiclesRef.current = seedVehicles(
      lanePaths,
      approachConfigs,
      vehicleSerialRef
    );
    setQueues(calculateApproachQueues(vehiclesRef.current, lanePathMap));
    setVehiclesInNetwork(getTotalVehiclesInNetwork(vehiclesRef.current));
    spawnRuntimeRef.current = createSpawnRuntimeState();
    
  }, [lanePaths, approachConfigs, lanePathMap]);



  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let lastTimestamp = 0;

    const animate = (timestamp: number) => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const dt = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const currentActiveSegment = getSimulationActiveSignalSegment(
        elapsedSecondsRef.current,
        phaseSegments
      );

      const currentMovementSignals = buildSimulationDirectionSignalMap(
        currentActiveSegment.movementPermissions,
        currentActiveSegment.segmentType
      );

      const currentActivePhaseLabel = `Phase ${currentActiveSegment.phaseNumber}`;
      const currentActiveSegmentDisplayLabel =
        currentActiveSegment.segmentType === "Green"
          ? "Green"
          : "Change & Clearance";


      if (isRunning) {
        const dtSeconds = (Math.min(Math.max(dt, 0), 50) / 1000) * speed * timeStep;

        spawnVehiclesForTick(
          vehiclesRef.current,
          lanePaths,
          approachConfigs,
          vehicleSerialRef,
          spawnRuntimeRef.current,
          dtSeconds
        );

        updateSimulationVehicles(
          vehiclesRef.current,
          lanePathMap,
          currentMovementSignals,
          dt,
          speed,
          timeStep
        );

      }

      const currentQueues = calculateApproachQueues(vehiclesRef.current, lanePathMap);
      const currentVehiclesInNetwork = getTotalVehiclesInNetwork(vehiclesRef.current);

      if (isRunning && timestamp - lastStatusSyncRef.current >= 200) {
        setQueues(currentQueues);
        setVehiclesInNetwork(currentVehiclesInNetwork);
        lastStatusSyncRef.current = timestamp;
      }




      renderSimulationCanvas({
        ctx,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        lanePaths,
        lanePathMap,
        vehicles: vehiclesRef.current,
        approachConfigs,
        queues: currentQueues,
        movementSignals: currentMovementSignals,
        activePhaseLabel: currentActivePhaseLabel,
        activeSegmentDisplayLabel: currentActiveSegmentDisplayLabel,
        activeSegment: currentActiveSegment,
        showLaneLabels,
        showQueueOverlay,
        showSignalStates,
      });

      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    isRunning,
    speed,
    timeStep,
    approachConfigs,
    phaseSegments,
    showLaneLabels,
    showQueueOverlay,
    showSignalStates,
    lanePaths,
    lanePathMap,
  ]);


  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Simulation</h1>
          <p className="text-slate-600 mt-1">
            Visualize intersection operation, signal changes, and queue behavior.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsRunning(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Start
          </button>
          <button
            onClick={() => setIsRunning(false)}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Pause
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-medium hover:bg-slate-100 transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-10 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Intersection Canvas</h2>
            <span className="text-sm text-slate-500">
              Scenario-driven simulation preview
            </span>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-6 flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Intersection</p>
                <p className="text-lg font-semibold mt-2">
                  {geometry.intersectionName || "Not set yet"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Control Type</p>
                <p className="text-lg font-semibold mt-2">{signal.controlType}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Configured Cycle Length</p>
                <p className="text-lg font-semibold mt-2">{cycleLength} s</p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
              <div className="text-center mb-5">
                <p className="text-lg font-medium text-slate-700">
                  Current Phase: {activePhaseLabel}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Segment Type: {activeSegmentDisplayLabel}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Remaining Time in Segment: {activeSegmentInfoWithTiming.remainingInSegment}s
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {showSignalStates
                    ? `Served Movements: ${activeMovementSummary}`
                    : "Signal state display hidden"}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {showQueueOverlay
                    ? `Queue overlay active • Max queue ${maxQueue} veh`
                    : "Queue overlay hidden"}
                </p>
              </div>

              <div className="w-full rounded-2xl border border-slate-200 overflow-hidden bg-emerald-50">
                <canvas
                  ref={canvasRef}
                  width={1600}
                  height={900}
                  className="w-full h-auto block"
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Phase Timeline Summary
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {phasesForDisplay.map((phase) => (
                  <div
                    key={phase.phaseNumber}
                    className={`rounded-xl border p-4 ${
                      phase.phaseNumber === activeSegmentInfoWithTiming.phaseNumber
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">Phase {phase.phaseNumber}</p>
                    <p className="text-sm text-slate-600 mt-2">
                      Green: {phase.greenTime}s
                    </p>
                    <p className="text-sm text-slate-600">
                      Yellow + All Red: {phase.yellowAllRed}s
                    </p>
                    <p className="text-sm text-slate-600 mt-2">
                      Served: {phase.movementSummary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {approachCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center"
                >
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="text-xl font-bold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-2">{card.composition}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="xl:col-span-2 space-y-4">
          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-4">Simulation Controls</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Speed
                </label>
                <select
                  value={`${speed}x`}
                  onChange={(e) => setSpeed(Number(e.target.value.replace("x", "")))}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>1x</option>
                  <option>2x</option>
                  <option>4x</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Time Step (s)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={timeStep}
                  onChange={(e) => setTimeStep(Number(e.target.value) || 1)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showLaneLabels}
                  onChange={(e) => setShowLaneLabels(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Lane Labels</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showQueueOverlay}
                  onChange={(e) => setShowQueueOverlay(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Queue Overlay</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showSignalStates}
                  onChange={(e) => setShowSignalStates(e.target.checked)}
                />
                <span className="text-sm text-slate-700">Show Signal States</span>
              </label>
            </div>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
            <h2 className="text-lg font-semibold mb-4">Live Status</h2>

            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Simulation Time</span>
                <span className="font-medium">{formatClock(elapsedSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="font-medium">{isRunning ? "Running" : "Paused"}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Phase</span>
                <span className="font-medium">{activePhaseLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>Signal State</span>
                <span className="font-medium">{activeSegmentDisplayLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Time</span>
                <span className="font-medium">
                  {activeSegmentInfoWithTiming.remainingInSegment}s
                </span>
              </div>
              <div className="flex justify-between">
                <span>Vehicles in Network</span>
                <span className="font-medium">{vehiclesInNetwork}</span>
              </div>
              <div className="flex justify-between">
                <span>Queue Status</span>
                <span className="font-medium">{queueStatus}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
          <h2 className="text-lg font-semibold mb-4">Approach Queue Snapshot</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {approachCards.map((dir) => (
              <div
                key={dir.label}
                className="rounded-xl border border-slate-300 bg-white p-4"
              >
                <p className="text-sm text-slate-500">{dir.label}</p>
                <p className="text-xl font-bold mt-2">{dir.value}</p>
                <p className="text-xs text-slate-500 mt-2">{dir.composition}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
          <h2 className="text-lg font-semibold mb-4">Simulation Notes</h2>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 space-y-2">
            <p>• Vehicles are now drawn directly on the HTML canvas.</p>
            <p>• Vehicles stop at stop lines on red/yellow and move on green.</p>
            <p>• Vehicle rectangles are lane-based and scalable for higher counts later.</p>
            <p>• Left, through, and right vehicles now follow different canvas paths.</p>
            <p>• Active approach for editing: {traffic.approachDirection}.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
