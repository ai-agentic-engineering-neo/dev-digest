const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const STEP = 1024;

/** Human-readable byte size, e.g. 1536 → "1.5 KB". Negative input is rejected. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`formatBytes expects a non-negative finite number, got ${bytes}`);
  }
  if (bytes < STEP) return `${bytes} ${UNITS[0]}`;

  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }
  return `${value.toFixed(fractionDigits)} ${UNITS[unit]}`;
}
