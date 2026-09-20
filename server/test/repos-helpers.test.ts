import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

describe('parseRepoUrl', () => {
  it('parses https and ssh GitHub URLs', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets')).toEqual({ owner: 'acme', name: 'widgets' });
    expect(parseRepoUrl('https://github.com/acme/widgets.git/')).toEqual({ owner: 'acme', name: 'widgets' });
    expect(parseRepoUrl('git@github.com:acme/widgets.git')).toEqual({ owner: 'acme', name: 'widgets' });
    expect(parseRepoUrl('https://github.com/acme/next.js')).toEqual({ owner: 'acme', name: 'next.js' });
  });

  it.each([
    'https://evil.example/x?github.com/a/b',
    'https://evil.example/github.com/a/b',
    'http://github.com/a/b',
    'https://github.com/../victim',
    'https://github.com/a/..',
    'https://github.com/a/b/c',
  ])('rejects %s', (url) => {
    expect(() => parseRepoUrl(url)).toThrow();
  });
});

describe('SimpleGitClient.clonePathFor', () => {
  const git = new SimpleGitClient('/tmp/devdigest-clones');
  it('stays under the clone root', () => {
    expect(git.clonePathFor({ owner: 'acme', name: 'widgets' })).toBe('/tmp/devdigest-clones/acme/widgets');
  });
  it('refuses to escape the clone root', () => {
    expect(() => git.clonePathFor({ owner: '..', name: 'x' })).toThrow(/outside/);
    expect(() => git.clonePathFor({ owner: 'a', name: '../../x' })).toThrow(/outside/);
  });
});
