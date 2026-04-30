import {
  CENTER_DIVIDER_PADDING_PX,
  CROSSWALK_SETBACK_PX,
  CROSSWALK_STRIPE_LENGTH_PX,
  LANE_SPACING,
  ROAD_EDGE_PADDING_PX,
  STOP_BAR_TO_CROSSWALK_GAP_PX,
} from "./constants";

import { getDirectionSignalState } from "./signalEngine";
import {
  getAngleOnPath,
  getJunctionFootprint,
  getPointOnPath,
} from "./worldBuilder";

import type {
  ActiveSignalSegment,
  ApproachSimulationMap,
  DirectionKey,
  DirectionSignalMap,
  LanePath,
  MovementType,
  QueueSnapshot,
  SignalDisplayState,
  Vehicle,
} from "./types";

type RenderOptions = {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  lanePaths: LanePath[];
  lanePathMap: Record<string, LanePath>;
  vehicles: Vehicle[];
  approachConfigs: ApproachSimulationMap;
  queues: QueueSnapshot;
  movementSignals: DirectionSignalMap;
  activePhaseLabel: string;
  activeSegmentDisplayLabel: string;
  activeSegment: ActiveSignalSegment;
  showLaneLabels: boolean;
  showQueueOverlay: boolean;
  showSignalStates: boolean;
};

function drawSignalHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: SignalDisplayState,
  label: string,
): void {
  const housingWidth = 24;
  const housingHeight = 48;
  const lampRadius = 4.5;
  const lampSpacing = 11;
  const postLength = 14;


  ctx.save();

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(
    x - housingWidth / 2,
    y - housingHeight / 2,
    housingWidth,
    housingHeight
  );

  ctx.strokeStyle = "rgba(71, 85, 105, 0.85)";
  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.moveTo(x, y + housingHeight / 2);
  ctx.lineTo(x, y + housingHeight / 2 + postLength);


  ctx.stroke();

  const colors = {
    red: "#ef4444",
    yellow: "#facc15",
    green: "#22c55e",
  };

  const topColor = state === "red" ? colors.red : "rgba(51, 65, 85, 0.75)";
  const midColor = state === "yellow" ? colors.yellow : "rgba(51, 65, 85, 0.75)";
  const botColor = state === "green" ? colors.green : "rgba(51, 65, 85, 0.75)";


  ctx.beginPath();
  ctx.fillStyle = topColor;
  ctx.arc(x, y - lampSpacing, lampRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = midColor;
  ctx.arc(x, y, lampRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = botColor;
  ctx.arc(x, y + lampSpacing, lampRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";

  ctx.fillText(label, x, y + housingHeight / 2 + postLength + 11);
  ctx.restore();
}



function drawVehicle(
  ctx: CanvasRenderingContext2D,
  vehicle: Vehicle,
  path: LanePath
): void {
  const point = getPointOnPath(path, vehicle.progress);
  const angle = getAngleOnPath(path, vehicle.progress);

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);

  ctx.fillStyle = vehicle.color;
  ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(vehicle.length / 6, -vehicle.width / 2 + 1.5, 4, vehicle.width - 3);

  ctx.restore();
}


const CENTERLINE_YELLOW_OFFSET = 4;

const LANE_ARROW_MARKING_OFFSET_PX = 66;
const APPROACH_CHANNELIZATION_LENGTH_PX = 84;
const CROSSWALK_STRIPE_THICKNESS_PX = 5;
const CROSSWALK_STRIPE_GAP_PX = 4;
const CROSSWALK_EDGE_INSET_PX = 6;


type RoadGeometry = {
  activeApproaches: Record<DirectionKey, boolean>;
  laneCenters: Record<DirectionKey, number[]>;
  effectiveLaneCenters: Record<DirectionKey, number[]>;
  northbound: {
    leftX: number;
    rightX: number;
  };
  southbound: {
    leftX: number;
    rightX: number;
  };
  eastbound: {
    topY: number;
    bottomY: number;
  };
  westbound: {
    topY: number;
    bottomY: number;
  };
  junction: {
    leftX: number;
    rightX: number;
    topY: number;
    bottomY: number;
  };
};




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
    if (direction === "eastbound") return cy - offsetFromMedian;
    return cy + offsetFromMedian;
  });
}

