import { describe, expect, it, vi } from 'vitest';
import { countBlockers } from '@devdigest/reviewer-core';
import type { CiFailOn, Finding } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import {
  ADHOC_TASK_LINE,
  AdhocReviewService,
  type AgentLookup,
  type AgentRecord,
  type ProjectContextResolution,
  type ProjectContextResolver,
  type SkillLookup,
} from './adhoc.js';
import type { RenderableSkill } from '../_shared/skill-render.js';

/**
 * Hermetic unit test — stub `AgentLookup`/`SkillLookup` ports + a stub
 * `LLMProvider` (`MockLLMProvider`, this repo's DI test-double convention;
 * see `server/src/adapters/mocks.ts`), no DB, no container. Mirrors
 * `blast/service.test.ts`.
 */

// A single-file diff with two coverable new-side lines (1: context, 2: added)
// so a finding at src/api.ts:2 grounds cleanly.
const DIFF_TEXT = [
  'diff --git a/src/api.ts b/src/api.ts',
  '--- a/src/api.ts',
  '+++ b/src/api.ts',
  '@@ -1,1 +1,2 @@',
  ' const a = 1;',
  '+const stripeKey = "sk_live_1";',
  '',
].join('\n');

// A diff with only a pure rename (no `+++` content line) — parses to zero files.
const RENAME_ONLY_DIFF_TEXT = [
  'diff --git a/old.ts b/new.ts',
  'similarity index 100%',
  'rename from old.ts',
  'rename to new.ts',
  '',
].join('\n');

const AGENT: AgentRecord = {
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You review pull requests for security issues.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
};

const WARNING_FINDING: Finding = {
  id: 'f1',
  severity: 'WARNING',
  category: 'security',
  title: 'Hardcoded key looks sensitive',
  file: 'src/api.ts',
  start_line: 2,
  end_line: 2,
  rationale: 'A string literal here looks like a live secret.',
  suggestion: 'Move it to an environment variable.',
  confidence: 0.8,
};

const REVIEW_FIXTURE = {
  verdict: 'request_changes',
  summary: 'One finding worth addressing.',
  score: 55,
  findings: [WARNING_FINDING],
};

const EMPTY_PROJECT_CONTEXT: ProjectContextResolution = { documents: [], injected: [], skipped: [] };

interface Overrides {
  agent?: AgentRecord | null | undefined;
  skills?: RenderableSkill[];
  llm?: MockLLMProvider;
  projectContext?: ProjectContextResolution;
}

function buildService(overrides: Overrides = {}) {
  const getById = vi.fn(async () => ('agent' in overrides ? overrides.agent : AGENT));
  const agents: AgentLookup = { getById };

  const enabledSkills = vi.fn(async () => overrides.skills ?? []);
  const skills: SkillLookup = { enabledSkills };

  const llm = overrides.llm ?? new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
  const resolveLlm = vi.fn(async () => llm);

  const resolveForAdhoc = vi.fn(async () => overrides.projectContext ?? EMPTY_PROJECT_CONTEXT);
  const projectContext: ProjectContextResolver = { resolveForAdhoc };

  const service = new AdhocReviewService(agents, skills, resolveLlm, projectContext);
  return { service, getById, enabledSkills, resolveLlm, resolveForAdhoc, llm };
}

