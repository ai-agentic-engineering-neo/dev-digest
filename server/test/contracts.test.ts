import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  SmartDiffRole,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  PrMeta,
  PrFindingPreview,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  // WP2 (L03 Smart Order): SmartDiffRole gained 'tests' and 'docs'.
  it('SmartDiffRole accepts the new "tests" and "docs" values', () => {
    expect(SmartDiffRole.parse('tests')).toBe('tests');
    expect(SmartDiffRole.parse('docs')).toBe('docs');
  });

  it('SmartDiffRole rejects a value outside the 5-role enum', () => {
    expect(() => SmartDiffRole.parse('other')).toThrow();
  });

  it('SmartDiff parses a group with role "docs" without throwing', () => {
    expect(() =>
      SmartDiff.parse({
        groups: [{ role: 'docs', files: [{ path: 'README.md', additions: 1, deletions: 0, finding_lines: [] }] }],
        split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
      }),
    ).not.toThrow();
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });

  it('PrMeta.latest_findings distinguishes "never reviewed" from "found nothing"', () => {
    const base = {
      number: 482,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'sha',
      additions: 1,
      deletions: 0,
      files_count: 1,
      status: 'open' as const,
    };
    // Absent and null both mean "this PR has never been reviewed".
    expect(PrMeta.parse(base).latest_findings).toBeUndefined();
    expect(PrMeta.parse({ ...base, latest_findings: null }).latest_findings).toBeNull();

    // A review that found nothing is a DIFFERENT fact: a real, all-zero rollup.
    const clean = PrMeta.parse({
      ...base,
      latest_findings: {
        total: 0,
        by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
        preview: [],
      },
    });
    expect(clean.latest_findings).toEqual({
      total: 0,
      by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      preview: [],
    });

    // `preview` is capped, so it may be shorter than `total` — the popover
    // title must use `total`.
    const full = PrMeta.parse({
      ...base,
      latest_findings: {
        total: 9,
        by_severity: { CRITICAL: 2, WARNING: 4, SUGGESTION: 3 },
        preview: [
          {
            id: 'f1',
            severity: 'CRITICAL',
            category: 'security',
            title: 'Hardcoded key',
            file: 'src/a.ts',
            start_line: 4,
            end_line: 4,
            confidence: 0.95,
            description: 'A secret is committed in plain text.',
          },
        ],
      },
    });
    expect(full.latest_findings!.preview).toHaveLength(1);
    expect(full.latest_findings!.total).toBe(9);
  });

  it('PrFindingPreview carries only the three shipped severities, and no action state', () => {
    const preview = {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/a.ts',
      start_line: 4,
      end_line: 4,
      confidence: 0.95,
      description: 'A secret is committed in plain text.',
    };
    expect(() => PrFindingPreview.parse(preview)).not.toThrow();
    // INFO exists in the UI kit but not in the Severity contract — the list
    // must never be handed one.
    expect(() => PrFindingPreview.parse({ ...preview, severity: 'INFO' })).toThrow();
    // Read-only by construction: accept/dismiss state is not part of the shape.
    const parsed = PrFindingPreview.parse({ ...preview, accepted_at: 'now', dismissed_at: null });
    expect(parsed).not.toHaveProperty('accepted_at');
    expect(parsed).not.toHaveProperty('dismissed_at');
  });
});
