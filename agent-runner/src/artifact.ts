import type { Finding } from '@devdigest/shared';
import { CiResultArtifact, type CiAgentResult } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact (informational only). */
export const RUNNER_VERSION = '1';

/** One agent's contribution to the run, before rollup. */
export interface AgentResultInput {
  agent: string;
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  blockers: number;
  gateTriggered: boolean;
}

export interface BuildResultArtifactInput {
  /** In review order — never filesystem order (`findManifestPaths` sorts). */
  agents: AgentResultInput[];
  prNumber: number;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Sum a nullable-cost column the way money must be summed: `null` means "no
 * cost was reported", which is NOT zero. Only when every agent reports null
 * does the total stay null; otherwise the known costs add up and an unknown
 * one contributes nothing rather than poisoning the total.
 */
function sumCosts(agents: readonly AgentResultInput[]): number | null {
  const known = agents.map((a) => a.costUsd).filter((c): c is number => c != null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

function toAgentResult(input: AgentResultInput): CiAgentResult {
  const counts = severityCounts(input.findings);
  return {
    agent: input.agent,
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    blockers: input.blockers,
    gate_triggered: input.gateTriggered,
  };
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-26). Validated
 * against the SAME `CiResultArtifact` Zod contract the studio's ingest path
 * (T6) will `safeParse` on the way back in, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 *
 * Multi-agent runs: the top-level counts are the ROLLUP across every agent
 * and `agents` carries the breakdown. An ingest path that predates `agents`
 * therefore still reads correct totals — it just cannot attribute them. The
 * top-level `agent` string is the comma-joined roster for the same reason:
 * the field is non-optional in the contract and is what older readers show.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  if (input.agents.length === 0) {
    throw new RunnerError('Internal error: result artifact built with no agent results');
  }
  const allFindings = input.agents.flatMap((a) => a.findings);
  const counts = severityCounts(allFindings);
  const candidate = {
    findings_count: allFindings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: sumCosts(input.agents),
    duration_ms: input.agents.reduce((n, a) => n + a.durationMs, 0),
    agent: input.agents.map((a) => a.agent).join(', '),
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    agents: input.agents.map(toAgentResult),
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field above is shaped to the schema. If
    // this ever fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
