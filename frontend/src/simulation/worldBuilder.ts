import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_DIVIDER_PADDING_PX,
  CROSSWALK_SETBACK_PX,
  CROSSWALK_STRIPE_LENGTH_PX,
  EXIT_REACH,
  LANE_SPACING,
  OUTER_MARGIN,
  ROAD_EDGE_PADDING_PX,
  STOP_BAR_TO_CROSSWALK_GAP_PX,
  STOP_LINE_PROGRESS,
} from "./constants";

import type {
  ApproachSimulationMap,
  DirectionKey,
  LanePath,
  MovementDemand,
  MovementType,
  Point,
} from "./types";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPolylineLength(points: Point[]): number {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }

  return total;
}

export function getPointOnPath(path: LanePath, progress: number): Point {
  const t = clamp(progress, 0, 1);
  const targetDistance = path.lengthPx * t;
  let traveled = 0;

  for (let index = 1; index < path.points.length; index += 1) {
    const segmentStart = path.points[index - 1];
    const segmentEnd = path.points[index];
    const segmentLength = Math.hypot(
      segmentEnd.x - segmentStart.x,
      segmentEnd.y - segmentStart.y
    );

    if (segmentLength === 0) continue;

    if (traveled + segmentLength >= targetDistance) {
      const segmentT = (targetDistance - traveled) / segmentLength;

      return {
        x: lerp(segmentStart.x, segmentEnd.x, segmentT),
        y: lerp(segmentStart.y, segmentEnd.y, segmentT),
      };
    }

    traveled += segmentLength;
  }

  return path.points[path.points.length - 1];
}

export function getAngleOnPath(path: LanePath, progress: number): number {
  const sampleA = getPointOnPath(path, clamp(progress, 0, 1));
  const sampleB = getPointOnPath(path, clamp(progress + 0.018, 0, 1));  
  return Math.atan2(sampleB.y - sampleA.y, sampleB.x - sampleA.x);
}

export function getLaneMarkProgress(path: LanePath, offset: number): number {
  return clamp(path.stopLineProgress - offset, 0.1, 0.9);
}

function getLaneAxisPositions(
  direction: DirectionKey,
  totalPhysicalLanes: number,
  cx: number,
  cy: number
): number[] {
  if (totalPhysicalLanes <= 0) {
    return [];
  }

  return Array.from({ length: totalPhysicalLanes }, (_, index) => {
    const offsetFromMedian = CENTER_DIVIDER_PADDING_PX + index * LANE_SPACING;

    if (direction === "northbound") return cx - offsetFromMedian;
    if (direction === "southbound") return cx + offsetFromMedian;
    if (direction === "westbound") return cy + offsetFromMedian;
    return cy - offsetFromMedian;
  });
}

function buildLaneCenterMap(
  approachConfigs: ApproachSimulationMap,
  cx: number,
  cy: number
): Record<DirectionKey, number[]> {
  return {
    northbound: getLaneAxisPositions(
      "northbound",
      approachConfigs.northbound.totalPhysicalLanes,
      cx,
      cy
    ),
    southbound: getLaneAxisPositions(
      "southbound",
      approachConfigs.southbound.totalPhysicalLanes,
      cx,
      cy
    ),
    eastbound: getLaneAxisPositions(
      "eastbound",
      approachConfigs.eastbound.totalPhysicalLanes,
      cx,
      cy
    ),
    westbound: getLaneAxisPositions(
      "westbound",
      approachConfigs.westbound.totalPhysicalLanes,
      cx,
      cy
    ),
  };
}

function mirrorLaneCentersAcrossAxis(
  laneCenters: number[],
  axis: number
): number[] {
  return laneCenters.map((value) => axis * 2 - value);
}

