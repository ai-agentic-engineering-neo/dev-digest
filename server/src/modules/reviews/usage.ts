/**
 * Running total of LLM usage across a run's chunk calls (fed by the engine's
 * `onUsage`). Cost is null until the first priced call, and stays null once
 * any call has an unknown price — same null-propagation as reviewer-core, so
 * "unknown" is never shown as a too-low number. No calls → null ("—" in UI).
 */
export class UsageTally {
  tokensIn = 0;
  tokensOut = 0;
  private calls = 0;
  private cost: number | null = 0;

  add(u: { tokensIn: number; tokensOut: number; costUsd: number | null }): void {
    this.calls++;
    this.tokensIn += u.tokensIn;
    this.tokensOut += u.tokensOut;
    this.cost = this.cost == null || u.costUsd == null ? null : this.cost + u.costUsd;
  }

  get costUsd(): number | null {
    return this.calls === 0 ? null : this.cost;
  }
}
