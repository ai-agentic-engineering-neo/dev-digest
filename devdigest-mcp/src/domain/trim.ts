// Ring 1. Pure, hand-written output trimming. Fields are picked explicitly
// (allowlist) so a new server-side field can never leak through, and an agent's
// system_prompt is never returned.
import type { Agent, ConventionCandidate, ReviewRecord } from '@devdigest/shared';

export interface AgentSummary {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export function toAgentSummary(agent: Agent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    enabled: agent.enabled,
  };
}

// ---- shared helpers -------------------------------------------------------

/** Cuts to `max` characters (ellipsis included). Untrusted LLM text only leaves as truncated fields. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---- conventions ----------------------------------------------------------

export interface ConventionSummary {
  rule: string;
  category: string;
  evidence_path: string;
  evidence_snippet: string;
  evidence_line: number | null;
  confidence: number;
  accepted: boolean;
}

export const EVIDENCE_SNIPPET_MAX = 300;

export function toConventionSummary(c: ConventionCandidate): ConventionSummary {
  return {
    rule: c.rule,
    category: c.category,
    evidence_path: c.evidence_path,
    evidence_snippet: truncate(c.evidence_snippet, EVIDENCE_SNIPPET_MAX),
    evidence_line: c.evidence_line,
    confidence: c.confidence,
    accepted: c.accepted,
  };
}

// ---- findings -------------------------------------------------------------

export interface FindingSummary {
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string;
}

export interface FindingsSummary {
  run_id: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  counts: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  dismissed_count: number;
  total: number;
  returned: number;
  truncated: boolean;
  findings: FindingSummary[];
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Drops dismissed findings (reported as a count), sorts by severity, caps at `limit`. */
export function toFindingsSummary(review: ReviewRecord, limit: number): FindingsSummary {
  const kept = review.findings.filter((f) => f.dismissed_at == null);
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of kept) counts[f.severity] += 1;
  const sorted = kept
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (SEVERITY_ORDER[a.f.severity] ?? 9) - (SEVERITY_ORDER[b.f.severity] ?? 9) || a.i - b.i)
    .map(({ f }) => f);
  const page = sorted.slice(0, limit);
  return {
    run_id: review.run_id,
    verdict: review.verdict,
    summary: review.summary === null ? null : truncate(review.summary, 600),
    score: review.score,
    counts,
    dismissed_count: review.findings.length - kept.length,
    total: kept.length,
    returned: page.length,
    truncated: page.length < kept.length,
    findings: page.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      rationale: truncate(f.rationale, 400),
      ...(f.suggestion ? { suggestion: truncate(f.suggestion, 300) } : {}),
    })),
  };
}
