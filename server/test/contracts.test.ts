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
  SkillPreview,
  ProjectDocument,
  DocumentList,
  AttachedDocument,
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
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23, rank: 5 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      // specs/11-why-risk-brief.md Q4 — `kind` is now the closed RiskKind
      // vocabulary in the shared/stored contract (unrecognised strings are
      // normalised to `other` by grounding before they ever reach here).
      Risks.parse({
        risks: [{ kind: 'auth_surface', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
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
      // specs/12-eval-pipeline.md Q1 — `EvalRun` reshaped from a per-trace
      // fixture (`per_trace`) into the SET-LEVEL suite-run shape
      // (`per_case`, `cases_errored`, nullable ratios).
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        cases_errored: 0,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_case: [
          {
            case_id: 'c01',
            name: 't01',
            expectation_type: 'must_find',
            status: 'scored',
            pass: true,
            error_reason: null,
            findings_total: 1,
            findings_matched: 1,
            grounding_kept: 1,
            grounding_total: 1,
            duration_ms: 600,
            cost_usd: 0.01,
            actual: [
              {
                file: 'src/a.ts',
                start_line: 10,
                end_line: 10,
                severity: 'WARNING',
                category: 'security',
                title: 'x',
                matched: true,
              },
            ],
          },
        ],
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
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.0124, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: [
        {
          path: 'specs/security-baseline.md',
          tokens: 420,
          origin: 'agent',
          skill: null,
          status: 'included',
          reason: null,
        },
      ],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    expect(trace.specs_read).toHaveLength(1);
  });

  it('RunTrace — specs_read: [] still parses (pre-specs/09 traces, and every existing prompt/trace test)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 100, tokens_in: 10, tokens_out: 10, cost_usd: null, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.specs_read).toEqual([]);
  });

  it('SpecRead — origin/status enums round-trip; skill/reason are nullish', () => {
    const trace = RunTrace.parse({
      config: { agent: 'A', model: 'gpt-4.1', source: 'local' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [
        { path: 'docs/a.md', tokens: 12, origin: 'skill', skill: 'my-skill', status: 'dropped', reason: 'budget_drop' },
        { path: 'docs/b.md', tokens: 0, origin: 'agent', status: 'refused', reason: 'refused_containment' },
      ],
      log: [],
    });
    expect(trace.specs_read[0]!.skill).toBe('my-skill');
    expect(trace.specs_read[1]!.skill).toBeUndefined();
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
});

/**
 * specs/09-project-context-folder.md — the new Project Context contracts.
 * `SkillPreview.project_context_block` is `.nullable()`, which (per
 * server/LEARNINGS.md's `.nullable()` gotcha) makes the KEY required even
 * though the value may be null — pin both the null-block/zero-tokens shape
 * (a skill with nothing attached) and the populated shape in one fixture
 * each, so a future edit that flips `.nullable()` to `.nullish()` (or drops
 * the key) is caught here instead of as a spray of unrelated TS errors.
 */
describe('Project Context contracts (specs/09-project-context-folder.md)', () => {
  it('SkillPreview — project_context_block null + project_context_tokens 0 (no documents attached)', () => {
    expect(() =>
      SkillPreview.parse({
        block: '### Skill: my-skill (rubric)\nBody',
        tokens: 12,
        project_context_block: null,
        project_context_tokens: 0,
      }),
    ).not.toThrow();
  });

  it('SkillPreview — a populated project_context_block carries its own token count', () => {
    const preview = SkillPreview.parse({
      block: '### Skill: my-skill (rubric)\nBody',
      tokens: 12,
      project_context_block: '## Project context\n<untrusted source="specs/a.md">\nA\n</untrusted>',
      project_context_tokens: 8,
    });
    expect(preview.project_context_tokens).toBe(8);
  });

  it('ProjectDocument / DocumentList — round-trips a discovery listing', () => {
    const list = DocumentList.parse({
      roots: ['specs', 'docs'],
      documents: [
        ProjectDocument.parse({ path: 'specs/a.md', doc_type: 'specs', tokens: 42, used_by: 1 }),
      ],
      summary: { count: 1, tokens: 42, bounded: 0 },
    });
    expect(list.documents[0]!.doc_type).toBe('specs');
  });

  it('AttachedDocument — status is constrained to present|missing', () => {
    expect(() =>
      AttachedDocument.parse({
        repo_id: 'repo-1',
        path: 'specs/a.md',
        order: 0,
        attached: true,
        tokens: 10,
        status: 'missing',
      }),
    ).not.toThrow();
    expect(() =>
      AttachedDocument.parse({
        repo_id: 'repo-1',
        path: 'specs/a.md',
        order: 0,
        attached: true,
        tokens: 10,
        status: 'gone', // not a valid enum member
      }),
    ).toThrow();
  });
});
