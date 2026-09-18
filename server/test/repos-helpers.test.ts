import { describe, it, expect } from 'vitest';
import { parseRepoUrl, withProviderToken, toRepoDto } from '../src/modules/repos/helpers.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Unit coverage for repo URL parsing / token-url construction — provider
 * detection (github.com vs gitlab.com), GitLab nested namespaces, and the
 * invalid-host rejection path.
 */

describe('parseRepoUrl', () => {
  it('parses a github.com https URL', () => {
    expect(parseRepoUrl('https://github.com/acme/payments-api')).toEqual({
      provider: 'github',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a github.com https URL with .git suffix', () => {
    expect(parseRepoUrl('https://github.com/acme/payments-api.git')).toEqual({
      provider: 'github',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a github.com ssh URL', () => {
    expect(parseRepoUrl('git@github.com:acme/payments-api.git')).toEqual({
      provider: 'github',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a gitlab.com https URL', () => {
    expect(parseRepoUrl('https://gitlab.com/acme/payments-api')).toEqual({
      provider: 'gitlab',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a gitlab.com ssh URL', () => {
    expect(parseRepoUrl('git@gitlab.com:acme/payments-api.git')).toEqual({
      provider: 'gitlab',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a gitlab.com URL with a nested group/subgroup namespace', () => {
    expect(parseRepoUrl('https://gitlab.com/acme/platform/payments-api.git')).toEqual({
      provider: 'gitlab',
      owner: 'acme/platform',
      name: 'payments-api',
    });
  });

  it('rejects a URL from an unrecognized host', () => {
    expect(() => parseRepoUrl('https://bitbucket.org/acme/payments-api')).toThrow(AppError);
    try {
      parseRepoUrl('https://bitbucket.org/acme/payments-api');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('invalid_repo_url');
    }
  });
});

describe('withProviderToken', () => {
  it('embeds a token into an https github.com URL', () => {
    const url = withProviderToken('https://github.com/acme/payments-api.git', 'github', 'ghp_secret');
    expect(url).toBe('https://x-access-token:ghp_secret@github.com/acme/payments-api.git');
  });

  it('embeds a token into an https gitlab.com URL', () => {
    const url = withProviderToken('https://gitlab.com/acme/payments-api.git', 'gitlab', 'glpat-secret');
    expect(url).toBe('https://x-access-token:glpat-secret@gitlab.com/acme/payments-api.git');
  });

  it('leaves an ssh URL untouched', () => {
    const url = withProviderToken('git@gitlab.com:acme/payments-api.git', 'gitlab', 'glpat-secret');
    expect(url).toBe('git@gitlab.com:acme/payments-api.git');
  });

  it('never leaks the token in a thrown error message', () => {
    // withProviderToken never throws for a non-URL string — it falls back to
    // the original url — but this guards the invariant explicitly.
    expect(() => withProviderToken('not a url', 'gitlab', 'glpat-secret')).not.toThrow();
    expect(withProviderToken('not a url', 'gitlab', 'glpat-secret')).toBe('not a url');
  });
});

describe('toRepoDto', () => {
  it('carries the provider through to the API DTO', () => {
    const row = {
      id: 'r1',
      workspaceId: 'w1',
      provider: 'gitlab',
      owner: 'acme',
      name: 'payments-api',
      fullName: 'acme/payments-api',
      defaultBranch: 'main',
      clonePath: null,
      lastPolledAt: null,
      createdBy: null,
      createdAt: new Date(),
    } as never;
    expect(toRepoDto(row).provider).toBe('gitlab');
  });
});