function buildEffectiveLaneCenterMap(
  laneCentersByDirection: Record<DirectionKey, number[]>,
  cx: number,
  cy: number
): Record<DirectionKey, number[]> {
  return {
    northbound:
      laneCentersByDirection.northbound.length > 0
        ? laneCentersByDirection.northbound
        : mirrorLaneCentersAcrossAxis(laneCentersByDirection.southbound, cx),
    southbound:
      laneCentersByDirection.southbound.length > 0
        ? laneCentersByDirection.southbound
        : mirrorLaneCentersAcrossAxis(laneCentersByDirection.northbound, cx),
    eastbound:
      laneCentersByDirection.eastbound.length > 0
        ? laneCentersByDirection.eastbound
        : mirrorLaneCentersAcrossAxis(laneCentersByDirection.westbound, cy),
    westbound:
      laneCentersByDirection.westbound.length > 0
        ? laneCentersByDirection.westbound
        : mirrorLaneCentersAcrossAxis(laneCentersByDirection.eastbound, cy),
  };
}


export function getJunctionFootprint(
  laneCentersByDirection: Record<DirectionKey, number[]>
): { leftX: number; rightX: number; topY: number; bottomY: number } {
  return {
    leftX:
      Math.min(
        ...laneCentersByDirection.northbound,
        ...laneCentersByDirection.southbound
      ) - ROAD_EDGE_PADDING_PX,
    rightX:
      Math.max(
        ...laneCentersByDirection.northbound,
        ...laneCentersByDirection.southbound
      ) + ROAD_EDGE_PADDING_PX,
    topY:
      Math.min(
        ...laneCentersByDirection.eastbound,
        ...laneCentersByDirection.westbound
      ) - ROAD_EDGE_PADDING_PX,
    bottomY:
      Math.max(
        ...laneCentersByDirection.eastbound,
        ...laneCentersByDirection.westbound
      ) + ROAD_EDGE_PADDING_PX,
  };
}


function getReceivingLaneCenter(
  laneCenters: number[],
  slotInMovement: number,
  movementLaneCount: number,
  targetSide: "inside" | "outside"
): number {
  if (laneCenters.length === 0) {
    return 0;
  }

  const availableLaneCount = laneCenters.length;
  const participatingLaneCount = Math.max(
    1,
    Math.min(movementLaneCount, availableLaneCount)
  );
  const clampedSlot = clamp(slotInMovement, 0, participatingLaneCount - 1);

  if (targetSide === "inside") {
    return laneCenters[clampedSlot];
  }

  const startIndex = availableLaneCount - participatingLaneCount;
  return laneCenters[startIndex + clampedSlot];
}


function sampleCubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments = 26
): Point[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const mt = 1 - t;

    return {
      x:
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x,
      y:
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y,
    };
  });
}

function sampleQuadraticBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  segments = 22
): Point[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const mt = 1 - t;

    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  });
}


function buildTurnPath(
  approachStart: Point,
  entryPoint: Point,
  controlPoint1: Point,
  controlPoint2: Point,
  exitPoint: Point,
  departureEnd: Point
): Point[] {
  const curvePoints = sampleCubicBezier(
    entryPoint,
    controlPoint1,
    controlPoint2,
    exitPoint
  );

  return [approachStart, ...curvePoints, departureEnd];
}

function buildRightTurnPath(
  approachStart: Point,
  curveStart: Point,
  controlPoint: Point,
  curveEnd: Point,
  departureEnd: Point
): Point[] {
  const curvePoints = sampleQuadraticBezier(
    curveStart,
    controlPoint,
    curveEnd
  );

  return [approachStart, ...curvePoints, departureEnd];
}



function createLanePath(
  laneId: string,
  physicalLaneKey: string,
  direction: DirectionKey,
  movement: MovementType,
  points: Point[],
  stopLineProgress: number
): LanePath {
  return {
    laneId,
    physicalLaneKey,
    direction,
    movement,
    points,
    stopLineProgress,
    lengthPx: getPolylineLength(points),
  };
}

