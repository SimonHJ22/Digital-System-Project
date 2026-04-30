import type { DirectionPair, MovementType } from "./types";

export const DIRECTION_PAIRS: DirectionPair[] = [
  ["northbound", "Northbound"],
  ["southbound", "Southbound"],
  ["eastbound", "Eastbound"],
  ["westbound", "Westbound"],
];

export const MOVEMENT_KEYS: MovementType[] = ["left", "through", "right"];

export const DEFAULT_CYCLE_LENGTH = 90;

export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 900;

export const LANE_SPACING = 18;
export const CENTER_DIVIDER_PADDING_PX = LANE_SPACING + 8;
export const ROAD_EDGE_PADDING_PX = 15;
export const STOP_LINE_PROGRESS = 0.42;

export const CROSSWALK_SETBACK_PX = 12;
export const CROSSWALK_STRIPE_LENGTH_PX = 18;
export const STOP_BAR_TO_CROSSWALK_GAP_PX = 8;

export const OUTER_MARGIN = 220;
export const TURN_INSET = 92;
export const EXIT_REACH = 220;

export const ROAD_WIDTH = 180;
export const ROAD_HEIGHT = 180;
export const INTERSECTION_BOX_SIZE = 220;

export const DEFAULT_VEHICLE_WIDTH = 10;

export const VEHICLE_DIMENSIONS = {
  left: {
    desiredSpeed: 70,
    acceleration: 80,
    width: DEFAULT_VEHICLE_WIDTH,
    length: 22,
  },
  through: {
    desiredSpeed: 88,
    acceleration: 96,
    width: DEFAULT_VEHICLE_WIDTH,
    length: 20,
  },
  right: {
    desiredSpeed: 62,
    acceleration: 72,
    width: DEFAULT_VEHICLE_WIDTH,
    length: 18,
  },
} as const;


export const VEHICLE_COLORS = {
  left: "#f97316",
  through: "#38bdf8",
  right: "#8b5cf6",
} as const;

export const SAFE_GAP_PX = {
  left: 44,
  through: 38,
  right: 40,
} as const;


export const RESPAWN_GAP_PX = {
  left: 40,
  through: 32,
  right: 34,
} as const;

export const MAX_FRAME_DELTA_MS = 50;
