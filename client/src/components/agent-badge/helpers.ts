const COLOR_COUNT = 6;

function clampColorIndex(colorIndex: number): number {
  if (!Number.isFinite(colorIndex)) return 1;
  return Math.min(COLOR_COUNT, Math.max(1, Math.trunc(colorIndex)));
}

export function agentColorVar(colorIndex: number): string {
  return `var(--viz-${clampColorIndex(colorIndex)})`;
}

export function agentTint(colorIndex: number): string {
  return `color-mix(in srgb, ${agentColorVar(colorIndex)} 12%, transparent)`;
}
