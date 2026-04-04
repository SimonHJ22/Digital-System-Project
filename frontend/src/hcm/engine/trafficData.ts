import type { FifteenMinuteCount } from "../models";

export function sum15MinuteCount(counts: FifteenMinuteCount): number {
  return counts.interval1 + counts.interval2 + counts.interval3 + counts.interval4;
}

export function getMax15MinuteCount(counts: FifteenMinuteCount): number {
  return Math.max(
    counts.interval1,
    counts.interval2,
    counts.interval3,
    counts.interval4
  );
}

export function calculatePeakHourFactor(counts: FifteenMinuteCount): number {
  const hourlyVolume = sum15MinuteCount(counts);
  const max15MinuteVolume = getMax15MinuteCount(counts);

  if (max15MinuteVolume <= 0) {
    return 1;
  }

  return hourlyVolume / (4 * max15MinuteVolume);
}

export function combine15MinuteCounts(
  countsList: FifteenMinuteCount[]
): FifteenMinuteCount {
  return countsList.reduce(
    (combined, counts) => ({
      interval1: combined.interval1 + counts.interval1,
      interval2: combined.interval2 + counts.interval2,
      interval3: combined.interval3 + counts.interval3,
      interval4: combined.interval4 + counts.interval4,
    }),
    {
      interval1: 0,
      interval2: 0,
      interval3: 0,
      interval4: 0,
    }
  );
}

export function calculateCombinedPeakHourFactor(
  countsList: FifteenMinuteCount[]
): number {
  return calculatePeakHourFactor(combine15MinuteCounts(countsList));
}
