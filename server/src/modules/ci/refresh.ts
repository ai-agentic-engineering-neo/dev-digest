/**
 * specs/14-export-to-ci.md (P4, D-P5/AC-29) — the per-installation refresh
 * debounce. `GET /ci/runs` never contacts GitHub (AC-25); `POST /ci/refresh`
 * does, gated here at 30s per installation so two tabs auto-refreshing at
 * once still make at most one provider query per installation per interval.
 * `force: true` (the manual control) bypasses the gate.
 *
 * In-memory, process-local state is correct here: `CiService` is a
 * process-wide singleton (`platform/container.ts`'s cached getter), so this
 * gate is shared across every request the process handles.
 */

const DEBOUNCE_MS = 30_000;

export class RefreshDebounce {
  private lastQueriedAt = new Map<string, number>();

  /** True when a real provider re-query should happen now for this
   *  installation. */
  shouldQuery(installationId: string, force: boolean, now: number = Date.now()): boolean {
    if (force) return true;
    const last = this.lastQueriedAt.get(installationId);
    return last === undefined || now - last >= DEBOUNCE_MS;
  }

  markQueried(installationId: string, now: number = Date.now()): void {
    this.lastQueriedAt.set(installationId, now);
  }
}
