/**
 * specs/09-project-context-folder.md — `ProjectContextService.resolveForRun`
 * / `resolveForAdhoc`: merge/dedupe (AC-11), skill gating (AC-12), budget
 * (AC-21/AC-32/AC-34), and failure-path reasons (AC-19/AC-27/AC-33/AC-36).
 *
 * Hermetic: real tmpdir checkouts on disk (so containment/stat/read are
 * exercised for real), fake `AgentLookup`/`SkillLookup`/`AgentSkillLookup`
 * ports and a hand-rolled `ProjectContextRepository`-shaped fake (this
 * repo's `as unknown as <Repository>` convention — see
 * `test/skills-preview.test.ts`), no DB.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ProjectContextRepository } from '../src/modules/project-context/repository.js';
import { PROJECT_CONTEXT_TOKEN_BUDGET } from '../src/modules/project-context/constants.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import type { ProjectContextLookup } from '../src/modules/skills/service.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

interface Doc {
  repoId: string;
  path: string;
  order: number;
  attached: boolean;
}

interface FakeRepoRow {
  id: string;
  fullName: string;
  clonePath: string | null;
}

/** Char-count tokenizer — deterministic, easy to reason about budgets with. */
const CHAR_TOKENIZER = { count: (t: string) => t.length };

function buildService(opts: {
  agentDocs?: Doc[];
  skillDocsById?: Record<string, Doc[]>;
  enabledSkills?: { id: string; name: string }[];
  repos?: Record<string, FakeRepoRow>;
}) {
  const agentDocs = opts.agentDocs ?? [];
  const skillDocsById = opts.skillDocsById ?? {};
  const enabledSkillsList = opts.enabledSkills ?? [];
  const repos = opts.repos ?? {};

  const repo = {
    listAttachedForAgent: async () => agentDocs.filter((d) => d.attached),
    listAttachedForSkill: async (skillId: string) =>
      (skillDocsById[skillId] ?? []).filter((d) => d.attached),
    getRepoById: async (id: string) => repos[id],
  } as unknown as ProjectContextRepository;

  const agents = { getById: async () => ({ id: 'agent-1' }) };
  const skills = { getById: async () => ({ id: 'skill-1' }) };
  const agentSkills = { enabledSkills: async () => enabledSkillsList };

  return new ProjectContextService(repo, agents, skills, agentSkills, CHAR_TOKENIZER);
}