function getStopBarSpec(
  direction: DirectionKey,
  junctionFootprint: { leftX: number; rightX: number; topY: number; bottomY: number }
): { axis: "x" | "y"; value: number } {
  if (direction === "northbound") {
    return {
      axis: "y",
      value:
        junctionFootprint.topY -
        CROSSWALK_SETBACK_PX -
        CROSSWALK_STRIPE_LENGTH_PX -
        STOP_BAR_TO_CROSSWALK_GAP_PX,
    };
  }

  if (direction === "southbound") {
    return {
      axis: "y",
      value:
        junctionFootprint.bottomY +
        CROSSWALK_SETBACK_PX +
        CROSSWALK_STRIPE_LENGTH_PX +
        STOP_BAR_TO_CROSSWALK_GAP_PX,
    };
  }

  if (direction === "westbound") {
    return {
      axis: "x",
      value:
        junctionFootprint.leftX -
        CROSSWALK_SETBACK_PX -
        CROSSWALK_STRIPE_LENGTH_PX -
        STOP_BAR_TO_CROSSWALK_GAP_PX,
    };
  }

  return {
    axis: "x",
    value:
      junctionFootprint.rightX +
      CROSSWALK_SETBACK_PX +
      CROSSWALK_STRIPE_LENGTH_PX +
      STOP_BAR_TO_CROSSWALK_GAP_PX,
  };
}



function getStopLineProgressForPath(
  direction: DirectionKey,
  points: Point[],
  laneCentersByDirection: Record<DirectionKey, number[]>
): number {
  const totalLength = getPolylineLength(points);

  if (totalLength <= 0) {
    return STOP_LINE_PROGRESS;
  }

  const junctionFootprint = getJunctionFootprint(laneCentersByDirection);
  const stopBar = getStopBarSpec(direction, junctionFootprint);
  let traveled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentStart = points[index - 1];
    const segmentEnd = points[index];
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const segmentLength = Math.hypot(dx, dy);

    if (segmentLength === 0) {
      continue;
    }

    const startValue = stopBar.axis === "x" ? segmentStart.x : segmentStart.y;
    const endValue = stopBar.axis === "x" ? segmentEnd.x : segmentEnd.y;
    const delta = endValue - startValue;

    if (delta !== 0) {
      const t = (stopBar.value - startValue) / delta;

      if (t >= 0 && t <= 1) {
        return clamp((traveled + segmentLength * t) / totalLength, 0.05, 0.95);
      }
    }

    traveled += segmentLength;
  }

  return STOP_LINE_PROGRESS;
}




