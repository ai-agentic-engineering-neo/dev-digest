import { describe, it, expect } from 'vitest';
import { parseRepoUrl, canonicalCloneUrl, isValidRepoRef } from '../src/modules/repos/helpers.js';

/**
 * S1 (security hardening) — only `github.com/<owner>/<repo>` may reach
 * `git clone`, and owner/name must be safe directory names.
 */
describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/acme/widgets', 'acme', 'widgets'],
    ['https://github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/acme/widgets/', 'acme', 'widgets'],
    ['https://github.com/acme/widgets.git/', 'acme', 'widgets'],
    ['  https://github.com/acme/widgets  ', 'acme', 'widgets'],
    ['https://github.com/my-org/repo.name_v2', 'my-org', 'repo.name_v2'],
    ['git@github.com:acme/widgets.git', 'acme', 'widgets'],
    ['git@github.com:acme/widgets', 'acme', 'widgets'],
  ])('accepts %s', (url, owner, name) => {
    const parsed = parseRepoUrl(url);
    expect(parsed).toEqual({ owner, name, cloneUrl: `https://github.com/${owner}/${name}.git` });
  });

  it.each([
    // the original S1 exploit: github.com as a path segment on another host
    'https://x.tld/github.com/../node_modules',
    'https://evil.tld/github.com/acme/widgets',
    'https://github.com.evil.tld/acme/widgets',
    'https://evilgithub.com/acme/widgets',
    // dot segments — owner/name become directories under cloneDir
    'https://github.com/../widgets',
    'https://github.com/acme/..',
    'https://github.com/acme/.',
    'https://github.com/acme/../../etc',
    'https://github.com/%2e%2e/widgets',
    'git@github.com:../widgets',
    'git@github.com:acme/..',
    // other schemes / transports
    'http://github.com/acme/widgets',
    'file:///etc/passwd',
    'ext::sh -c id',
    'ssh://git@github.com/acme/widgets.git',
    'git@evil.tld:acme/widgets.git',
    // credentials, port, query, fragment, extra segments
    'https://user:pw@github.com/acme/widgets',
    'https://token@github.com/acme/widgets',
    'https://github.com:8443/acme/widgets',
    'https://github.com/acme/widgets?x=1',
    'https://github.com/acme/widgets#readme',
    'https://github.com/acme/widgets/tree/main',
    'https://github.com/acme',
    // identifier rules
    'https://github.com/-acme/widgets',
    'https://github.com/ac_me/widgets',
    `https://github.com/${'a'.repeat(40)}/widgets`,
    `https://github.com/acme/${'r'.repeat(101)}`,
    'https://github.com/acme/wid gets',
    '--upload-pack=touch /tmp/pwned',
    '',
  ])('rejects %s with a 400', (url) => {
    expect(() => parseRepoUrl(url)).toThrow(expect.objectContaining({ code: 'invalid_repo_url', statusCode: 400 }));
  });
});

describe('canonicalCloneUrl / isValidRepoRef', () => {
  it('rebuilds the only URL shape we clone from', () => {
    expect(canonicalCloneUrl('acme', 'widgets')).toBe('https://github.com/acme/widgets.git');
  });

  it('rejects dot-segments and path separators', () => {
    expect(isValidRepoRef('acme', 'widgets')).toBe(true);
    expect(isValidRepoRef('..', 'node_modules')).toBe(false);
    expect(isValidRepoRef('acme', '..')).toBe(false);
    expect(isValidRepoRef('acme', 'a/b')).toBe(false);
  });
});