function mirrorLaneCentersAcrossAxis(
  laneCenters: number[],
  axis: number
): number[] {
  return laneCenters.map((value) => axis * 2 - value);
}


function getHorizontalBounds(
  laneCenters: number[],
  fallbackLeftX: number,
  fallbackRightX: number
): { leftX: number; rightX: number } {
  if (laneCenters.length === 0) {
    return {
      leftX: fallbackLeftX,
      rightX: fallbackRightX,
    };
  }

  return {
    leftX: Math.min(...laneCenters) - ROAD_EDGE_PADDING_PX,
    rightX: Math.max(...laneCenters) + ROAD_EDGE_PADDING_PX,
  };
}

function getVerticalBounds(
  laneCenters: number[],
  fallbackTopY: number,
  fallbackBottomY: number
): { topY: number; bottomY: number } {
  if (laneCenters.length === 0) {
    return {
      topY: fallbackTopY,
      bottomY: fallbackBottomY,
    };
  }

  return {
    topY: Math.min(...laneCenters) - ROAD_EDGE_PADDING_PX,
    bottomY: Math.max(...laneCenters) + ROAD_EDGE_PADDING_PX,
  };
}





function expandLaneUseByPhysicalLane(
  approachConfig: ApproachSimulationMap[DirectionKey]
): MovementType[][] {
  const laneUses: MovementType[][] = [];

  approachConfig.laneGroupSlots.forEach((slot) => {
    for (let laneIndex = 0; laneIndex < slot.laneCount; laneIndex += 1) {
      laneUses.push([...slot.servedMovements]);
    }
  });

  return laneUses;
}

function getRoadGeometry(
  approachConfigs: ApproachSimulationMap,
  cx: number,
  cy: number
): RoadGeometry {
  const activeApproaches: Record<DirectionKey, boolean> = {
    northbound:
      approachConfigs.northbound.totalPhysicalLanes > 0 &&
      approachConfigs.northbound.laneGroupSlots.length > 0,
    southbound:
      approachConfigs.southbound.totalPhysicalLanes > 0 &&
      approachConfigs.southbound.laneGroupSlots.length > 0,
    eastbound:
      approachConfigs.eastbound.totalPhysicalLanes > 0 &&
      approachConfigs.eastbound.laneGroupSlots.length > 0,
    westbound:
      approachConfigs.westbound.totalPhysicalLanes > 0 &&
      approachConfigs.westbound.laneGroupSlots.length > 0,
  };

  const laneCenters: Record<DirectionKey, number[]> = {
    northbound: activeApproaches.northbound
      ? getLaneAxisPositions(
          "northbound",
          approachConfigs.northbound.totalPhysicalLanes,
          cx,
          cy
        )
      : [],
    southbound: activeApproaches.southbound
      ? getLaneAxisPositions(
          "southbound",
          approachConfigs.southbound.totalPhysicalLanes,
          cx,
          cy
        )
      : [],
    eastbound: activeApproaches.eastbound
      ? getLaneAxisPositions(
          "eastbound",
          approachConfigs.eastbound.totalPhysicalLanes,
          cx,
          cy
        )
      : [],
    westbound: activeApproaches.westbound
      ? getLaneAxisPositions(
          "westbound",
          approachConfigs.westbound.totalPhysicalLanes,
          cx,
          cy
        )
      : [],
  };

  const effectiveLaneCenters: Record<DirectionKey, number[]> = {
    northbound:
      laneCenters.northbound.length > 0
        ? laneCenters.northbound
        : mirrorLaneCentersAcrossAxis(laneCenters.southbound, cx),
    southbound:
      laneCenters.southbound.length > 0
        ? laneCenters.southbound
        : mirrorLaneCentersAcrossAxis(laneCenters.northbound, cx),
    eastbound:
      laneCenters.eastbound.length > 0
        ? laneCenters.eastbound
        : mirrorLaneCentersAcrossAxis(laneCenters.westbound, cy),
    westbound:
      laneCenters.westbound.length > 0
        ? laneCenters.westbound
        : mirrorLaneCentersAcrossAxis(laneCenters.eastbound, cy),
  };

  const junction = getJunctionFootprint(effectiveLaneCenters);

  return {
    activeApproaches,
    laneCenters,
    effectiveLaneCenters,
    northbound: getHorizontalBounds(
      effectiveLaneCenters.northbound,
      junction.leftX,
      junction.rightX
    ),
    southbound: getHorizontalBounds(
      effectiveLaneCenters.southbound,
      junction.leftX,
      junction.rightX
    ),
    eastbound: getVerticalBounds(
      effectiveLaneCenters.eastbound,
      junction.topY,
      junction.bottomY
    ),
    westbound: getVerticalBounds(
      effectiveLaneCenters.westbound,
      junction.topY,
      junction.bottomY
    ),
    junction,
  };
}