function buildPathPoints(
  direction: DirectionKey,
  movement: MovementType,
  axisOffset: number,
  slotInMovement: number,
  movementLaneCount: number,
  laneCentersByDirection: Record<DirectionKey, number[]>,
  canvasWidth: number,
  canvasHeight: number,
): Point[] {
  const junctionFootprint = getJunctionFootprint(laneCentersByDirection);
  const boxLeft = junctionFootprint.leftX;
  const boxRight = junctionFootprint.rightX;
  const boxTop = junctionFootprint.topY;
  const boxBottom = junctionFootprint.bottomY;

  const northExitInsideX = getReceivingLaneCenter(
    laneCentersByDirection.southbound,
    slotInMovement,
    movementLaneCount,
    "inside"
  );
  const northExitOutsideX = getReceivingLaneCenter(
    laneCentersByDirection.southbound,
    slotInMovement,
    movementLaneCount,
    "outside"
  );

  const southExitInsideX = getReceivingLaneCenter(
    laneCentersByDirection.northbound,
    slotInMovement,
    movementLaneCount,
    "inside"
  );
  const southExitOutsideX = getReceivingLaneCenter(
    laneCentersByDirection.northbound,
    slotInMovement,
    movementLaneCount,
    "outside"
  );

  const westExitInsideY = getReceivingLaneCenter(
    laneCentersByDirection.eastbound,
    slotInMovement,
    movementLaneCount,
    "inside"
  );
  const westExitOutsideY = getReceivingLaneCenter(
    laneCentersByDirection.eastbound,
    slotInMovement,
    movementLaneCount,
    "outside"
  );

  const eastExitInsideY = getReceivingLaneCenter(
    laneCentersByDirection.westbound,
    slotInMovement,
    movementLaneCount,
    "inside"
  );
  const eastExitOutsideY = getReceivingLaneCenter(
    laneCentersByDirection.westbound,
    slotInMovement,
    movementLaneCount,
    "outside"
  );


  const getHandleDistance = (delta: number): number =>
    Math.max(28, Math.abs(delta) * 0.55);

  const rightTurnCornerInset = Math.max(12, LANE_SPACING);




  if (direction === "northbound") {
    const approachStart = { x: axisOffset, y: -OUTER_MARGIN };

    if (movement === "left") {
      const entryPoint = { x: axisOffset, y: boxTop };
      const exitPoint = { x: boxRight, y: eastExitInsideY };
      const verticalHandle = getHandleDistance(exitPoint.y - entryPoint.y);
      const horizontalHandle = getHandleDistance(exitPoint.x - entryPoint.x);

      return buildTurnPath(
        approachStart,
        entryPoint,
        { x: entryPoint.x, y: entryPoint.y + verticalHandle },
        { x: exitPoint.x - horizontalHandle, y: exitPoint.y },
        exitPoint,
        { x: canvasWidth + EXIT_REACH, y: eastExitInsideY }
      );

    }

    if (movement === "right") {
      const curveStart = {
        x: axisOffset,
        y: boxTop + rightTurnCornerInset,
      };
      const curveEnd = {
        x: boxLeft - rightTurnCornerInset,
        y: westExitOutsideY,
      };

      return buildRightTurnPath(
        approachStart,
        curveStart,
        { x: curveStart.x, y: curveEnd.y },
        curveEnd,
        { x: -EXIT_REACH, y: westExitOutsideY }
      );
    }



    return [
      { x: axisOffset, y: -OUTER_MARGIN },
      { x: axisOffset, y: canvasHeight + OUTER_MARGIN },
    ];
  }

  if (direction === "southbound") {
    const approachStart = { x: axisOffset, y: canvasHeight + OUTER_MARGIN };

    if (movement === "left") {
      const entryPoint = { x: axisOffset, y: boxBottom };
      const exitPoint = { x: boxLeft, y: westExitInsideY };
      const verticalHandle = getHandleDistance(exitPoint.y - entryPoint.y);
      const horizontalHandle = getHandleDistance(exitPoint.x - entryPoint.x);

      return buildTurnPath(
        approachStart,
        entryPoint,
        { x: entryPoint.x, y: entryPoint.y - verticalHandle },
        { x: exitPoint.x + horizontalHandle, y: exitPoint.y },
        exitPoint,
        { x: -EXIT_REACH, y: westExitInsideY }
      );

    }

    if (movement === "right") {
      const curveStart = {
        x: axisOffset,
        y: boxBottom - rightTurnCornerInset,
      };
      const curveEnd = {
        x: boxRight + rightTurnCornerInset,
        y: eastExitOutsideY,
      };

      return buildRightTurnPath(
        approachStart,
        curveStart,
        { x: curveStart.x, y: curveEnd.y },
        curveEnd,
        { x: canvasWidth + EXIT_REACH, y: eastExitOutsideY }
      );
    }



    return [
      { x: axisOffset, y: canvasHeight + OUTER_MARGIN },
      { x: axisOffset, y: -OUTER_MARGIN },
    ];
  }

  if (direction === "westbound") {
    const approachStart = { x: -OUTER_MARGIN, y: axisOffset };

    if (movement === "left") {
      const entryPoint = { x: boxLeft, y: axisOffset };
      const exitPoint = { x: northExitInsideX, y: boxTop };
      const horizontalHandle = getHandleDistance(exitPoint.x - entryPoint.x);
      const verticalHandle = getHandleDistance(exitPoint.y - entryPoint.y);

      return buildTurnPath(
        approachStart,
        entryPoint,
        { x: entryPoint.x + horizontalHandle, y: entryPoint.y },
        { x: exitPoint.x, y: exitPoint.y + verticalHandle },
        exitPoint,
        { x: northExitInsideX, y: -EXIT_REACH }
      );

    }

    if (movement === "right") {
      const curveStart = {
        x: boxLeft + rightTurnCornerInset,
        y: axisOffset,
      };
      const curveEnd = {
        x: southExitOutsideX,
        y: boxBottom + rightTurnCornerInset,
      };

      return buildRightTurnPath(
        approachStart,
        curveStart,
        { x: curveEnd.x, y: curveStart.y },
        curveEnd,
        { x: southExitOutsideX, y: canvasHeight + EXIT_REACH }
      );
    }



    return [
      { x: -OUTER_MARGIN, y: axisOffset },
      { x: canvasWidth + OUTER_MARGIN, y: axisOffset },
    ];
  }

  const approachStart = { x: canvasWidth + OUTER_MARGIN, y: axisOffset };

  if (movement === "left") {
    const entryPoint = { x: boxRight, y: axisOffset };
    const exitPoint = { x: southExitInsideX, y: boxBottom };
    const horizontalHandle = getHandleDistance(exitPoint.x - entryPoint.x);
    const verticalHandle = getHandleDistance(exitPoint.y - entryPoint.y);

    return buildTurnPath(
      approachStart,
      entryPoint,
      { x: entryPoint.x - horizontalHandle, y: entryPoint.y },
      { x: exitPoint.x, y: exitPoint.y - verticalHandle },
      exitPoint,
      { x: southExitInsideX, y: canvasHeight + EXIT_REACH }
    );

  }

  if (movement === "right") {
    const curveStart = {
      x: boxRight - rightTurnCornerInset,
      y: axisOffset,
    };
    const curveEnd = {
      x: northExitOutsideX,
      y: boxTop - rightTurnCornerInset,
    };

    return buildRightTurnPath(
      approachStart,
      curveStart,
      { x: curveEnd.x, y: curveStart.y },
      curveEnd,
      { x: northExitOutsideX, y: -EXIT_REACH }
    );
  }



  return [
    { x: canvasWidth + OUTER_MARGIN, y: axisOffset },
    { x: -OUTER_MARGIN, y: axisOffset },
  ];
}