describe('ProjectContextService.resolveForRun — merge, gating, budget, failures', () => {
  let repoARoot: string;
  let repoBRoot: string;

  beforeEach(async () => {
    repoARoot = await mkdtemp(join(tmpdir(), 'project-context-resolve-a-'));
    repoBRoot = await mkdtemp(join(tmpdir(), 'project-context-resolve-b-'));
  });
  afterEach(async () => {
    await rm(repoARoot, { recursive: true, force: true });
    await rm(repoBRoot, { recursive: true, force: true });
  });

  it('AC-11 — agent-direct documents first, then enabled-skill documents in link order', async () => {
    await writeFileAt(repoARoot, 'specs/agent-doc.md', 'AGENT');
    await writeFileAt(repoARoot, 'specs/skill-doc.md', 'SKILL');

    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/agent-doc.md', order: 0, attached: true }],
      enabledSkills: [{ id: 'skill-1', name: 'my-skill' }],
      skillDocsById: {
        'skill-1': [{ repoId: 'repo-a', path: 'specs/skill-doc.md', order: 0, attached: true }],
      },
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents.map((d) => d.path)).toEqual(['specs/agent-doc.md', 'specs/skill-doc.md']);
    expect(entries[0]!.origin).toBe('agent');
    expect(entries[1]!.origin).toBe('skill');
    expect(entries[1]!.skill).toBe('my-skill');
  });

  it('AC-11 — the same path attached both directly and via a skill is emitted once, at its earliest position', async () => {
    await writeFileAt(repoARoot, 'specs/shared.md', 'SHARED');

    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/shared.md', order: 0, attached: true }],
      enabledSkills: [{ id: 'skill-1', name: 'my-skill' }],
      skillDocsById: {
        'skill-1': [{ repoId: 'repo-a', path: 'specs/shared.md', order: 0, attached: true }],
      },
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toHaveLength(1);
    expect(entries.filter((e) => e.path === 'specs/shared.md')).toHaveLength(1);
    expect(entries[0]!.origin).toBe('agent');
  });

  it('AC-12 — a skill disabled at either gate contributes no documents (enabledSkills already ANDs both)', async () => {
    await writeFileAt(repoARoot, 'specs/skill-doc.md', 'SKILL');
    const service = buildService({
      enabledSkills: [], // AgentsRepository.enabledSkills already excludes gated-off skills
      skillDocsById: {
        'skill-1': [{ repoId: 'repo-a', path: 'specs/skill-doc.md', order: 0, attached: true }],
      },
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
  });

  it('AC-21/AC-32 — a budget that fits only the first of three documents keeps document 1 whole and records the other two as dropped', async () => {
    const budget = PROJECT_CONTEXT_TOKEN_BUDGET;
    await writeFileAt(repoARoot, 'specs/1.md', 'A'.repeat(budget - 1));
    await writeFileAt(repoARoot, 'specs/2.md', 'B'.repeat(10));
    await writeFileAt(repoARoot, 'specs/3.md', 'C'.repeat(10));

    const service = buildService({
      agentDocs: [
        { repoId: 'repo-a', path: 'specs/1.md', order: 0, attached: true },
        { repoId: 'repo-a', path: 'specs/2.md', order: 1, attached: true },
        { repoId: 'repo-a', path: 'specs/3.md', order: 2, attached: true },
      ],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents.map((d) => d.path)).toEqual(['specs/1.md']);
    expect(documents[0]!.content).toBe('A'.repeat(budget - 1));
    const dropped = entries.filter((e) => e.status === 'dropped');
    expect(dropped.map((e) => e.path)).toEqual(['specs/2.md', 'specs/3.md']);
    expect(dropped.every((e) => e.reason === 'budget_drop')).toBe(true);
  });

  it('AC-34 — a single document larger than the whole budget is dropped and the block would be empty', async () => {
    await writeFileAt(repoARoot, 'specs/huge.md', 'X'.repeat(PROJECT_CONTEXT_TOKEN_BUDGET + 1));
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/huge.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
    expect(entries[0]!.status).toBe('dropped');
    expect(entries[0]!.reason).toBe('budget_drop');
  });

  it('AC-33 — a document pinned to a different repo than the run is dropped with repo_mismatch, and the run still completes', async () => {
    await writeFileAt(repoARoot, 'specs/a.md', 'A');
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/a.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-b');
    expect(documents).toEqual([]);
    expect(entries[0]!.status).toBe('omitted');
    expect(entries[0]!.reason).toBe('repo_mismatch');
  });

  it('AC-27 — a path escaping the checkout via `..` is refused, never read', async () => {
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: '../outside.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
    expect(entries[0]!.status).toBe('refused');
    expect(entries[0]!.reason).toBe('refused_containment');
  });

  it('AC-36 — a deleted attached document is omitted with reason missing, and the run still completes', async () => {
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/gone.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
    expect(entries[0]!.status).toBe('omitted');
    expect(entries[0]!.reason).toBe('missing');
  });

  it('AC-19 — a repo with no synced checkout is omitted with reason no_checkout', async () => {
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/a.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: null } },
    });

    const { entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(entries[0]!.status).toBe('omitted');
    expect(entries[0]!.reason).toBe('no_checkout');
  });

  it('AC-16 — zero attached/inherited documents resolves to an empty result', async () => {
    const service = buildService({});
    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
    expect(entries).toEqual([]);
  });

  it('AC-6 — token count is produced by the injected tokenizer, never a separate estimate', async () => {
    await writeFileAt(repoARoot, 'specs/a.md', '1234567890'); // 10 chars
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/a.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });
    const { entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(entries[0]!.tokens).toBe(10); // CHAR_TOKENIZER.count === length
  });

  it('AC-6 — token parity: a document and a skill body of identical text report identical counts, through the SAME real tokenizer', async () => {
    // Real (non-fake) tokenizer on both sides — proves neither path uses a
    // separate estimate formula (e.g. chars/4) for one and a real BPE count
    // for the other. `SkillsService.countTokens` is the same "live counter"
    // the body editor and the Preview tab use (modules/skills/service.ts).
    const IDENTICAL_TEXT = 'api/ must not import db/ directly — this is a project-context invariant.';
    await writeFileAt(repoARoot, 'specs/invariant.md', IDENTICAL_TEXT);

    const tokenizer = new TiktokenTokenizer();
    const repo = {
      listAttachedForAgent: async () => [
        { repoId: 'repo-a', path: 'specs/invariant.md', order: 0, attached: true },
      ],
      listAttachedForSkill: async () => [],
      getRepoById: async (id: string) =>
        id === 'repo-a' ? { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } : undefined,
    } as unknown as ProjectContextRepository;
    const contextService = new ProjectContextService(
      repo,
      { getById: async () => ({ id: 'agent-1' }) },
      { getById: async () => ({ id: 'skill-1' }) },
      { enabledSkills: async () => [] },
      tokenizer,
    );

    const skillsService = new SkillsService(
      {} as unknown as SkillsRepository,
      tokenizer,
      {} as unknown as ProjectContextLookup,
    );

    const { entries } = await contextService.resolveForRun('ws-1', 'agent-1', 'repo-a');
    const { tokens: skillBodyTokens } = skillsService.countTokens(IDENTICAL_TEXT);

    expect(entries[0]!.tokens).toBe(skillBodyTokens);
  });

  it('unreadable — a permission-denied file is omitted with reason unreadable, and the run still completes', async () => {
    // Root-run and Windows CI can both bypass POSIX read permission bits, so
    // this test only proves anything in a normal, non-root POSIX sandbox.
    if (process.platform === 'win32' || process.getuid?.() === 0) return;

    await writeFileAt(repoARoot, 'specs/secret.md', 'no read for you');
    const target = join(repoARoot, 'specs', 'secret.md');
    await chmod(target, 0o000);
    try {
      const service = buildService({
        agentDocs: [{ repoId: 'repo-a', path: 'specs/secret.md', order: 0, attached: true }],
        repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
      });
      const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
      expect(documents).toEqual([]);
      expect(entries[0]!.status).toBe('omitted');
      expect(entries[0]!.reason).toBe('unreadable');
    } finally {
      await chmod(target, 0o644); // restore so afterEach's rm can clean up
    }
  });

  it('not_a_file — an attachment path that resolves to a directory is omitted with reason not_a_file', async () => {
    await mkdir(join(repoARoot, 'specs', 'a-directory.md'), { recursive: true });
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/a-directory.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });
    const { documents, entries } = await service.resolveForRun('ws-1', 'agent-1', 'repo-a');
    expect(documents).toEqual([]);
    expect(entries[0]!.status).toBe('omitted');
    expect(entries[0]!.reason).toBe('not_a_file');
  });
});

