import type {
  ApproachDirection,
  LaneGroupKey,
  PhaseMovementPermissions,
  PhaseTiming,
} from "../types/traffic";

export const APPROACH_DIRECTIONS: ApproachDirection[] = [
  "Northbound",
  "Southbound",
  "Eastbound",
  "Westbound",
];

export const LANE_GROUP_KEYS: LaneGroupKey[] = ["left", "through", "right"];

function getApproachShortLabel(approach: ApproachDirection): string {
  if (approach === "Northbound") return "NB";
  if (approach === "Southbound") return "SB";
  if (approach === "Eastbound") return "EB";
  return "WB";
}

function getMovementShortLabel(movement: LaneGroupKey): string {
  if (movement === "left") return "LT";
  if (movement === "through") return "TH";
  return "RT";
}

function createEmptyDirectionPermissions(): Record<LaneGroupKey, boolean> {
  return {
    left: false,
    through: false,
    right: false,
  };
}

export function createEmptyPhaseMovementPermissions(): PhaseMovementPermissions {
  return {
    Northbound: createEmptyDirectionPermissions(),
    Southbound: createEmptyDirectionPermissions(),
    Eastbound: createEmptyDirectionPermissions(),
    Westbound: createEmptyDirectionPermissions(),
  };
}

export function createDefaultPhaseMovementPermissions(
  phaseNumber: number
): PhaseMovementPermissions {
  const isNorthSouthPhase = phaseNumber % 2 === 1;

  return {
    Northbound: {
      left: isNorthSouthPhase,
      through: isNorthSouthPhase,
      right: isNorthSouthPhase,
    },
    Southbound: {
      left: isNorthSouthPhase,
      through: isNorthSouthPhase,
      right: isNorthSouthPhase,
    },
    Eastbound: {
      left: !isNorthSouthPhase,
      through: !isNorthSouthPhase,
      right: !isNorthSouthPhase,
    },
    Westbound: {
      left: !isNorthSouthPhase,
      through: !isNorthSouthPhase,
      right: !isNorthSouthPhase,
    },
  };
}

function cloneMovementPermissions(
  permissions: PhaseMovementPermissions
): PhaseMovementPermissions {
  return {
    Northbound: { ...permissions.Northbound },
    Southbound: { ...permissions.Southbound },
    Eastbound: { ...permissions.Eastbound },
    Westbound: { ...permissions.Westbound },
  };
}

function hasAnyMovementSelected(
  permissions: PhaseMovementPermissions | undefined
): boolean {
  if (!permissions) return false;

  return APPROACH_DIRECTIONS.some((approach) =>
    LANE_GROUP_KEYS.some((movement) => Boolean(permissions[approach]?.[movement]))
  );
}

function parseLegacyProtectedMovements(
  text: string | undefined,
  phaseNumber: number
): PhaseMovementPermissions {
  const trimmed = text?.trim();

  if (!trimmed) {
    return createDefaultPhaseMovementPermissions(phaseNumber);
  }

  const permissions = createEmptyPhaseMovementPermissions();
  const tokens = trimmed
    .split(/[,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  tokens.forEach((token) => {
    const directions: ApproachDirection[] = [];
    const normalizedToken = token.replace(/\s+/g, "_");

    if (
      normalizedToken.includes("nb") ||
      normalizedToken.includes("north")
    ) {
      directions.push("Northbound");
    }

    if (
      normalizedToken.includes("sb") ||
      normalizedToken.includes("south")
    ) {
      directions.push("Southbound");
    }

    if (
      normalizedToken.includes("eb") ||
      normalizedToken.includes("east")
    ) {
      directions.push("Eastbound");
    }

    if (
      normalizedToken.includes("wb") ||
      normalizedToken.includes("west")
    ) {
      directions.push("Westbound");
    }

    if (
      normalizedToken.includes("ns") &&
      !directions.includes("Northbound") &&
      !directions.includes("Southbound")
    ) {
      directions.push("Northbound", "Southbound");
    }

    if (
      normalizedToken.includes("ew") &&
      !directions.includes("Eastbound") &&
      !directions.includes("Westbound")
    ) {
      directions.push("Eastbound", "Westbound");
    }

    const movements = LANE_GROUP_KEYS.filter((movement) => {
      if (movement === "left") {
        return normalizedToken.includes("lt") || normalizedToken.includes("left");
      }

      if (movement === "through") {
        return normalizedToken.includes("th") || normalizedToken.includes("through");
      }

      return normalizedToken.includes("rt") || normalizedToken.includes("right");
    });

    directions.forEach((direction) => {
      const targetMovements = movements.length > 0 ? movements : LANE_GROUP_KEYS;
      targetMovements.forEach((movement) => {
        permissions[direction][movement] = true;
      });
    });
  });

  return hasAnyMovementSelected(permissions)
    ? permissions
    : createDefaultPhaseMovementPermissions(phaseNumber);
}

function normalizeMovementPermissions(
  permissions: PhaseMovementPermissions | undefined,
  legacyText: string | undefined,
  phaseNumber: number
): PhaseMovementPermissions {
  if (hasAnyMovementSelected(permissions)) {
    const safePermissions = createEmptyPhaseMovementPermissions();

    APPROACH_DIRECTIONS.forEach((approach) => {
      LANE_GROUP_KEYS.forEach((movement) => {
        safePermissions[approach][movement] = Boolean(
          permissions?.[approach]?.[movement]
        );
      });
    });

    return safePermissions;
  }

  return parseLegacyProtectedMovements(legacyText, phaseNumber);
}

export function formatPhaseMovementSummary(
  permissions: PhaseMovementPermissions
): string {
  const segments = APPROACH_DIRECTIONS.map((approach) => {
    const servedMovements = LANE_GROUP_KEYS.filter(
      (movement) => permissions[approach][movement]
    );

    if (servedMovements.length === 0) {
      return null;
    }

    return `${getApproachShortLabel(approach)} ${servedMovements
      .map((movement) => getMovementShortLabel(movement))
      .join("/")}`;
  }).filter(Boolean);

  return segments.length > 0
    ? segments.join(", ")
    : "No served movements selected";
}

export function getServedApproachDirections(
  permissions: PhaseMovementPermissions
): ApproachDirection[] {
  return APPROACH_DIRECTIONS.filter((approach) =>
    LANE_GROUP_KEYS.some((movement) => permissions[approach][movement])
  );
}

export function ensurePhaseTimingCount(
  phases: PhaseTiming[],
  requestedCount: number
): PhaseTiming[] {
  const safeCount = Math.max(1, requestedCount || 1);

  return Array.from({ length: safeCount }, (_, index) => {
    const phaseNumber = index + 1;
    const existingPhase = phases[index];
    const movementPermissions = normalizeMovementPermissions(
      existingPhase?.movementPermissions,
      existingPhase?.protectedMovements,
      phaseNumber
    );

    return {
      phaseNumber: existingPhase?.phaseNumber || phaseNumber,
      greenTime: existingPhase?.greenTime ?? "",
      yellowAllRed: existingPhase?.yellowAllRed ?? "",
      protectedMovements: formatPhaseMovementSummary(movementPermissions),
      movementPermissions: cloneMovementPermissions(movementPermissions),
    };
  });
}