export function buildLanePaths(
  approachConfigs: ApproachSimulationMap,
  canvasWidth = CANVAS_WIDTH,
  canvasHeight = CANVAS_HEIGHT
): LanePath[] {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const paths: LanePath[] = [];
  const laneCentersByDirection = buildLaneCenterMap(approachConfigs, cx, cy);
  const effectiveLaneCentersByDirection = buildEffectiveLaneCenterMap(
    laneCentersByDirection,
    cx,
    cy
  );



  for (const directionKey of Object.keys(approachConfigs) as DirectionKey[]) {
    const approachConfig = approachConfigs[directionKey];
    const laneAxisPositions = laneCentersByDirection[directionKey];
    if (
      approachConfig.totalPhysicalLanes <= 0 ||
      approachConfig.laneGroupSlots.length === 0
    ) {
      continue;
    }

    const movementSlotCounters: MovementDemand = {
      left: 0,
      through: 0,
      right: 0,
    };

    let physicalLaneIndex = 0;

    approachConfig.laneGroupSlots.forEach((slot) => {
      for (let laneIndex = 0; laneIndex < slot.laneCount; laneIndex += 1) {
        const axisOffset =
          laneAxisPositions[physicalLaneIndex] ??
          laneAxisPositions[laneAxisPositions.length - 1];
        const physicalLaneKey = `${directionKey}_${slot.slotKey}_${laneIndex}`;

        slot.servedMovements.forEach((movement) => {
          const slotInMovement = movementSlotCounters[movement];
          movementSlotCounters[movement] += 1;

          const points = buildPathPoints(
            directionKey,
            movement,
            axisOffset,
            slotInMovement,
            Math.max(1, approachConfig.movementLaneCounts[movement]),
            effectiveLaneCentersByDirection,
            canvasWidth,
            canvasHeight
          );


          const stopLineProgress = getStopLineProgressForPath(
            directionKey,
            points,
            effectiveLaneCentersByDirection
          );


          paths.push(
            createLanePath(
              `${physicalLaneKey}_${movement}`,
              physicalLaneKey,
              directionKey,
              movement,
              points,
              stopLineProgress
            )
          );

        });

        physicalLaneIndex += 1;
      }
    });
  }

  return paths;
}

export function buildLanePathMap(lanePaths: LanePath[]): Record<string, LanePath> {
  return Object.fromEntries(lanePaths.map((path) => [path.laneId, path]));
}