function getCarriagewayInnerEdges(
  cx: number,
  cy: number
): {
  northboundInnerRightX: number;
  southboundInnerLeftX: number;
  eastboundInnerBottomY: number;
  westboundInnerTopY: number;
} {
  const stopBarGapFromYellowPx = 0;

  return {
    northboundInnerRightX: cx - CENTERLINE_YELLOW_OFFSET - stopBarGapFromYellowPx,
    southboundInnerLeftX: cx + CENTERLINE_YELLOW_OFFSET + stopBarGapFromYellowPx,
    eastboundInnerBottomY: cy - CENTERLINE_YELLOW_OFFSET - stopBarGapFromYellowPx,
    westboundInnerTopY: cy + CENTERLINE_YELLOW_OFFSET + stopBarGapFromYellowPx,
  };
}



function drawStopBar(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}



function getLocalLaneSeparatorPositions(laneCenters: number[]): number[] {
  const sortedCenters = [...laneCenters].sort((a, b) => a - b);
  const separators: number[] = [];

  for (let index = 1; index < sortedCenters.length; index += 1) {
    separators.push((sortedCenters[index - 1] + sortedCenters[index]) / 2);
  }

  return separators;
}


function drawLaneSeparators(
  ctx: CanvasRenderingContext2D,
  roadGeometry: RoadGeometry,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;
  const { activeApproaches, laneCenters, effectiveLaneCenters } = roadGeometry;

  const northboundStopBarY =
    topY -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const southboundStopBarY =
    bottomY +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const westboundStopBarX =
    leftX -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const eastboundStopBarX =
    rightX +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const northApproachSeparators = getLocalLaneSeparatorPositions(
    laneCenters.northbound
  );
  const northDepartureSeparators = getLocalLaneSeparatorPositions(
    effectiveLaneCenters.southbound
  );

  const southApproachSeparators = getLocalLaneSeparatorPositions(
    laneCenters.southbound
  );
  const southDepartureSeparators = getLocalLaneSeparatorPositions(
    effectiveLaneCenters.northbound
  );

  const westApproachSeparators = getLocalLaneSeparatorPositions(
    laneCenters.westbound
  );
  const westDepartureSeparators = getLocalLaneSeparatorPositions(
    effectiveLaneCenters.eastbound
  );

  const eastApproachSeparators = getLocalLaneSeparatorPositions(
    laneCenters.eastbound
  );
  const eastDepartureSeparators = getLocalLaneSeparatorPositions(
    effectiveLaneCenters.westbound
  );

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 10]);

  if (activeApproaches.northbound) {
    for (const x of northApproachSeparators) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, northboundStopBarY - APPROACH_CHANNELIZATION_LENGTH_PX);
      ctx.stroke();
    }
  }

  if (activeApproaches.northbound) {
    for (const x of northDepartureSeparators) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, northboundStopBarY);
      ctx.stroke();
    }
  }


  if (activeApproaches.southbound) {
    for (const x of southDepartureSeparators) {
      ctx.beginPath();
      ctx.moveTo(x, southboundStopBarY);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
  }


  if (activeApproaches.southbound) {
    for (const x of southApproachSeparators) {
      ctx.beginPath();
      ctx.moveTo(x, southboundStopBarY + APPROACH_CHANNELIZATION_LENGTH_PX);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
  }

  if (activeApproaches.westbound) {
    for (const y of westApproachSeparators) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(westboundStopBarX - APPROACH_CHANNELIZATION_LENGTH_PX, y);
      ctx.stroke();
    }
  }

  if (activeApproaches.westbound) {
    for (const y of westDepartureSeparators) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(westboundStopBarX, y);
      ctx.stroke();
    }
  }


  if (activeApproaches.eastbound) {
    for (const y of eastDepartureSeparators) {
      ctx.beginPath();
      ctx.moveTo(eastboundStopBarX, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }


  if (activeApproaches.eastbound) {
    for (const y of eastApproachSeparators) {
      ctx.beginPath();
      ctx.moveTo(eastboundStopBarX + APPROACH_CHANNELIZATION_LENGTH_PX, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawInboundApproachChannelizationLines(
  ctx: CanvasRenderingContext2D,
  roadGeometry: RoadGeometry
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;

  const northboundStopBarY =
    topY -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const southboundStopBarY =
    bottomY +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const westboundStopBarX =
    leftX -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const eastboundStopBarX =
    rightX +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  for (const x of getLocalLaneSeparatorPositions(roadGeometry.laneCenters.northbound)) {
    ctx.beginPath();
    ctx.moveTo(x, northboundStopBarY - APPROACH_CHANNELIZATION_LENGTH_PX);
    ctx.lineTo(x, northboundStopBarY);
    ctx.stroke();
  }

  for (const x of getLocalLaneSeparatorPositions(roadGeometry.laneCenters.southbound)) {
    ctx.beginPath();
    ctx.moveTo(x, southboundStopBarY);
    ctx.lineTo(x, southboundStopBarY + APPROACH_CHANNELIZATION_LENGTH_PX);
    ctx.stroke();
  }

  for (const y of getLocalLaneSeparatorPositions(roadGeometry.laneCenters.westbound)) {
    ctx.beginPath();
    ctx.moveTo(westboundStopBarX - APPROACH_CHANNELIZATION_LENGTH_PX, y);
    ctx.lineTo(westboundStopBarX, y);
    ctx.stroke();
  }

  for (const y of getLocalLaneSeparatorPositions(roadGeometry.laneCenters.eastbound)) {
    ctx.beginPath();
    ctx.moveTo(eastboundStopBarX, y);
    ctx.lineTo(eastboundStopBarX + APPROACH_CHANNELIZATION_LENGTH_PX, y);
    ctx.stroke();
  }

  ctx.restore();
}





function drawRoadEdgeLines(
  ctx: CanvasRenderingContext2D,
  roadGeometry: RoadGeometry,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;
  const { activeApproaches } = roadGeometry;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2.5;

  ctx.beginPath();

  if (activeApproaches.northbound) {
    ctx.moveTo(leftX, 0);
    ctx.lineTo(leftX, topY);
    ctx.moveTo(rightX, 0);
    ctx.lineTo(rightX, topY);
  }

  if (activeApproaches.southbound) {
    ctx.moveTo(leftX, bottomY);
    ctx.lineTo(leftX, canvasHeight);
    ctx.moveTo(rightX, bottomY);
    ctx.lineTo(rightX, canvasHeight);
  }

  if (activeApproaches.westbound) {
    ctx.moveTo(0, topY);
    ctx.lineTo(leftX, topY);
    ctx.moveTo(0, bottomY);
    ctx.lineTo(leftX, bottomY);
  }

  if (activeApproaches.eastbound) {
    ctx.moveTo(rightX, topY);
    ctx.lineTo(canvasWidth, topY);
    ctx.moveTo(rightX, bottomY);
    ctx.lineTo(canvasWidth, bottomY);
  }

  ctx.stroke();
  ctx.restore();
}





function drawRoadCenterlines(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  canvasWidth: number,
  canvasHeight: number,
  roadGeometry: RoadGeometry
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;
  const { activeApproaches } = roadGeometry;

  const northboundStopBarY =
    topY -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const southboundStopBarY =
    bottomY +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const westboundStopBarX =
    leftX -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const eastboundStopBarX =
    rightX +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  ctx.save();
  ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
  ctx.lineWidth = 2;

  ctx.beginPath();

  if (activeApproaches.northbound) {
    ctx.moveTo(cx - CENTERLINE_YELLOW_OFFSET, 0);
    ctx.lineTo(cx - CENTERLINE_YELLOW_OFFSET, northboundStopBarY);
    ctx.moveTo(cx + CENTERLINE_YELLOW_OFFSET, 0);
    ctx.lineTo(cx + CENTERLINE_YELLOW_OFFSET, northboundStopBarY);
  }

  if (activeApproaches.southbound) {
    ctx.moveTo(cx - CENTERLINE_YELLOW_OFFSET, southboundStopBarY);
    ctx.lineTo(cx - CENTERLINE_YELLOW_OFFSET, canvasHeight);
    ctx.moveTo(cx + CENTERLINE_YELLOW_OFFSET, southboundStopBarY);
    ctx.lineTo(cx + CENTERLINE_YELLOW_OFFSET, canvasHeight);
  }

  if (activeApproaches.westbound) {
    ctx.moveTo(0, cy - CENTERLINE_YELLOW_OFFSET);
    ctx.lineTo(westboundStopBarX, cy - CENTERLINE_YELLOW_OFFSET);
    ctx.moveTo(0, cy + CENTERLINE_YELLOW_OFFSET);
    ctx.lineTo(westboundStopBarX, cy + CENTERLINE_YELLOW_OFFSET);
  }

  if (activeApproaches.eastbound) {
    ctx.moveTo(eastboundStopBarX, cy - CENTERLINE_YELLOW_OFFSET);
    ctx.lineTo(canvasWidth, cy - CENTERLINE_YELLOW_OFFSET);
    ctx.moveTo(eastboundStopBarX, cy + CENTERLINE_YELLOW_OFFSET);
    ctx.lineTo(canvasWidth, cy + CENTERLINE_YELLOW_OFFSET);
  }

  ctx.stroke();
  ctx.restore();
}




function drawJunctionSurface(
  ctx: CanvasRenderingContext2D,
  roadGeometry: RoadGeometry
): void {
  const {
    leftX,
    rightX,
    topY,
    bottomY,
  } = roadGeometry.junction;

  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY);
  ctx.restore();
}


function drawCrosswalkAcrossVerticalRoad(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  rightX: number,
  y: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";

  for (
    let x = leftX + CROSSWALK_EDGE_INSET_PX;
    x <= rightX - CROSSWALK_STRIPE_THICKNESS_PX - CROSSWALK_EDGE_INSET_PX;
    x += CROSSWALK_STRIPE_THICKNESS_PX + CROSSWALK_STRIPE_GAP_PX
  ) {
    ctx.fillRect(x, y, CROSSWALK_STRIPE_THICKNESS_PX, CROSSWALK_STRIPE_LENGTH_PX);
  }

  ctx.restore();
}


function drawCrosswalkAcrossHorizontalRoad(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  bottomY: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";

  for (
    let y = topY + CROSSWALK_EDGE_INSET_PX;
    y <= bottomY - CROSSWALK_STRIPE_THICKNESS_PX - CROSSWALK_EDGE_INSET_PX;
    y += CROSSWALK_STRIPE_THICKNESS_PX + CROSSWALK_STRIPE_GAP_PX
  ) {
    ctx.fillRect(x, y, CROSSWALK_STRIPE_LENGTH_PX, CROSSWALK_STRIPE_THICKNESS_PX);
  }

  ctx.restore();
}



function drawIntersectionCrosswalks(
  ctx: CanvasRenderingContext2D,
  roadGeometry: RoadGeometry
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;
  const { activeApproaches } = roadGeometry;

  if (activeApproaches.northbound) {
    drawCrosswalkAcrossVerticalRoad(
      ctx,
      leftX,
      rightX,
      topY - CROSSWALK_SETBACK_PX - CROSSWALK_STRIPE_LENGTH_PX
    );
  }

  if (activeApproaches.southbound) {
    drawCrosswalkAcrossVerticalRoad(
      ctx,
      leftX,
      rightX,
      bottomY + CROSSWALK_SETBACK_PX
    );
  }

  if (activeApproaches.westbound) {
    drawCrosswalkAcrossHorizontalRoad(
      ctx,
      leftX - CROSSWALK_SETBACK_PX - CROSSWALK_STRIPE_LENGTH_PX,
      topY,
      bottomY
    );
  }

  if (activeApproaches.eastbound) {
    drawCrosswalkAcrossHorizontalRoad(
      ctx,
      rightX + CROSSWALK_SETBACK_PX,
      topY,
      bottomY
    );
  }
}


function drawLaneUseArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  servedMovements: MovementType[]
): void {
  const hasLeft = servedMovements.includes("left");
  const hasThrough = servedMovements.includes("through");
  const hasRight = servedMovements.includes("right");

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(0, 2);

  if (hasThrough) {
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -13);
    ctx.moveTo(0, -13);
    ctx.lineTo(-4.5, -7.5);
    ctx.moveTo(0, -13);
    ctx.lineTo(4.5, -7.5);
  }

  if (hasLeft) {
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -2);
    ctx.quadraticCurveTo(0, -9, -8, -9);
    ctx.lineTo(-13, -9);
    ctx.moveTo(-13, -9);
    ctx.lineTo(-8.5, -13);
    ctx.moveTo(-13, -9);
    ctx.lineTo(-8.5, -4);
  }

  if (hasRight) {
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -2);
    ctx.quadraticCurveTo(0, -9, 8, -9);
    ctx.lineTo(13, -9);
    ctx.moveTo(13, -9);
    ctx.lineTo(8.5, -13);
    ctx.moveTo(13, -9);
    ctx.lineTo(8.5, -4);
  }

  ctx.stroke();
  ctx.restore();
}



