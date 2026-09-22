/** Pure stats math (server/specs/03-skills.md Contract: pull_rate, accept_rate). */
import { STATS_DEFAULT_DAYS } from './constants.js';

/** `num / den`, or null when nothing was measured (den = 0). */
export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Pull rate: of the runs where the skill was in the prompt, the share that cited it. */
export function pullRate(runsCited: number, runsAttached: number): number | null {
  return rate(runsCited, runsAttached);
}

/** Accept rate over the findings citing the skill that were acted on. */
export function acceptRate(accepted: number, dismissed: number): number | null {
  return rate(accepted, accepted + dismissed);
}

/** Start of a `days`-long window ending at `now`. */
export function windowStart(now: Date, days: number = STATS_DEFAULT_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