describe('ProjectContextService.resolveForAdhoc — D5/AC-30/finding-5 (no repo filter, repo carried per doc)', () => {
  let repoARoot: string;
  let repoBRoot: string;

  beforeEach(async () => {
    repoARoot = await mkdtemp(join(tmpdir(), 'project-context-adhoc-a-'));
    repoBRoot = await mkdtemp(join(tmpdir(), 'project-context-adhoc-b-'));
  });
  afterEach(async () => {
    await rm(repoARoot, { recursive: true, force: true });
    await rm(repoBRoot, { recursive: true, force: true });
  });

  it('resolves attachments pinned to DIFFERENT repos in one call — no repo_mismatch filtering', async () => {
    await writeFileAt(repoARoot, 'specs/a.md', 'A');
    await writeFileAt(repoBRoot, 'specs/b.md', 'B');

    const service = buildService({
      agentDocs: [
        { repoId: 'repo-a', path: 'specs/a.md', order: 0, attached: true },
        { repoId: 'repo-b', path: 'specs/b.md', order: 1, attached: true },
      ],
      repos: {
        'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot },
        'repo-b': { id: 'repo-b', fullName: 'acme/b', clonePath: repoBRoot },
      },
    });

    const { documents, injected, skipped } = await service.resolveForAdhoc('ws-1', 'agent-1');
    expect(documents.map((d) => d.path)).toEqual(['specs/a.md', 'specs/b.md']);
    expect(skipped).toEqual([]);
    expect(injected.map((d) => d.repo.full_name)).toEqual(['acme/a', 'acme/b']);
  });

  it('AC-31 — every skipped document carries its repo and reason for the CLI report', async () => {
    const service = buildService({
      agentDocs: [{ repoId: 'repo-a', path: 'specs/gone.md', order: 0, attached: true }],
      repos: { 'repo-a': { id: 'repo-a', fullName: 'acme/a', clonePath: repoARoot } },
    });

    const { injected, skipped } = await service.resolveForAdhoc('ws-1', 'agent-1');
    expect(injected).toEqual([]);
    expect(skipped).toEqual([
      {
        repo: { id: 'repo-a', full_name: 'acme/a' },
        path: 'specs/gone.md',
        tokens: 0,
        origin: 'agent',
        skill: null,
        status: 'omitted',
        reason: 'missing',
      },
    ]);
  });
});
