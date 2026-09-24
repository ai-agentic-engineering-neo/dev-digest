import { describe, it, expect } from 'vitest';
import type { Intent } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import {
  loadConfig,
  isLoopbackHost,
  promptLogVerboseDisabledReason,
  promptLogVerboseEnabledReason,
} from '../src/platform/config.js';
import {
  buildPromptLogRecord,
  sectionMeta,
  PromptLog,
  type PromptLogEntry,
  type PromptLogPort,
  type PromptLogSectionMeta,
} from '../src/platform/prompt-log.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentService } from '../src/modules/intent/application/intent-service.js';
import type { IntentPull, IntentRepo } from '../src/modules/intent/application/ports.js';

/**
 * PROMPT_LOG_VERBOSE gate (config.ts) + the pure record builder + sink
 * (prompt-log.ts). Safe structured logging of prompt assembly: numbers and
 * closed enums only, never prompt text — see docs/plans/2026-09-24-
 * prompt-assembly-logging.md.
 */

function envFor(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return { ...process.env, NODE_ENV: 'test', ...overrides } as NodeJS.ProcessEnv;
}

describe('isLoopbackHost', () => {
  it('accepts 127.0.0.0/8, ::1 and localhost', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.5.5.5')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
  });

  it('rejects a non-loopback host', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.5')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
  });
});

describe('PROMPT_LOG_VERBOSE gate (loadConfig)', () => {
  it('production + true → loadConfig throws (mirrors LLM_PROVIDER_OVERRIDE)', () => {
    expect(() => loadConfig(envFor({ NODE_ENV: 'production', PROMPT_LOG_VERBOSE: 'true' }))).toThrow(
      /PROMPT_LOG_VERBOSE/,
    );
  });

  it('test env + true → verbose stays off (requires development)', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'test', PROMPT_LOG_VERBOSE: 'true', API_HOST: '127.0.0.1' }));
    expect(config.promptLogVerbose).toBe(false);
    expect(config.promptLogVerboseRequested).toBe(true);
  });

  it('development + non-loopback API_HOST + true → verbose stays off', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', API_HOST: '0.0.0.0' }));
    expect(config.promptLogVerbose).toBe(false);
    expect(config.promptLogVerboseRequested).toBe(true);
  });

  it('development + loopback API_HOST + true → verbose is on', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', API_HOST: '127.0.0.1' }));
    expect(config.promptLogVerbose).toBe(true);
    expect(config.promptLogVerboseRequested).toBe(true);
  });

  it('unset or "false" → verbose stays off, not requested', () => {
    for (const value of [undefined, 'false', '']) {
      const config = loadConfig(
        envFor({ NODE_ENV: 'development', API_HOST: '127.0.0.1', ...(value !== undefined ? { PROMPT_LOG_VERBOSE: value } : {}) }),
      );
      expect(config.promptLogVerbose).toBe(false);
      expect(config.promptLogVerboseRequested).toBe(false);
    }
  });
});

describe('promptLogVerboseDisabledReason (boot warning)', () => {
  it('null when verbose was never requested', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', API_HOST: '127.0.0.1' }));
    expect(promptLogVerboseDisabledReason(config)).toBeNull();
  });

  it('null when verbose ended up on', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', API_HOST: '127.0.0.1' }));
    expect(promptLogVerboseDisabledReason(config)).toBeNull();
  });

  it('a message, with no secret, when requested but gated off', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'test', PROMPT_LOG_VERBOSE: 'true', API_HOST: '0.0.0.0' }));
    const reason = promptLogVerboseDisabledReason(config);
    expect(reason).toContain('PROMPT_LOG_VERBOSE');
    expect(reason).toContain('nodeEnv=test');
    expect(reason).toContain('apiHost=0.0.0.0');
  });
});

