import type {
  AreaType,
  LeftTurnPhasing,
  SaturationFlowAdjustmentFactors,
} from "../models";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateLaneWidthFactor(laneWidthMeters: number): number {
  const boundedWidth = Math.max(2.4, laneWidthMeters);
  return 1 + (boundedWidth - 3.6) / 9;
}

export function calculateHeavyVehicleFactorFromComposition(
  busPercentage: number,
  hgvPercentage: number,
  busPassengerCarEquivalent: number = 2.0,
  hgvPassengerCarEquivalent: number = 2.0
): number {
  const boundedBusPercentage = clamp(busPercentage, 0, 100);
  const boundedHgvPercentage = clamp(hgvPercentage, 0, 100);
  const effectiveBusPassengerCarEquivalent = Math.max(1, busPassengerCarEquivalent);
  const effectiveHgvPassengerCarEquivalent = Math.max(1, hgvPassengerCarEquivalent);
  const equivalentHeavyVehiclePercentage =
    boundedBusPercentage * (effectiveBusPassengerCarEquivalent - 1) +
    boundedHgvPercentage * (effectiveHgvPassengerCarEquivalent - 1);

  if (equivalentHeavyVehiclePercentage <= 0) {
    return 1;
  }

  return 100 / (100 + equivalentHeavyVehiclePercentage);
}

export function calculateGradeFactor(gradePercent: number): number {
  const boundedGradePercent = Math.min(10, Math.max(-6, gradePercent));
  return 1 - boundedGradePercent / 200;
}

export function calculateParkingFactor(
  laneCount: number,
  parkingManeuversPerHour: number
): number {
  if (parkingManeuversPerHour <= 0 || laneCount <= 0) {
    return 1;
  }

  const boundedParkingManeuversPerHour = Math.min(180, parkingManeuversPerHour);
  const factor =
    (laneCount - 0.1 - (18 * boundedParkingManeuversPerHour) / 3600) / laneCount;

  return Math.max(0.05, factor);
}

export function calculateBusBlockageFactor(
  laneCount: number,
  busesStoppingPerHour: number
): number {
  if (busesStoppingPerHour <= 0 || laneCount <= 0) {
    return 1;
  }

  const boundedBusesStoppingPerHour = Math.min(250, busesStoppingPerHour);
  const factor =
    (laneCount - (14.4 * boundedBusesStoppingPerHour) / 3600) / laneCount;

  return Math.max(0.05, factor);
}

export function calculateAreaTypeFactor(areaType: AreaType): number {
  return areaType === "cbd" ? 0.9 : 1;
}

export function calculateLaneUtilizationFactor(
  totalVolume: number,
  highestLaneVolume: number,
  laneCount: number
): number {
  if (laneCount <= 0 || highestLaneVolume <= 0) {
    return 1;
  }

  const factor = totalVolume / (highestLaneVolume * laneCount);
  return Math.min(1, Math.max(0, factor));
}

function getProtectedLeftTurnShare(
  leftTurnPhasing: LeftTurnPhasing,
  protectedLeftTurnProportion: number
): number {
  if (leftTurnPhasing === "protected") return 1;
  if (leftTurnPhasing === "protected-permitted") {
    return clamp(protectedLeftTurnProportion, 0, 1);
  }
  return 0;
}

function calculatePermittedLeftTurnPassengerCarEquivalent(
  leftTurnProportion: number,
  opposingFlowVehPerHour: number,
  laneCount: number
): number {
  const boundedLeftTurnProportion = clamp(leftTurnProportion, 0, 1);
  const boundedOpposingFlowVehPerHour = Math.max(0, opposingFlowVehPerHour);
  const boundedLaneCount = Math.max(1, laneCount);

  return boundedLaneCount <= 1
    ? 1.4 + boundedOpposingFlowVehPerHour / 4000 + 6 * boundedLeftTurnProportion
    : 3.8 + boundedOpposingFlowVehPerHour / 8000 + 17 * boundedLeftTurnProportion;
}

