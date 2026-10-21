import { describe, it, expect } from 'vitest';
import { resolveRepo, resolvePull } from '../src/api/resolve.js';
import { clientFor, REPO, PR_ID } from './helpers.js';

const repos = [REPO, { id: 'repo-2', name: 'payments-api', full_name: 'other/payments-api' }, { id: 'repo-3', name: 'web', full_name: 'acme/web' }];

describe('resolveRepo', () => {
  const { api } = clientFor((_m, p) => (p === '/repos' ? { body: repos } : undefined));
  it('matches owner/name case-insensitively', async () => {
    expect(await resolveRepo(api, 'ACME/Payments-API')).toEqual({ id: 'repo-1', full_name: 'acme/payments-api' });
  });
  it('matches a unique bare name', async () => {
    expect((await resolveRepo(api, 'web')).id).toBe('repo-3');
  });
  it('reports ambiguity with the candidates', async () => {
    await expect(resolveRepo(api, 'payments-api')).rejects.toThrow(/ambiguous.*acme\/payments-api.*other\/payments-api/);
  });
  it('lists known repos when unknown', async () => {
    await expect(resolveRepo(api, 'nope')).rejects.toThrow(/not imported.*acme\/web/);
  });
});

describe('resolvePull', () => {
  const pulls = [
    { id: PR_ID, number: 482, title: 'Add rate limiting', status: 'needs_review' },
    { id: null, number: 483, title: 'No id yet', status: 'open' },
    { id: 'pr-closed', number: 400, title: 'Old closed PR', status: 'closed' },
    { id: 'pr-merged', number: 401, title: 'Old merged PR', status: 'merged' },
  ];
  const { api } = clientFor((_m, p) => (p === '/repos/repo-1/pulls' ? { body: pulls } : undefined));
  it('resolves the internal id', async () => {
    expect(await resolvePull(api, 'repo-1', 482)).toEqual({ id: PR_ID, number: 482, title: 'Add rate limiting' });
  });
  it('rejects a PR with a null id and lists known PRs', async () => {
    await expect(resolvePull(api, 'repo-1', 483)).rejects.toThrow(/#482 Add rate limiting/);
  });
  it('rejects an unknown PR and lists only open PRs as candidates', async () => {
    const err = await resolvePull(api, 'repo-1', 1).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const text = (err as Error).message;
    expect(text).toMatch(/PR #1 was not found/);
    expect(text).toMatch(/Open PRs: #482 Add rate limiting/);
    expect(text).not.toMatch(/Old closed PR|Old merged PR/);
  });
});