describe('promptLogVerboseEnabledReason (boot warning) [F1]', () => {
  it('null when verbose is off', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', API_HOST: '127.0.0.1' }));
    expect(promptLogVerboseEnabledReason(config)).toBeNull();
  });

  it('null when verbose was requested but gated off', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', API_HOST: '0.0.0.0' }));
    expect(promptLogVerboseEnabledReason(config)).toBeNull();
  });

  it('says verbose is ON, identifiers only, no secret, when it is on', () => {
    const config = loadConfig(envFor({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', API_HOST: '127.0.0.1' }));
    const reason = promptLogVerboseEnabledReason(config);
    expect(reason).toContain('PROMPT_LOG_VERBOSE=true is ON');
    expect(reason).toContain('never prompt content or secrets');
  });
});

describe('buildPromptLogRecord', () => {
  const baseEntry: PromptLogEntry = {
    feature: 'review',
    correlationId: 'run-1',
    provider: 'openai',
    model: 'gpt-4.1',
    sections: [sectionMeta('system', 'agent_config', 'trusted', 'x'.repeat(10))],
  };

  it('never carries section text — numbers/enums only', () => {
    const record = buildPromptLogRecord(baseEntry, { verbose: false });
    expect(JSON.stringify(record)).not.toContain('xxxxxxxxxx');
    expect(record.evt).toBe('prompt_assembled');
    expect(record.totalChars).toBe(10);
    expect(record.totalTokens).toBeGreaterThan(0);
  });

  /** Simulates a stale/unsafe caller bypassing the closed TS unions (e.g. `as any`). */
  function unsafeSection(fields: Record<string, unknown>): PromptLogSectionMeta {
    return fields as unknown as PromptLogSectionMeta;
  }

  it('drops a section with an unrecognized name (runtime allowlist backstop)', () => {
    const entry: PromptLogEntry = {
      ...baseEntry,
      sections: [
        ...baseEntry.sections,
        unsafeSection({ name: 'exfiltrated_secret', source: 'engine', role: 'user', trust: 'trusted', chars: 5, tokens: 2 }),
      ],
    };
    const record = buildPromptLogRecord(entry, { verbose: false });
    expect((record.sections as unknown[]).length).toBe(1);
  });

  it('drops a section with an unrecognized source', () => {
    const entry: PromptLogEntry = {
      ...baseEntry,
      sections: [
        unsafeSection({ name: 'system', source: 'not_a_real_source', role: 'system', trust: 'trusted', chars: 5, tokens: 2 }),
      ],
    };
    expect((buildPromptLogRecord(entry, { verbose: false }).sections as unknown[]).length).toBe(0);
  });

  it('omits verbose when off, includes only chunkLabel/sources when on', () => {
    const entry: PromptLogEntry = { ...baseEntry, verbose: { chunkLabel: 'src/a.ts' } };
    expect(buildPromptLogRecord(entry, { verbose: false }).verbose).toBeUndefined();
    const record = buildPromptLogRecord(entry, { verbose: true });
    expect(record.verbose).toEqual({ chunkLabel: 'src/a.ts' });
  });

  it('includes chunk position when present', () => {
    const entry: PromptLogEntry = { ...baseEntry, chunk: { index: 1, total: 3 } };
    expect(buildPromptLogRecord(entry, { verbose: false }).chunk).toEqual({ index: 1, total: 3 });
  });
});

describe('PromptLog (sink)', () => {
  const entry: PromptLogEntry = {
    feature: 'review',
    correlationId: 'run-1',
    provider: 'openai',
    model: 'gpt-4.1',
    sections: [sectionMeta('diff', 'author', 'untrusted', 'SENTINEL_DIFF_TEXT')],
  };

  it('logs one info line with the record, never the section text', () => {
    const calls: { obj: Record<string, unknown>; msg: string }[] = [];
    const log = new PromptLog(false, { info: (obj, msg) => calls.push({ obj, msg }) });
    log.assembled(entry);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.msg).toBe('prompt_assembled');
    expect(JSON.stringify(calls[0]!.obj)).not.toContain('SENTINEL_DIFF_TEXT');
  });

  it('is a no-op when the sink has no logger, or the logger has no info() (e.g. GitHubClientLogger)', () => {
    expect(() => new PromptLog(false).assembled(entry)).not.toThrow();
    expect(() => new PromptLog(false, { warn: () => {} } as never).assembled(entry)).not.toThrow();
  });

  it('never throws even if the sink itself throws', () => {
    const log = new PromptLog(false, {
      info: () => {
        throw new Error('sink exploded');
      },
    });
    expect(() => log.assembled(entry)).not.toThrow();
  });
});

describe('S4 — review wiring: reviewPullRequest onPrompt → PromptLog', () => {
  /** Every prompt slot carries a unique sentinel string that must never reach the sink. */
  const SENTINELS = [
    'SENTINEL_DIFF_LINE',
    'SENTINEL_PR_BODY',
    'SENTINEL_INTENT_TEXT',
    'SENTINEL_CALLERS',
    'SENTINEL_REPOMAP',
    'SENTINEL_SKILL',
    'SENTINEL_SPEC',
  ];

  it('logs provider/model/runId, never the sections’ content, verbose on AND off', async () => {
    const diff = parseUnifiedDiff(
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n x\n+SENTINEL_DIFF_LINE',
    );
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
    });
    const intent: Intent = { intent: 'SENTINEL_INTENT_TEXT', in_scope: [], out_of_scope: [] };
    const captured: Record<string, unknown>[] = [];

    for (const verbose of [false, true]) {
      const promptLog = new PromptLog(verbose, { info: (obj) => captured.push(obj) });
      await reviewPullRequest({
        systemPrompt: 'sys',
        model: 'gpt-4.1',
        diff,
        llm,
        task: "Review PR #1 'sentinel'",
        prDescription: 'SENTINEL_PR_BODY',
        intent,
        callers: 'SENTINEL_CALLERS',
        repoMap: 'SENTINEL_REPOMAP',
        skills: ['SENTINEL_SKILL'],
        specs: ['SENTINEL_SPEC'],
        onPrompt: (e) =>
          promptLog.assembled({
            feature: 'review',
            correlationId: 'run-sentinel-1',
            provider: 'openai',
            model: e.model,
            chunk: { index: e.chunkIndex, total: e.chunkCount },
            sections: e.sections,
            verbose: { chunkLabel: e.chunkLabel },
          }),
      });
    }

    expect(captured.length).toBeGreaterThan(0);
    const json = JSON.stringify(captured);
    for (const sentinel of SENTINELS) expect(json).not.toContain(sentinel);
    expect(json).toContain('openai');
    expect(json).toContain('gpt-4.1');
    expect(json).toContain('run-sentinel-1');
  });
});

