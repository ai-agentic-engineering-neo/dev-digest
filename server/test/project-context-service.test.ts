import { describe, it, expect } from 'vitest';
import { AGENT_ID, REPO_ID, SKILL_ID, WS, makeFakes } from './helpers/project-context.js';

const FILES = {
  'specs/a.md': 'a'.repeat(40),
  'docs/b.md': 'b'.repeat(80),
  'node_modules/x/docs/n.md': 'vendor',
  '.github/docs/h.md': 'hidden',
};

describe('ProjectContextService.list', () => {
  it('lists documents with kind, tokens (tokenizer count) and no excluded paths (AC-1, 3, 5)', async () => {
    const { service } = makeFakes({ files: FILES });
    const out = await service.list(WS, REPO_ID);
    expect(out.map((f) => f.path)).toEqual(['docs/b.md', 'specs/a.md']);
    expect(out[1]).toMatchObject({ kind: 'specs', tokens: 10, too_large: false, agent_count: 0, skill_count: 0 });
  });

  it('marks a file over the cap too_large without reading it (AC-6)', async () => {
    const { service, git } = makeFakes({ files: { 'docs/big.md': 'x'.repeat(200_001) } });
    const [f] = await service.list(WS, REPO_ID);
    expect(f).toMatchObject({ too_large: true, tokens: null });
    expect(git.showCalls).toHaveLength(0);
  });

  it('caches per head sha: a second call reads no blob, a new sha or refresh does (AC-7, AC-10)', async () => {
    const { service, git } = makeFakes({ files: FILES });
    await service.list(WS, REPO_ID);
    const cold = git.showCalls.length;
    expect(cold).toBe(2);
    await service.list(WS, REPO_ID);
    expect(git.showCalls.length).toBe(cold);
    await service.list(WS, REPO_ID, { refresh: true });
    expect(git.showCalls.length).toBe(cold * 2);
  });

  it('merges usage counts per call (AC-26)', async () => {
    const { service } = makeFakes({ files: FILES });
    await service.setAgentContext(WS, AGENT_ID, REPO_ID, ['specs/a.md']);
    await service.setSkillContext(WS, SKILL_ID, REPO_ID, ['specs/a.md']);
    const out = await service.list(WS, REPO_ID);
    expect(out.find((f) => f.path === 'specs/a.md')).toMatchObject({ agent_count: 1, skill_count: 1, agents_using: 1 });
    expect(out.find((f) => f.path !== 'specs/a.md')).toMatchObject({ agents_using: 0 });
  });

  it('no clone is a 409, unknown repo a 404, git failure a 502 (AC-12, D17)', async () => {
    await expect(makeFakes({ files: FILES, repo: { clonePath: null } }).service.list(WS, REPO_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(makeFakes({ repo: null }).service.list(WS, REPO_ID)).rejects.toMatchObject({ statusCode: 404 });
    const f = makeFakes({ files: FILES });
    f.git.listFiles = async () => {
      throw new Error('ref not found');
    };
    await expect(f.service.list(WS, REPO_ID)).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('ProjectContextService.readFile', () => {
  it('reads a listed file at the listed sha; unsafe is 422, unknown 404 (AC-9)', async () => {
    const { service, git } = makeFakes({ files: FILES, head: 'abcdef12' });
    expect(await service.readFile(WS, REPO_ID, 'specs/a.md')).toEqual({
      path: 'specs/a.md',
      sha: 'abcdef12',
      text: FILES['specs/a.md'],
      modified: false,
    });
    expect(git.showCalls.at(-1)).toEqual({ ref: 'abcdef12', path: 'specs/a.md' });
    await expect(service.readFile(WS, REPO_ID, '../etc/passwd')).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.readFile(WS, REPO_ID, 'docs/nope.md')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.readFile(WS, REPO_ID, '.github/docs/h.md')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('attachments', () => {
  it('stores the whole ordered list and returns it with missing flags (AC-15, 16)', async () => {
    const f = makeFakes({ files: FILES });
    const out = await f.service.setAgentContext(WS, AGENT_ID, REPO_ID, ['docs/b.md', 'specs/a.md']);
    expect(out).toEqual([
      { path: 'docs/b.md', order: 0, missing: false, too_large: false },
      { path: 'specs/a.md', order: 1, missing: false, too_large: false },
    ]);
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['gone.md', 'specs/a.md']);
    const got = await f.service.getAgentContext(WS, AGENT_ID, REPO_ID);
    expect(got[0]).toMatchObject({ path: 'gone.md', missing: true });
  });

  it('rejects duplicates, unknown and too large paths with 422 details (AC-6, 16)', async () => {
    const f = makeFakes({ files: { ...FILES, 'docs/big.md': 'x'.repeat(200_001) } });
    await expect(
      f.service.setSkillContext(WS, SKILL_ID, REPO_ID, ['specs/a.md', 'specs/a.md', 'zzz.md', 'docs/big.md']),
    ).rejects.toMatchObject({
      statusCode: 422,
      details: {
        issues: [
          { path: 'specs/a.md', reason: 'duplicate' },
          { path: 'zzz.md', reason: 'unknown' },
          { path: 'docs/big.md', reason: 'too_large' },
        ],
      },
    });
  });

  it('unknown agent or skill is 404', async () => {
    const f = makeFakes({ files: FILES });
    const other = '66666666-6666-4666-8666-666666666666';
    await expect(f.service.getAgentContext(WS, other, REPO_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(f.service.setSkillContext(WS, other, REPO_ID, [])).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('resolveForRun', () => {
  const run = (f: ReturnType<typeof makeFakes>, skills = [{ id: SKILL_ID, name: 'sec' }]) => {
    const lines: string[] = [];
    return f.service
      .resolveForRun(WS, { repoId: REPO_ID, baseBranch: 'main', agentId: AGENT_ID, skills, log: (m) => lines.push(m) })
      .then((r) => ({ r, lines }));
  };

  it('nothing attached: empty and silent (AC-36, D18)', async () => {
    const { r, lines } = await run(makeFakes({ files: FILES }));
    expect(r).toEqual({ blocks: [], totalTokens: 0 });
    expect(lines).toEqual([]);
  });

  it('reads at the base branch, agent first then skill, logs per document and a summary (AC-27, 29, 38)', async () => {
    const f = makeFakes({ files: FILES, head: 'bbbbbbb1' });
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['specs/a.md']);
    f.skillPaths.set(`${SKILL_ID}:${REPO_ID}`, ['specs/a.md', 'docs/b.md']);
    const { r, lines } = await run(f);
    expect(f.git.listCalls.at(-1)!.ref).toBe('main');
    expect(f.git.showCalls.at(-1)!.ref).toBe('bbbbbbb1');
    expect(r.blocks.map((b) => [b.path, b.source])).toEqual([
      ['specs/a.md', 'agent'],
      ['docs/b.md', 'skill:sec'],
    ]);
    expect(lines).toEqual([
      'Context attached: specs/a.md (10 tokens, agent)',
      'Context attached: docs/b.md (20 tokens, skill:sec)',
      'Context: 2 documents, 30 tokens',
    ]);
    expect(r.totalTokens).toBe(30);
  });

  it('a disabled skill is not passed, so its documents are absent (AC-28)', async () => {
    const f = makeFakes({ files: FILES });
    f.skillPaths.set(`${SKILL_ID}:${REPO_ID}`, ['docs/b.md']);
    const { r } = await run(f, []);
    expect(r.blocks).toEqual([]);
  });

  it('truncates a document over the per-document cap and flags it (AC-33)', async () => {
    const f = makeFakes({ files: { 'docs/long.md': 'x'.repeat(40_000) } });
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['docs/long.md']);
    const { r, lines } = await run(f);
    expect(r.blocks[0]).toMatchObject({ truncated: true, tokens: 8000 });
    expect(lines.some((l) => l.includes('docs/long.md') && l.includes('truncated'))).toBe(true);
  });

  it('skips a document that would pass the prompt budget and every later one (AC-34)', async () => {
    const files = {
      'docs/1.md': 'x'.repeat(32_000),
      'docs/2.md': 'x'.repeat(32_000),
      'docs/3.md': 'x'.repeat(32_000),
      'docs/4.md': 'x'.repeat(40),
    };
    const f = makeFakes({ files });
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['docs/1.md', 'docs/2.md', 'docs/3.md', 'docs/4.md']);
    const { r, lines } = await run(f);
    expect(r.blocks.map((b) => b.path)).toEqual(['docs/1.md', 'docs/2.md', 'docs/3.md']);
    expect(lines.filter((l) => l.startsWith('Context skipped: docs/4.md'))).toHaveLength(1);
  });

  it('skips missing, binary and unreadable documents with a reason and never throws (AC-35, EC-12)', async () => {
    const f = makeFakes({ files: { 'docs/ok.md': 'fine', 'docs/bin.md': 'a�b' } });
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['docs/gone.md', 'docs/bin.md', 'docs/ok.md']);
    const { r, lines } = await run(f);
    expect(r.blocks.map((b) => b.path)).toEqual(['docs/ok.md']);
    expect(lines).toContain('Context skipped: docs/gone.md — not found at the base branch');
    expect(lines).toContain('Context skipped: docs/bin.md — not UTF-8 text');
  });

  it('no clone, or an unavailable base branch, logs every path and continues (AC-35, R1)', async () => {
    const f = makeFakes({ files: FILES, repo: { clonePath: null } });
    f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['specs/a.md']);
    expect((await run(f)).lines).toEqual(['Context skipped: specs/a.md — repository is not cloned']);

    const g = makeFakes({ files: FILES });
    g.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['specs/a.md']);
    g.git.listFiles = async () => {
      throw new Error('ref not found');
    };
    const { r, lines } = await run(g);
    expect(r.blocks).toEqual([]);
    expect(lines[0]).toMatch(/^Context skipped: specs\/a\.md — base branch "main"/);
  });
});

describe('local overrides (AC-45 to AC-56)', () => {
  const PATH = 'specs/a.md';
  const NEW = 'edited spec text';

  it('save stores the override with the listed blob sha, returns the AC-50 shape (AC-46, 50)', async () => {
    const f = makeFakes({ files: FILES, head: 'abcdef12' });
    const out = await f.service.saveFile(WS, REPO_ID, PATH, NEW);
    expect(out).toMatchObject({
      path: PATH,
      sha: 'abcdef12',
      text: NEW,
      modified: true,
      repo_text: FILES[PATH],
    });
    expect(out.updated_at).toBeTruthy();
    const listed = (await f.git.listFiles({ owner: 'o', name: 'r' }, 'main', [])).files.find((x) => x.path === PATH)!;
    expect(f.overrides.get(`${WS}:${REPO_ID}:${PATH}`)!.sha).toBe(listed.blob);
    expect(await f.service.readFile(WS, REPO_ID, PATH)).toMatchObject({ text: NEW, modified: true, repo_text: FILES[PATH] });
  });

  it('422 for unsafe, unlisted, too_large, empty, over-cap and NUL text; nothing written (AC-47)', async () => {
    const f = makeFakes({ files: { ...FILES, 'docs/big.md': 'x'.repeat(200_001) } });
    const cases: [string, string][] = [
      ['../x.md', 'a'],
      ['docs/none.md', 'a'],
      ['docs/big.md', 'a'],
      [PATH, ''],
      [PATH, 'x'.repeat(200_001)],
      [PATH, 'a\0b'],
    ];
    for (const [path, text] of cases) {
      await expect(f.service.saveFile(WS, REPO_ID, path, text)).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(f.writes).toEqual({ upsert: 0, delete: 0 });
  });

  it('identical text stores no override and removes an existing one (AC-48, EC-20)', async () => {
    const f = makeFakes({ files: FILES });
    await f.service.saveFile(WS, REPO_ID, PATH, NEW);
    const out = await f.service.saveFile(WS, REPO_ID, PATH, FILES[PATH]);
    expect(out).toMatchObject({ modified: false, text: FILES[PATH] });
    expect(f.overrides.size).toBe(0);
  });

  it('reset removes the override and returns the repository version; no override succeeds (AC-49, EC-26)', async () => {
    const f = makeFakes({ files: FILES });
    await f.service.saveFile(WS, REPO_ID, PATH, NEW);
    expect(await f.service.resetFile(WS, REPO_ID, PATH)).toMatchObject({ modified: false, text: FILES[PATH] });
    expect(f.overrides.size).toBe(0);
    expect(await f.service.resetFile(WS, REPO_ID, PATH)).toMatchObject({ modified: false });
  });

  it('reset on an unlisted path is 404 and keeps the orphan row; unsafe is 422 (D3, AC-53)', async () => {
    const f = makeFakes({ files: FILES });
    f.overrides.set(`${WS}:${REPO_ID}:docs/gone.md`, { path: 'docs/gone.md', text: 't', sha: 's', updatedAt: 'x' });
    await expect(f.service.resetFile(WS, REPO_ID, 'docs/gone.md')).rejects.toMatchObject({ statusCode: 404 });
    await expect(f.service.resetFile(WS, REPO_ID, '../x')).rejects.toMatchObject({ statusCode: 422 });
    expect(f.overrides.size).toBe(1);
  });

  it('listing merges overrides on a cache hit: modified and override tokens, no blob re-read (AC-51, D5)', async () => {
    const f = makeFakes({ files: FILES });
    await f.service.list(WS, REPO_ID);
    const reads = f.git.showCalls.length;
    await f.service.saveFile(WS, REPO_ID, PATH, 'y'.repeat(400));
    const after = (await f.service.list(WS, REPO_ID)).find((x) => x.path === PATH)!;
    expect(after).toMatchObject({ modified: true, tokens: 100 });
    // the listing itself is not re-read (only the save's own showFile)
    expect(f.git.showCalls.length).toBe(reads + 1);
    // memo: a second listing does not recount the override
    const counted = f.counts.tokens;
    await f.service.list(WS, REPO_ID);
    expect(f.counts.tokens).toBe(counted);
    await f.service.resetFile(WS, REPO_ID, PATH);
    expect((await f.service.list(WS, REPO_ID)).find((x) => x.path === PATH)).toMatchObject({ modified: false, tokens: 10 });
  });

  it('orphan and too_large overrides are ignored for the listing and kept (AC-53, D2)', async () => {
    const f = makeFakes({ files: { ...FILES, 'docs/big.md': 'x'.repeat(200_001) } });
    f.overrides.set(`${WS}:${REPO_ID}:docs/gone.md`, { path: 'docs/gone.md', text: 't', sha: 's', updatedAt: 'x' });
    f.overrides.set(`${WS}:${REPO_ID}:docs/big.md`, { path: 'docs/big.md', text: 't', sha: 's', updatedAt: 'x' });
    const list = await f.service.list(WS, REPO_ID);
    expect(list.map((x) => x.path)).not.toContain('docs/gone.md');
    expect(list.find((x) => x.path === 'docs/big.md')).toMatchObject({ modified: false, tokens: null });
    expect(f.overrides.size).toBe(2);
  });

  it('a repository change after the edit: override still wins, repo_text is the new text (EC-18)', async () => {
    const f = makeFakes({ files: FILES });
    await f.service.saveFile(WS, REPO_ID, PATH, NEW);
    (f.git as unknown as { opts: { files: Record<string, string> } }).opts.files[PATH] = 'new repo text';
    expect(await f.service.readFile(WS, REPO_ID, PATH)).toMatchObject({
      text: NEW,
      modified: true,
      repo_text: 'new repo text',
    });
  });

  it('writes nothing to git: only listFiles and showFile exist on the dependency (AC-52)', async () => {
    const f = makeFakes({ files: FILES });
    await f.service.saveFile(WS, REPO_ID, PATH, NEW);
    await f.service.resetFile(WS, REPO_ID, PATH);
    const keys = Object.keys(f.git).filter((k) => typeof (f.git as unknown as Record<string, unknown>)[k] === 'function');
    expect(keys.filter((k) => /commit|push|write|add/i.test(k))).toEqual([]);
    expect(f.git.listCalls.length + f.git.showCalls.length).toBeGreaterThan(0);
  });

  describe('resolveForRun', () => {
    const run = (f: ReturnType<typeof makeFakes>) => {
      const lines: string[] = [];
      return f.service
        .resolveForRun(WS, {
          repoId: REPO_ID,
          baseBranch: 'main',
          agentId: AGENT_ID,
          skills: [{ id: SKILL_ID, name: 'sec' }],
          log: (m) => lines.push(m),
        })
        .then((r) => ({ r, lines }));
    };

    it('uses the override text, marks the block and the log line; others unchanged (AC-54, 56)', async () => {
      const f = makeFakes({ files: FILES });
      f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, [PATH, 'docs/b.md']);
      await f.service.saveFile(WS, REPO_ID, PATH, NEW);
      const { r, lines } = await run(f);
      expect(r.blocks.map((b) => [b.path, b.text, b.modified])).toEqual([
        [PATH, NEW, true],
        ['docs/b.md', FILES['docs/b.md'], false],
      ]);
      expect(lines[0]).toBe(`Context attached: ${PATH} (4 tokens, agent, modified locally)`);
      expect(lines[1]).toBe('Context attached: docs/b.md (20 tokens, agent)');
    });

    it('applies the document token cap to override text (AC-55)', async () => {
      const f = makeFakes({ files: FILES });
      f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, [PATH]);
      await f.service.saveFile(WS, REPO_ID, PATH, 'x'.repeat(40_000));
      const { r, lines } = await run(f);
      expect(r.blocks[0]).toMatchObject({ truncated: true, tokens: 8000, modified: true });
      expect(lines.some((l) => l.startsWith(`Context truncated: ${PATH}`))).toBe(true);
    });

    it('an orphan override is ignored (path missing at the base branch) and kept (AC-53)', async () => {
      const f = makeFakes({ files: FILES });
      f.agentPaths.set(`${AGENT_ID}:${REPO_ID}`, ['docs/gone.md']);
      f.overrides.set(`${WS}:${REPO_ID}:docs/gone.md`, { path: 'docs/gone.md', text: 't', sha: 's', updatedAt: 'x' });
      const { r, lines } = await run(f);
      expect(r.blocks).toEqual([]);
      expect(lines).toContain('Context skipped: docs/gone.md — not found at the base branch');
      expect(f.overrides.size).toBe(1);
    });
  });
});