export function calculateLeftTurnFactor(
  leftTurnProportion: number,
  isExclusiveLaneGroup: boolean,
  leftTurnPhasing: LeftTurnPhasing = "protected",
  protectedLeftTurnProportion: number = 0,
  opposingFlowVehPerHour: number = 0,
  laneCount: number = 1
): number {
  const boundedLeftTurnProportion = clamp(leftTurnProportion, 0, 1);
  const boundedProtectedLeftTurnProportion = clamp(protectedLeftTurnProportion, 0, 1);
  const protectedShare = getProtectedLeftTurnShare(
    leftTurnPhasing,
    boundedProtectedLeftTurnProportion
  );
  const permittedShare = 1 - protectedShare;

  if (boundedLeftTurnProportion <= 0) {
    return 1;
  }

  const permittedPassengerCarEquivalent = calculatePermittedLeftTurnPassengerCarEquivalent(
    boundedLeftTurnProportion,
    opposingFlowVehPerHour,
    laneCount
  );

  if (isExclusiveLaneGroup) {
    const protectedFactor = 0.95;
    const permittedFactor = protectedFactor / permittedPassengerCarEquivalent;
    return Math.max(
      0.75,
      protectedShare * protectedFactor + permittedShare * permittedFactor
    );
  }

  const permittedFactor =
    1 / (1 + boundedLeftTurnProportion * (permittedPassengerCarEquivalent - 1));
  return Math.max(0.7, protectedShare + permittedShare * permittedFactor);
}

function calculateUnprotectedRightTurnFactor(
  rightTurnProportion: number,
  isExclusiveLaneGroup: boolean,
  laneCount: number
): number {
  if (isExclusiveLaneGroup) {
    return Math.max(0.85, 1 - 0.15 * rightTurnProportion);
  }

  if (laneCount <= 1) {
    return Math.max(0.75, 1 - 0.05 * rightTurnProportion);
  }

  return Math.max(0.7, 1 - 0.15 * rightTurnProportion);
}

export function calculateRightTurnFactor(
  rightTurnProportion: number,
  isExclusiveLaneGroup: boolean,
  laneCount: number,
  protectedRightTurnProportion: number = 0
): number {
  const boundedRightTurnProportion = clamp(rightTurnProportion, 0, 1);
  const boundedProtectedRightTurnProportion = clamp(protectedRightTurnProportion, 0, 1);

  if (boundedRightTurnProportion <= 0) {
    return 1;
  }

  const unprotectedFactor = calculateUnprotectedRightTurnFactor(
    boundedRightTurnProportion,
    isExclusiveLaneGroup,
    laneCount
  );

  return (
    boundedProtectedRightTurnProportion +
    (1 - boundedProtectedRightTurnProportion) * unprotectedFactor
  );
}

export function calculateLeftTurnPedestrianFactor(
  pedestrianConflict: number,
  leftTurnProportion: number,
  protectedLeftTurnProportion: number = 0
): number {
  const boundedConflict = clamp(pedestrianConflict, 0, 1);
  const boundedLeftTurnProportion = clamp(leftTurnProportion, 0, 1);
  const boundedProtectedLeftTurnProportion = clamp(protectedLeftTurnProportion, 0, 1);

  if (boundedConflict <= 0 || boundedLeftTurnProportion <= 0) {
    return 1;
  }

  const effectiveConflict =
    boundedConflict * boundedLeftTurnProportion * (1 - boundedProtectedLeftTurnProportion);

  return Math.max(0.75, 1 - effectiveConflict);
}

export function calculateRightTurnPedestrianFactor(
  pedestrianConflict: number,
  rightTurnProportion: number,
  protectedRightTurnProportion: number = 0
): number {
  const boundedConflict = clamp(pedestrianConflict, 0, 1);
  const boundedRightTurnProportion = clamp(rightTurnProportion, 0, 1);
  const boundedProtectedRightTurnProportion = clamp(protectedRightTurnProportion, 0, 1);
  const effectiveConflict =
    boundedConflict * boundedRightTurnProportion * (1 - boundedProtectedRightTurnProportion);

  return Math.max(0.5, 1 - effectiveConflict);
}

export function calculateIdealSaturationFlow(laneCount: number): number {
  return 1900 * laneCount;
}

export function calculateSaturationFlowAdjustmentMultiplier(
  factors: SaturationFlowAdjustmentFactors
): number {
  return (
    factors.laneWidthFactor *
    factors.heavyVehicleFactor *
    factors.gradeFactor *
    factors.parkingFactor *
    factors.busBlockageFactor *
    factors.areaTypeFactor *
    factors.laneUtilizationFactor *
    factors.leftTurnFactor *
    factors.rightTurnFactor *
    factors.leftTurnPedestrianFactor *
    factors.rightTurnPedestrianFactor
  );
}

export function calculateAdjustedSaturationFlow(
  idealSaturationFlow: number,
  factors: SaturationFlowAdjustmentFactors
): number {
  return idealSaturationFlow * calculateSaturationFlowAdjustmentMultiplier(factors);
}
