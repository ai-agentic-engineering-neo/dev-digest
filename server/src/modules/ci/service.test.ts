import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitHubClient } from '@devdigest/shared';
import { CiService, type CiExportOptions } from './service.js';
import type { CiRepository } from './repository.js';
import type { AgentLookup, AgentRecord, MemoryReader, RepoLookup, SkillLookup } from './ports.js';
import { MockSecretsProvider } from '../../adapters/mocks.js';
import { NotFoundError } from '../../platform/errors.js';
import { WORKFLOW_PATH } from './constants.js';

/**
 * specs/14-export-to-ci.md (P4, `CiService.previewFile`) — the on-demand
 * runner-bundle-file preview. Application-service test: fake ports
 * (onion-architecture skill's "inject fake ports" guidance, same shape as
 * `eval/service.test.ts`), no DB, no HTTP, no LLM. `runnerBundleDir` points
 * at a REAL temp directory because `buildBundle`/`readRunnerBundleDir` do a
 * real `fs` read for it — only `listRunnerBundleFiles`/`readFile` (not used
 * by the service) are the injectable seams `bundle.test.ts` exercises directly.
 */

const WORKSPACE_ID = 'ws-1';
const AGENT_ID = 'agent-1';

const AGENT: AgentRecord = {
  id: AGENT_ID,
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'Review the diff for security issues.',
  strategy: 'auto',
  ciFailOn: 'critical',
};

class FakeAgentLookup implements AgentLookup {
  async getById(workspaceId: string, id: string): Promise<AgentRecord | undefined> {
    return workspaceId === WORKSPACE_ID && id === AGENT_ID ? AGENT : undefined;
  }
}

class FakeSkillLookup implements SkillLookup {
  async enabledSkills() {
    return [{ slug: 'no-secrets', body: 'Do not leak API keys.' }];
  }
}

class FakeMemoryReader implements MemoryReader {
  async listRepoScoped() {
    return [];
  }
}

class FakeRepoLookup implements RepoLookup {
  async findByFullName() {
    return undefined;
  }
}

function neverCalledGithubClient(): () => Promise<GitHubClient> {
  return () => Promise.reject(new Error('previewFile must never resolve a GitHub client'));
}

describe('CiService.previewFile', () => {
  let runnerBundleDir: string;

  beforeAll(() => {
    runnerBundleDir = mkdtempSync(join(tmpdir(), 'ci-service-test-'));
    writeFileSync(join(runnerBundleDir, 'index.js'), "console.log('runner');");
    writeFileSync(join(runnerBundleDir, 'package.json'), '{"type":"module"}');
  });

  afterAll(() => {
    rmSync(runnerBundleDir, { recursive: true, force: true });
  });

  function makeService(): CiService {
    return new CiService(
      {} as CiRepository, // never called by generateFiles/previewFile
      new FakeAgentLookup(),
      new FakeSkillLookup(),
      new FakeMemoryReader(),
      new FakeRepoLookup(),
      neverCalledGithubClient(),
      runnerBundleDir,
      new MockSecretsProvider({}),
    );
  }

  const OPTS: CiExportOptions = {
    repo: 'acme/target',
    target: 'gha',
    action: 'files',
    post_as: 'github_review',
    triggers: ['opened', 'synchronize'],
    base: 'main',
  };

  it('fetching a valid path returns that file’s real content', async () => {
    const service = makeService();
    const file = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    expect(file.path).toBe(WORKFLOW_PATH);
    expect(file.contents).toEqual(expect.any(String));
    expect(file.contents!.length).toBeGreaterThan(0);
    expect(file.bytes).toBe(Buffer.byteLength(file.contents!, 'utf8'));
  });

  it('an unrecognized path 404s — never a filesystem lookup keyed on the client-supplied string', async () => {
    const service = makeService();
    // A directory-traversal-shaped path: if this were ever used as a real fs
    // path (instead of matched against the pre-generated file list), it
    // would attempt to read outside the runner bundle directory entirely.
    // The correct behaviour is a clean 404, not an fs error of any kind.
    await expect(
      service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, '../../../../../../etc/passwd'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a well-formed but non-existent bundle path also 404s (exact match only, no partial/prefix match)', async () => {
    const service = makeService();
    await expect(
      service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, '.devdigest/runner/does-not-exist.js'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-9 — deterministic: the same path/config returns byte-identical contents/bytes/sha256 across calls', async () => {
    const service = makeService();
    const first = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    const second = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    expect(second).toEqual(first);
  });

  it('never resolves the GitHub client — no network call, no LLM call, generation is pure', async () => {
    const service = makeService();
    // `neverCalledGithubClient` rejecting if invoked means this call would
    // itself reject if `previewFile` ever touched GitHub. `CiService` has no
    // LLM dependency at all (see its constructor) — there is structurally no
    // LLM call this path could make.
    await expect(service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH)).resolves.toBeDefined();
  });

  it('throws NotFoundError for an unknown agent before any bundle is generated', async () => {
    const service = makeService();
    await expect(
      service.previewFile(WORKSPACE_ID, 'no-such-agent', OPTS, WORKFLOW_PATH),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