describe('S5 — intent wiring: derive() logs system + task + intent_sources via promptLog', () => {
  it('correlationId=intent:<prId>:<hash prefix>; a loaded ticket referenced from the body contributes content that never reaches the log; provider/model present', async () => {
    const entries: PromptLogEntry[] = [];
    const promptLog: PromptLogPort = { assembled: (e) => entries.push(e) };
    const classifyMessages: { role: string; content: string }[][] = [];

    const pull: IntentPull = {
      id: 'pr-1',
      repoId: 'repo-1',
      number: 7,
      title: 'Add rate limiting',
      // Bare `#42` is a same-repo ticket ref (domain/links.ts) — the service
      // fetches it and folds its content into the classification prompt.
      body: 'Fixes #42 — SENTINEL_PR_BODY',
      branch: 'feat/x',
      headSha: 'sha1',
    };
    const repo: IntentRepo = { id: 'repo-1', owner: 'acme', name: 'demo' };

    const service = new IntentService({
      pulls: {
        getPull: async () => pull,
        getRepo: async () => repo,
        getCommits: async () => [],
        getChangedFiles: async () => [],
      },
      model: {
        resolve: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
        classify: async (_resolved, messages) => {
          classifyMessages.push(messages as unknown as { role: string; content: string }[]);
          return {
            data: { intent: 'Add rate limiting', in_scope: [], out_of_scope: [], change_type: 'feature' },
            tokensIn: 1,
            tokensOut: 1,
            costUsd: 0,
          };
        },
      },
      docs: { read: async () => ({ ok: false, reason: 'no doc refs' }) },
      tickets: {
        read: async (_repo, number) =>
          number === 42
            ? { ok: true, title: 'SENTINEL_TICKET_TITLE', body: 'SENTINEL_TICKET_SAMPLE' }
            : { ok: false, reason: 'not found' },
      },
      store: {
        get: async () => undefined,
        upsert: async (record) => ({
          ...record.intent,
          pr_id: record.prId,
          head_sha: record.headSha,
          input_hash: record.inputHash,
          prompt_version: record.promptVersion,
          provider: record.provider,
          model: record.model,
          tokens_in: record.tokensIn,
          tokens_out: record.tokensOut,
          cost_usd: record.costUsd,
          derived_at: record.derivedAt.toISOString(),
        }),
      },
      clock: () => new Date(),
      promptLog,
    });

    const result = await service.resolveForReview({ workspaceId: 'ws', pull, repo, changedFiles: [] });

    expect(result.status).toBe('used');
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.feature).toBe('intent');
    expect(entry.correlationId).toMatch(/^intent:pr-1:[0-9a-f]{12}$/);
    expect(entry.provider).toBe('openai');
    expect(entry.model).toBe('gpt-4.1');
    expect(entry.sections.map((s) => s.name)).toEqual(['system', 'task', 'intent_sources']);

    const json = JSON.stringify(entries);
    for (const sentinel of ['SENTINEL_PR_BODY', 'SENTINEL_TICKET_TITLE', 'SENTINEL_TICKET_SAMPLE']) {
      expect(json).not.toContain(sentinel);
    }

    // F3: summed user-role section chars ≈ the real user message length (the
    // actual message sent to the model), within a small documented constant —
    // one '\n\n' join not captured because the framing (`task`) and the
    // sources block (`intent_sources`) are logged as two separate sections
    // instead of the real message's 3 joined pieces (see classification.ts).
    expect(classifyMessages).toHaveLength(1);
    const userMessage = classifyMessages[0]!.find((m) => m.role === 'user')!.content;
    const summedUserChars = entry.sections.filter((s) => s.role === 'user').reduce((n, s) => n + s.chars, 0);
    expect(Math.abs(userMessage.length - summedUserChars)).toBeLessThanOrEqual(2);
  });
});