describe('AdhocReviewService.review', () => {
  it('throws NotFoundError when the agent does not exist', async () => {
    const { service, resolveLlm } = buildService({ agent: undefined });
    await expect(
      service.review({ workspaceId: 'ws1', agentId: 'ghost', diff: DIFF_TEXT }),
    ).rejects.toThrow(NotFoundError);
    // Never even resolves an LLM provider for a missing agent.
    expect(resolveLlm).not.toHaveBeenCalled();
  });

  it('throws before any LLM call when the diff parses to zero reviewable files', async () => {
    const { service, resolveLlm, enabledSkills } = buildService();
    await expect(
      service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: RENAME_ONLY_DIFF_TEXT }),
    ).rejects.toThrow(/no reviewable text lines/);
    expect(resolveLlm).not.toHaveBeenCalled();
    expect(enabledSkills).not.toHaveBeenCalled();
  });

  it('renders enabled skills via renderSkillBlock and includes them in the prompt', async () => {
    const skillFixture: RenderableSkill = {
      name: 'No hardcoded secrets',
      type: 'security',
      body: 'Never allow a literal API key or credential in source.',
    };
    const { service, llm } = buildService({ skills: [skillFixture] });

    await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const userMessage = (call!.req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;
    // Exact `renderSkillBlock` formatting (`### Skill: <name> (<type>)`) —
    // proves the shared renderer ran, not a second copy of the formatting.
    expect(userMessage).toContain('### Skill: No hardcoded secrets (security)');
    expect(userMessage).toContain('Never allow a literal API key or credential in source.');
  });

  it('calls reviewPullRequest with the expected input shape (task line, model, diff) and omits PR-only sections', async () => {
    const { service, llm } = buildService();

    await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const req = call!.req as { model: string; messages: { role: string; content: string }[] };
    expect(req.model).toBe(AGENT.model);
    const systemMessage = req.messages.find((m) => m.role === 'system')!.content;
    expect(systemMessage).toContain(AGENT.systemPrompt);
    const userMessage = req.messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).toContain(ADHOC_TASK_LINE);
    expect(userMessage).toContain('## Diff to review');
    expect(userMessage).toContain('stripeKey');
    // Prompt parity (specs/08 "what the adhoc review does and does not get"):
    // no PR, so none of these PR-only sections may appear.
    expect(userMessage).not.toContain('## PR description');
    expect(userMessage).not.toContain('## Repo skeleton');
    expect(userMessage).not.toContain('## Callers of changed symbols');
    expect(userMessage).not.toContain('## Declared PR scope');
  });

  it.each<[CiFailOn]>([['never'], ['critical'], ['warning'], ['any']])(
    'computes blockers as countBlockers(findings, ci_fail_on=%s) — the same deterministic gate the PR flow uses',
    async (ciFailOn) => {
      const { service } = buildService({ agent: { ...AGENT, ciFailOn } });

      const result = await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

      expect(result.blockers).toBe(countBlockers(result.findings, ciFailOn));
      expect(result.agent.ci_fail_on).toBe(ciFailOn);
    },
  );

  it('returns files_reviewed = the parsed diff file count, and touches no persistence port at all', async () => {
    const { service, getById, enabledSkills, resolveLlm, resolveForAdhoc } = buildService();

    const result = await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

    expect(result.files_reviewed).toBe(1);
    expect(result.grounding).toBeTruthy();
    // The only ports this service knows about are read-only lookups — there
    // is no write method on any fake to call, and each read happened exactly
    // once (no DB row was inserted, no run was created).
    expect(getById).toHaveBeenCalledTimes(1);
    expect(enabledSkills).toHaveBeenCalledTimes(1);
    expect(resolveLlm).toHaveBeenCalledTimes(1);
    expect(resolveForAdhoc).toHaveBeenCalledTimes(1);
  });
});

/**
 * specs/09-project-context-folder.md — D5/AC-30/AC-31: the CLI path injects
 * the SAME project-context documents a PR-triggered run would, via the same
 * `reviewPullRequest` call, and reports what was injected/skipped for the
 * CLI (which persists no trace).
 */
describe('AdhocReviewService.review — project context (specs/09)', () => {
  it('injects resolved documents into the prompt under ## Project context, wrapped as untrusted', async () => {
    const { service, llm } = buildService({
      projectContext: {
        documents: [{ path: 'specs/invariants.md', content: 'api/ must not import db/ directly' }],
        injected: [
          {
            repo: { id: 'repo-1', full_name: 'acme/api' },
            path: 'specs/invariants.md',
            tokens: 8,
            origin: 'agent',
            skill: null,
            status: 'included',
            reason: null,
          },
        ],
        skipped: [],
      },
    });

    await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const userMessage = (call!.req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;
    expect(userMessage).toContain('## Project context');
    expect(userMessage).toContain('<untrusted source="specs/invariants.md">');
    expect(userMessage).toContain('api/ must not import db/ directly');
  });

  it('omits ## Project context when nothing was resolved (AC-16 parity)', async () => {
    const { service, llm } = buildService();
    await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const userMessage = (call!.req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;
    expect(userMessage).not.toContain('## Project context');
  });

  it('returns injected + skipped documents in the response for the CLI report (AC-31)', async () => {
    const projectContext: ProjectContextResolution = {
      documents: [],
      injected: [],
      skipped: [
        {
          repo: { id: 'repo-1', full_name: 'acme/api' },
          path: 'specs/gone.md',
          tokens: 0,
          origin: 'agent',
          skill: null,
          status: 'omitted',
          reason: 'missing',
        },
      ],
    };
    const { service } = buildService({ projectContext });

    const result = await service.review({ workspaceId: 'ws1', agentId: 'agent-1', diff: DIFF_TEXT });

    expect(result.project_context.injected).toEqual([]);
    expect(result.project_context.skipped).toEqual(projectContext.skipped);
  });
});
