export function getLosFromDelay(delay: number): string {
  if (delay <= 10) return "A";
  if (delay <= 20) return "B";
  if (delay <= 35) return "C";
  if (delay <= 55) return "D";
  if (delay <= 80) return "E";
  return "F";
}
