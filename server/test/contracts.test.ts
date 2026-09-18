import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  AgentSkillLink,
  Skill,
  SkillSource,
  ConventionStatus,
  ConventionCandidate,
  ConventionList,
  ConventionCompose,
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
      stats: {
        duration_ms: 8200,
        tokens_in: 14820,
        tokens_out: 1240,
        cost_usd: 0.06,
        findings: 3,
        grounding: '3/3 passed',
      },
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

describe('SkillSource', () => {
  it('accepts imported as distinct from imported_url', () => {
    expect(SkillSource.parse('imported')).toBe('imported');
    expect(SkillSource.parse('imported_url')).toBe('imported_url');
    expect(
      Skill.parse({
        id: 's1',
        name: 'flaky-tests',
        description: 'Flag tests that depend on time, order, or unseeded randomness.',
        type: 'custom',
        source: 'imported',
        body: '# Flaky tests',
        enabled: false,
        version: 1,
      }).source,
    ).toBe('imported');
  });
});

describe('AgentSkillLink', () => {
  const base = {
    agent_id: 'ag1',
    skill_id: 's1',
    order: 0,
    name: 'uncovered-branches',
    type: 'custom' as const,
    description: 'Flag new production paths with no asserting test.',
    skill_enabled: true,
  };

  it('parse fails without enabled and succeeds with the GET summary fields', () => {
    expect(() => AgentSkillLink.parse(base)).toThrow();
    expect(AgentSkillLink.parse({ ...base, enabled: true })).toMatchObject({
      enabled: true,
      skill_enabled: true,
      name: 'uncovered-branches',
      type: 'custom',
    });
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
        provider: 'github',
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
});

describe('Convention contracts', () => {
  const accepted = {
    id: 'c1',
    rule: 'Use p-queue, not a homemade limiter',
    evidence_path: 'src/middleware/ratelimit.ts',
    evidence_snippet: 'Use p-queue, not a homemade limiter',
    confidence: 0.91,
    status: 'accepted' as const,
    category: 'async',
    evidence_start_line: 23,
    evidence_end_line: 31,
    accepted: true,
  };

  it('ConventionStatus parses pending | accepted | rejected', () => {
    expect(ConventionStatus.parse('pending')).toBe('pending');
    expect(ConventionStatus.parse('accepted')).toBe('accepted');
    expect(ConventionStatus.parse('rejected')).toBe('rejected');
    expect(() => ConventionStatus.parse('draft')).toThrow();
  });

  it('ConventionCandidate parses status, category, line range; accepted is true iff status is accepted', () => {
    const parsed = ConventionCandidate.parse(accepted);
    expect(parsed.status).toBe('accepted');
    expect(parsed.accepted).toBe(true);
    expect(parsed.category).toBe('async');
    expect(parsed.evidence_start_line).toBe(23);
    expect(parsed.evidence_end_line).toBe(31);

    const pending = ConventionCandidate.parse({ ...accepted, status: 'pending', accepted: false });
    expect(pending.accepted).toBe(false);
  });

  it('ConventionList.parse requires items', () => {
    expect(() => ConventionList.parse({ extracted_at: null, sample_file_count: 0 })).toThrow();
    const list = ConventionList.parse({ items: [accepted], extracted_at: null, sample_file_count: 12 });
    expect(list.items).toHaveLength(1);
    expect(list.sample_file_count).toBe(12);
  });

  it('ConventionCompose requires convention_ids min 1 and Skill name/description/body', () => {
    const base = {
      convention_ids: ['00000000-0000-0000-0000-000000000001'],
      name: 'payments-api-conventions',
      description: 'House conventions from acme/payments-api.',
      type: 'convention' as const,
      body: '# House conventions\nFlag violations.',
    };
    expect(ConventionCompose.parse(base).convention_ids).toHaveLength(1);
    expect(() => ConventionCompose.parse({ ...base, convention_ids: [] })).toThrow();
    expect(() => ConventionCompose.parse({ ...base, name: '' })).toThrow();
    expect(() => ConventionCompose.parse({ ...base, description: '' })).toThrow();
    expect(() => ConventionCompose.parse({ ...base, body: '' })).toThrow();
  });
});