function drawApproachLaneUseArrows(
  ctx: CanvasRenderingContext2D,
  approachConfigs: ApproachSimulationMap,
  roadGeometry: RoadGeometry
): void {
  const { topY, bottomY, leftX, rightX } = roadGeometry.junction;

  const drawForDirection = (
    direction: DirectionKey,
    angle: number,
    positions: { x: number; y: number }[]
  ) => {
    const laneUses = expandLaneUseByPhysicalLane(approachConfigs[direction]);

    laneUses.forEach((servedMovements, index) => {
      const position = positions[index];

      if (!position) {
        return;
      }

      drawLaneUseArrow(ctx, position.x, position.y, angle, servedMovements);
    });
  };

  drawForDirection(
    "northbound",
    Math.PI,
    roadGeometry.laneCenters.northbound.map((x) => ({
      x,
      y: topY - LANE_ARROW_MARKING_OFFSET_PX,
    }))
  );

  drawForDirection(
    "southbound",
    0,
    roadGeometry.laneCenters.southbound.map((x) => ({
      x,
      y: bottomY + LANE_ARROW_MARKING_OFFSET_PX,
    }))
  );

  drawForDirection(
    "eastbound",
    -Math.PI / 2,
    roadGeometry.laneCenters.eastbound.map((y) => ({
      x: rightX + LANE_ARROW_MARKING_OFFSET_PX,
      y,
    }))
  );

  drawForDirection(
    "westbound",
    Math.PI / 2,
    roadGeometry.laneCenters.westbound.map((y) => ({
      x: leftX - LANE_ARROW_MARKING_OFFSET_PX,
      y,
    }))
  );
}


function drawApproachBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  primaryText: string,
  secondaryText?: string
): void {
  const width = 110;
  const height = secondaryText ? 38 : 22;

  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "rgba(148,163,184,0.55)";
  ctx.lineWidth = 1;
  ctx.fillRect(x - width / 2, y - height / 2, width, height);
  ctx.strokeRect(x - width / 2, y - height / 2, width, height);

  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";

  if (secondaryText) {
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(primaryText, x, y - 5);
    ctx.font = "10px sans-serif";
    ctx.fillText(secondaryText, x, y + 11);
  } else {
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(primaryText, x, y + 4);
  }

  ctx.restore();
}

function drawPhaseBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  activePhaseLabel: string,
  activeSegmentDisplayLabel: string
): void {
  const badgeWidth = 120;
  const badgeHeight = 58;

  ctx.save();

  ctx.fillStyle = "rgba(30, 41, 59, 0.68)";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.fillRect(cx - badgeWidth / 2, cy - badgeHeight / 2, badgeWidth, badgeHeight);
  ctx.strokeRect(cx - badgeWidth / 2, cy - badgeHeight / 2, badgeWidth, badgeHeight);

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";

  ctx.font = "bold 18px sans-serif";
  ctx.fillText(activePhaseLabel, cx, cy - 4);

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(activeSegmentDisplayLabel, cx, cy + 18);

  ctx.restore();
}


