export function calculateCapacity(
  saturationFlowPerHour: number,
  effectiveGreen: number,
  cycleLength: number
): number {
  if (
    !Number.isFinite(saturationFlowPerHour) ||
    !Number.isFinite(effectiveGreen) ||
    !Number.isFinite(cycleLength) ||
    saturationFlowPerHour <= 0 ||
    effectiveGreen <= 0 ||
    cycleLength <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((saturationFlowPerHour * (effectiveGreen / cycleLength)) / 5) * 5
  );
}

export function calculateVolumeToCapacityRatio(
  volumePerHour: number,
  capacityPerHour: number
): number {
  if (!Number.isFinite(volumePerHour) || volumePerHour <= 0) {
    return 0;
  }

  if (!Number.isFinite(capacityPerHour) || capacityPerHour <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return volumePerHour / capacityPerHour;
}
