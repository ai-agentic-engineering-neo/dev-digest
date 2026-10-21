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
  RunSummary,
  PrMeta,
  Settings,
  Repo,
  PrDetail,
  PrIntentRecord,
  IntentSource,
  FEATURE_MODELS,
  SpecFile,
  ContextAttachment,
  ContextAttachmentsUpdate,
  ContextFileContent,
  ContextFileUpdate,
  PromptAssembly,
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
        risks: [{ kind: 'auth', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
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
    const file = (path: string) => ({
      path,
      additions: 84,
      deletions: 0,
      finding_lines: [28, 52],
      finding_ids: ['f1', 'f2'],
    });
    const d = SmartDiff.parse({
      has_review: true,
      groups: [
        { role: 'core', files: [file('a.ts')] },
        { role: 'tests', files: [file('a.test.ts')] },
        { role: 'docs', files: [] },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    expect(() =>
      SmartDiff.parse({
        has_review: false,
        groups: [{ role: 'nope', files: [] }],
        split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
      }),
    ).toThrow();
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
    const tour = {
      generated_at: '2026-10-21T10:00:00.000Z',
      provider: 'openrouter',
      model: 'm',
      tokens_in: 1,
      tokens_out: 2,
      cost_usd: null,
      files_indexed: 3,
      limited: false,
      sections: [
        { kind: 'architecture', title: 'A', body: 'b', diagram: null },
        { kind: 'critical_paths', title: 'C', items: [{ path: 'a.ts', why: 'w' }] },
        { kind: 'run_locally', title: 'R', items: [{ command: 'pnpm dev', note: null }] },
        { kind: 'reading_path', title: 'G', items: [] },
        { kind: 'first_tasks', title: 'F', items: [{ title: 't', why: 'w', files: [{ path: 'a.ts' }] }] },
      ],
    };
    expect(() => Onboarding.parse(tour)).not.toThrow();
    // old shape and a reordered tuple are rejected
    expect(() => Onboarding.parse({ sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] })).toThrow();
    expect(() => Onboarding.parse({ ...tour, sections: [...tour.sections].reverse() })).toThrow();
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
    expect(trace.stats.cost_usd).toBe(0.06);
  });

  it('run cost: RunSummary and PrMeta carry a nullable cost_usd (null = unknown, never 0)', () => {
    const base = {
      run_id: 'r1',
      kind: 'review',
      agent_id: null,
      agent_name: null,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      status: 'done',
      error: null,
      duration_ms: 8200,
      tokens_in: 8190,
      tokens_out: 929,
      findings_count: 2,
      grounding: '2/2 passed',
      ran_at: '2026-09-25T10:00:00.000Z',
      score: 61,
      blockers: 1,
    };
    expect(RunSummary.parse({ ...base, cost_usd: 0.0013 }).cost_usd).toBe(0.0013);
    expect(RunSummary.parse({ ...base, cost_usd: null }).cost_usd).toBeNull();
    expect(() => RunSummary.parse(base)).toThrow(); // cost_usd is required (nullable, not optional)

    const pr = {
      number: 482,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'abc',
      additions: 1,
      deletions: 0,
      files_count: 1,
      status: 'needs_review',
    };
    expect(PrMeta.parse({ ...pr, cost_usd: 0.012, cost_runs: 3 })).toMatchObject({ cost_usd: 0.012, cost_runs: 3 });
    expect(PrMeta.parse({ ...pr, cost_usd: null, cost_runs: null }).cost_usd).toBeNull();
    expect(PrMeta.parse(pr).cost_usd).toBeUndefined(); // list-only field; absent elsewhere
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

describe('PR intent contracts', () => {
  const record = {
    pr_id: 'p1',
    intent: 'Adds a limiter.',
    in_scope: ['limiter'],
    out_of_scope: [],
    confidence: 'medium',
    sources: [
      { kind: 'github_issue', ref: '#471', status: 'used', chars: 640 },
      { kind: 'external_url', ref: 'https://x.test/a', status: 'skipped', reason: 'external_fetch_disabled' },
    ],
    head_sha: 'abc',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    tokens_in: 10,
    tokens_out: 5,
    cost_usd: 0.0003,
    duration_ms: 1200,
    derived_at: '2026-10-06T00:00:00.000Z',
    stale: false,
  };

  it('PrIntentRecord round-trips and rejects an unknown confidence or source status', () => {
    expect(PrIntentRecord.parse(record)).toEqual(record);
    expect(() => PrIntentRecord.parse({ ...record, confidence: 'certain' })).toThrow();
    expect(() => IntentSource.parse({ kind: 'title', ref: 'x', status: 'fetched' })).toThrow();
  });

  it('RunTrace prompt_assembly accepts the optional intent fields', () => {
    const trace = RunTrace.parse({
      config: { agent: 'a', model: 'm' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0' },
      prompt_assembly: { system: 's', user: 'u', intent: 'block', intent_confidence: 'low' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.prompt_assembly.intent_confidence).toBe('low');
  });

  it('review_intent defaults to a cheap OpenRouter model', () => {
    const def = FEATURE_MODELS.find((f) => f.id === 'review_intent')!;
    expect([def.defaultProvider, def.defaultModel]).toEqual(['openrouter', 'deepseek/deepseek-v4-flash']);
  });

  it('SpecFile keeps the old shape valid and accepts the project-context fields', () => {
    expect(SpecFile.parse({ path: 'docs/a.md' }).path).toBe('docs/a.md');
    const f = SpecFile.parse({
      path: 'specs/a.md',
      kind: 'specs',
      tokens: 12,
      too_large: false,
      agent_count: 1,
      skill_count: 0,
    });
    expect(f.kind).toBe('specs');
    expect(() => SpecFile.parse({ path: 'a.md', kind: 'other' })).toThrow();
  });

  it('context attachment contracts', () => {
    expect(ContextAttachment.parse({ path: 'a.md', order: 0, missing: false, too_large: false }).order).toBe(0);
    const repo_id = '33333333-3333-4333-8333-333333333333';
    expect(ContextAttachmentsUpdate.parse({ repo_id, paths: ['a.md'] }).paths).toEqual(['a.md']);
    expect(() => ContextAttachmentsUpdate.parse({ repo_id: 'x', paths: [] })).toThrow();
    expect(() => ContextAttachmentsUpdate.parse({ repo_id, paths: Array(201).fill('a.md') })).toThrow();
    expect(ContextFileContent.parse({ path: 'a.md', sha: 'abc', text: 't', modified: false }).sha).toBe('abc');
    expect(() => ContextFileContent.parse({ path: 'a.md', sha: 'abc', text: 't' })).toThrow();
    expect(ContextFileUpdate.parse({ path: 'a.md', text: '' }).text).toBe('');
    expect(() => ContextFileUpdate.parse({ path: 'a.md', text: 'x'.repeat(200_001) })).toThrow();
    expect(SpecFile.parse({ path: 'a.md' }).modified).toBeUndefined();
  });

  it('PromptAssembly context fields are optional and source is agent or skill:<name>', () => {
    expect(PromptAssembly.parse({ system: 's', user: 'u' }).context_blocks).toBeUndefined();
    const block = { path: 'a.md', tokens: 3, text: 't', truncated: false };
    const ok = PromptAssembly.parse({
      system: 's',
      user: 'u',
      context_tokens: 3,
      context_blocks: [
        { ...block, source: 'agent' },
        { ...block, source: 'skill:secret-gate' },
      ],
    });
    expect(ok.context_blocks).toHaveLength(2);
    // traces written before the increment carry no `modified`
    expect(ok.context_blocks![0]!.modified).toBeUndefined();
    expect(
      PromptAssembly.parse({
        system: 's',
        user: 'u',
        context_blocks: [{ ...block, source: 'agent', modified: true }, { ...block, source: 'agent', modified: null }],
      }).context_blocks![0]!.modified,
    ).toBe(true);
    expect(() =>
      PromptAssembly.parse({ system: 's', user: 'u', context_blocks: [{ ...block, source: 'other' }] }),
    ).toThrow();
  });
});