export function renderSimulationCanvas({
  ctx,
  canvasWidth,
  canvasHeight,
  lanePaths,
  lanePathMap,
  vehicles,
  approachConfigs,
  queues,
  movementSignals,
  activePhaseLabel,
  activeSegmentDisplayLabel,
  activeSegment,
  showLaneLabels,
  showQueueOverlay,
  showSignalStates,
}: RenderOptions): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#dff3ea";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const roadGeometry = getRoadGeometry(approachConfigs, cx, cy);
  const carriagewayInnerEdges = getCarriagewayInnerEdges(cx, cy);
  const northboundStopBarY =
    roadGeometry.junction.topY -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const southboundStopBarY =
    roadGeometry.junction.bottomY +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const westboundStopBarX =
    roadGeometry.junction.leftX -
    CROSSWALK_SETBACK_PX -
    CROSSWALK_STRIPE_LENGTH_PX -
    STOP_BAR_TO_CROSSWALK_GAP_PX;

  const eastboundStopBarX =
    roadGeometry.junction.rightX +
    CROSSWALK_SETBACK_PX +
    CROSSWALK_STRIPE_LENGTH_PX +
    STOP_BAR_TO_CROSSWALK_GAP_PX;



  ctx.fillStyle = "#334155";

  if (roadGeometry.activeApproaches.northbound) {
    ctx.fillRect(
      roadGeometry.junction.leftX,
      0,
      roadGeometry.junction.rightX - roadGeometry.junction.leftX,
      roadGeometry.junction.topY
    );
  }

  if (roadGeometry.activeApproaches.southbound) {
    ctx.fillRect(
      roadGeometry.junction.leftX,
      roadGeometry.junction.bottomY,
      roadGeometry.junction.rightX - roadGeometry.junction.leftX,
      canvasHeight - roadGeometry.junction.bottomY
    );
  }

  if (roadGeometry.activeApproaches.westbound) {
    ctx.fillRect(
      0,
      roadGeometry.junction.topY,
      roadGeometry.junction.leftX,
      roadGeometry.junction.bottomY - roadGeometry.junction.topY
    );
  }

  if (roadGeometry.activeApproaches.eastbound) {
    ctx.fillRect(
      roadGeometry.junction.rightX,
      roadGeometry.junction.topY,
      canvasWidth - roadGeometry.junction.rightX,
      roadGeometry.junction.bottomY - roadGeometry.junction.topY
    );
  }




  drawJunctionSurface(ctx, roadGeometry);

  drawLaneSeparators(
    ctx,
    roadGeometry,
    canvasWidth,
    canvasHeight
  );


  drawInboundApproachChannelizationLines(
    ctx,
    roadGeometry
  );



  drawRoadEdgeLines(
    ctx,
    roadGeometry,
    canvasWidth,
    canvasHeight
  );


  drawRoadCenterlines(
    ctx,
    cx,
    cy,
    canvasWidth,
    canvasHeight,
    roadGeometry
  );



  if (roadGeometry.activeApproaches.northbound) {
    drawStopBar(
      ctx,
      roadGeometry.northbound.leftX,
      northboundStopBarY,
      carriagewayInnerEdges.northboundInnerRightX,
      northboundStopBarY
    );
  }

  if (roadGeometry.activeApproaches.southbound) {
    drawStopBar(
      ctx,
      carriagewayInnerEdges.southboundInnerLeftX,
      southboundStopBarY,
      roadGeometry.southbound.rightX,
      southboundStopBarY
    );
  }

  if (roadGeometry.activeApproaches.westbound) {
    drawStopBar(
      ctx,
      westboundStopBarX,
      carriagewayInnerEdges.westboundInnerTopY,
      westboundStopBarX,
      roadGeometry.westbound.bottomY
    );
  }


  if (roadGeometry.activeApproaches.eastbound) {
    drawStopBar(
      ctx,
      eastboundStopBarX,
      roadGeometry.eastbound.topY,
      eastboundStopBarX,
      carriagewayInnerEdges.eastboundInnerBottomY
    );
  }





  drawIntersectionCrosswalks(ctx, roadGeometry);

  drawApproachLaneUseArrows(ctx, approachConfigs, roadGeometry);


  const signalCornerOffset = 60;

  const leftSignalX = roadGeometry.junction.leftX - signalCornerOffset;
  const rightSignalX = roadGeometry.junction.rightX + signalCornerOffset;
  const topSignalY = roadGeometry.junction.topY - signalCornerOffset;
  const bottomSignalY = roadGeometry.junction.bottomY + signalCornerOffset - 50;


  const northboundSignal = {
    x: leftSignalX,
    y: topSignalY,
  };

  const eastboundSignal = {
    x: rightSignalX,
    y: topSignalY,
  };

  const westboundSignal = {
    x: leftSignalX,
    y: bottomSignalY,
  };

  const southboundSignal = {
    x: rightSignalX,
    y: bottomSignalY,
  };

  if (showSignalStates) {
    if (roadGeometry.activeApproaches.northbound) {
      drawSignalHead(
        ctx,
        northboundSignal.x,
        northboundSignal.y,
        getDirectionSignalState(movementSignals.northbound),
        "NB",
      );
    }

    if (roadGeometry.activeApproaches.southbound) {
      drawSignalHead(
        ctx,
        southboundSignal.x,
        southboundSignal.y,
        getDirectionSignalState(movementSignals.southbound),
        "SB",
      );
    }

    if (roadGeometry.activeApproaches.eastbound) {
      drawSignalHead(
        ctx,
        eastboundSignal.x,
        eastboundSignal.y,
        getDirectionSignalState(movementSignals.eastbound),
        "EB",
      );
    }

    if (roadGeometry.activeApproaches.westbound) {
      drawSignalHead(
        ctx,
        westboundSignal.x,
        westboundSignal.y,
        getDirectionSignalState(movementSignals.westbound),
        "WB",
      );
    }
  }



  for (const vehicle of vehicles) {
    const path = lanePathMap[vehicle.laneId];

    if (!path) continue;
    drawVehicle(ctx, vehicle, path);
  }

  drawPhaseBadge(
    ctx,
    cx,
    cy,
    activePhaseLabel,
    activeSegmentDisplayLabel
  );


  if (showLaneLabels || showQueueOverlay) {
    const topBadgeY = 36;
    const bottomBadgeY = canvasHeight - 36;
    const leftBadgeX = 62;
    const rightBadgeX = canvasWidth - 62;
    const sideBadgeY = cy - 6;

    const badgeData = [
      {
        direction: "northbound" as const,
        x: cx,
        y: topBadgeY,
        shortLabel: "NB",
        laneText: `NB • L${approachConfigs.northbound.movementLaneCounts.left} T${approachConfigs.northbound.movementLaneCounts.through} R${approachConfigs.northbound.movementLaneCounts.right}`,
        queueText: `Q: ${queues.northbound}`,
      },
      {
        direction: "eastbound" as const,
        x: rightBadgeX,
        y: sideBadgeY,
        shortLabel: "EB",
        laneText: `EB • L${approachConfigs.eastbound.movementLaneCounts.left} T${approachConfigs.eastbound.movementLaneCounts.through} R${approachConfigs.eastbound.movementLaneCounts.right}`,
        queueText: `Q: ${queues.eastbound}`,
      },
      {
        direction: "westbound" as const,
        x: leftBadgeX,
        y: sideBadgeY,
        shortLabel: "WB",
        laneText: `WB • L${approachConfigs.westbound.movementLaneCounts.left} T${approachConfigs.westbound.movementLaneCounts.through} R${approachConfigs.westbound.movementLaneCounts.right}`,
        queueText: `Q: ${queues.westbound}`,
      },
      {
        direction: "southbound" as const,
        x: cx,
        y: bottomBadgeY,
        shortLabel: "SB",
        laneText: `SB • L${approachConfigs.southbound.movementLaneCounts.left} T${approachConfigs.southbound.movementLaneCounts.through} R${approachConfigs.southbound.movementLaneCounts.right}`,
        queueText: `Q: ${queues.southbound}`,
      },
    ].filter((badge) => roadGeometry.activeApproaches[badge.direction]);



    badgeData.forEach((badge) => {
      const primaryText = showLaneLabels ? badge.laneText : badge.shortLabel;
      const secondaryText = showQueueOverlay ? badge.queueText : undefined;

      drawApproachBadge(ctx, badge.x, badge.y, primaryText, secondaryText);
    });
  }


  void lanePaths;
  void activeSegment;
}
