import { describe, it, expect } from 'vitest';
import { isOwnedBy, stalePathsToPrune } from './tree-prune.js';

/**
 * The regression these guard: a manifest path changed from the fixed
 * `.devdigest/agents/agent.yaml` to a derived `<name>-<hash>.yaml`, and the
 * old file stayed on the branch — so the runner read the same agent twice,
 * once from the orphan. See burnjohn/quick-blog#28.
 */

const OWNED = ['.devdigest'];

describe('stalePathsToPrune', () => {
  it('deletes a generated file the new bundle no longer writes', () => {
    const existing = [
      '.devdigest/agents/agent.yaml', // the orphan from the old naming scheme
      '.devdigest/agents/general-reviewer-9833590c.yaml',
      '.devdigest/runner/310.index.js', // the orphaned ncc chunk
      '.devdigest/runner/300.index.js',
    ];
    const written = ['.devdigest/agents/general-reviewer-9833590c.yaml', '.devdigest/runner/300.index.js'];

    expect(stalePathsToPrune(existing, written, OWNED)).toEqual([
      '.devdigest/agents/agent.yaml',
      '.devdigest/runner/310.index.js',
    ]);
  });

  it('never touches a file outside the owned directories, however unrelated the bundle is to it', () => {
    const existing = ['README.md', 'src/index.ts', '.github/workflows/ci.yml'];
    expect(stalePathsToPrune(existing, [], OWNED)).toEqual([]);
  });

  it('matches on whole path segments, so a sibling directory with the same prefix is safe', () => {
    // `.devdigest-backup/` starts with `.devdigest` as a STRING but is not
    // inside it; a bare startsWith would delete someone else's files.
    expect(stalePathsToPrune(['.devdigest-backup/agents/agent.yaml'], [], OWNED)).toEqual([]);
  });

  it('prunes nothing when no directory is claimed — an additive commit stays additive', () => {
    expect(stalePathsToPrune(['.devdigest/agents/agent.yaml'], [], [])).toEqual([]);
  });

  it('keeps a file that is being rewritten this commit', () => {
    const path = '.devdigest/memory.jsonl';
    expect(stalePathsToPrune([path], [path], OWNED)).toEqual([]);
  });
});

describe('isOwnedBy', () => {
  it('owns the directory itself and everything below it, at any depth', () => {
    expect(isOwnedBy('.devdigest', '.devdigest')).toBe(true);
    expect(isOwnedBy('.devdigest/a/b/c.yaml', '.devdigest')).toBe(true);
  });

  it('does not own a path that merely starts with the same characters', () => {
    expect(isOwnedBy('.devdigestile', '.devdigest')).toBe(false);
  });
});
