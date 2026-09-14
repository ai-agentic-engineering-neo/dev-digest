/**
 * specs/09-project-context-folder.md — the skill Preview tab's `## Project
 * context` renderer (AC-13/D1). Must match reviewer-core's `assemblePrompt`
 * rendering byte-for-byte (`_shared/project-context-render.ts`'s doc
 * comment): same heading, same `wrapUntrusted` join, same omit-when-empty
 * contract.
 */
import { describe, it, expect } from 'vitest';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { renderProjectContextBlock } from '../src/modules/_shared/project-context-render.js';

describe('renderProjectContextBlock', () => {
  it('AC-16/AC-34 — returns null for an empty document list, mirroring assemblePrompt omit-when-empty', () => {
    expect(renderProjectContextBlock([])).toBeNull();
  });

  it('renders the heading followed by each document wrapped as untrusted content', () => {
    const docs = [
      { path: 'specs/a.md', content: '# A' },
      { path: 'docs/b.md', content: '# B' },
    ];
    const block = renderProjectContextBlock(docs);
    expect(block).toBe(
      `## Project context\n${wrapUntrusted('specs/a.md', '# A')}\n\n${wrapUntrusted('docs/b.md', '# B')}`,
    );
  });

  it('a single document has no join separator artifact', () => {
    const block = renderProjectContextBlock([{ path: 'specs/only.md', content: 'body' }]);
    expect(block).toBe(`## Project context\n${wrapUntrusted('specs/only.md', 'body')}`);
  });
});
