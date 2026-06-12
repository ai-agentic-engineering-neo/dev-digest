/**
 * Tiny helpers for the e2e runner. Assertions are intentionally minimal: most
 * of the "assert" work is done by agent-browser's own `wait --text` / `wait --url`
 * commands, which exit non-zero when the condition isn't met within the timeout.
 * These helpers only cover the extra substring checks and result bookkeeping.
 */

/** A single agent-browser invocation within a flow. */
export interface Step {
  /** agent-browser argv, e.g. ["wait", "--text", "#482"]. `{BASE}` is substituted. */
  cmd: string[];
  /** Human label for logs (defaults to the joined cmd). */
  label?: string;
  /** Optional extra check on the command's stdout (beyond its exit code). */
  assert?: { stdoutIncludes?: string };
}

export interface Flow {
  name: string;
  description?: string;
  steps: Step[];
}

export interface StepResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface FlowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
}

/** Substitute `{BASE}` (and trim a trailing slash on BASE) in every arg. */
export function resolveArgs(cmd: string[], base: string): string[] {
  const b = base.replace(/\/+$/, "");
  return cmd.map((a) => a.replaceAll("{BASE}", b));
}

export function stdoutContains(stdout: string, needle: string): boolean {
  return stdout.includes(needle);
}

export function summarize(results: FlowResult[]): string {
  const lines: string[] = [];
  for (const f of results) {
    lines.push(`${f.ok ? "PASS" : "FAIL"}  ${f.name}`);
    for (const s of f.steps) {
      if (!s.ok) lines.push(`        ✗ ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
    }
  }
  const passed = results.filter((r) => r.ok).length;
  lines.push("");
  lines.push(`${passed}/${results.length} flows passed`);
  return lines.join("\n");
}
