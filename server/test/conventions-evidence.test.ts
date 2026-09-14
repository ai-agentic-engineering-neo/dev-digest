import { describe, it, expect } from 'vitest';
import { findSnippetLines } from '../src/modules/conventions/evidence.js';

/**
 * Evidence verification — the step that makes "every candidate has real
 * code" true by construction. A candidate whose snippet doesn't actually
 * appear in the file it cites must be dropped, never persisted.
 */
describe('findSnippetLines', () => {
  const file = [
    "import { db } from './db';",
    '',
    'export async function getUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  return user;',
    '}',
  ].join('\n');

  it('finds a single-line snippet and returns its 1-indexed line', () => {
    const range = findSnippetLines(file, '  const user = await db.users.find(id);');
    expect(range).toEqual({ startLine: 4, endLine: 4 });
  });

  it('finds a multi-line snippet as a contiguous range', () => {
    const range = findSnippetLines(
      file,
      'export async function getUser(id: string) {\n  const user = await db.users.find(id);',
    );
    expect(range).toEqual({ startLine: 3, endLine: 4 });
  });

  it('tolerates re-indentation (whitespace-normalized match)', () => {
    const range = findSnippetLines(file, '    const   user = await db.users.find(id);');
    expect(range).toEqual({ startLine: 4, endLine: 4 });
  });

  it('trims wholly-blank leading/trailing lines from the snippet', () => {
    const range = findSnippetLines(file, '\n  const user = await db.users.find(id);\n\n');
    expect(range).toEqual({ startLine: 4, endLine: 4 });
  });

  it('returns null when the snippet does not appear — candidate must be dropped', () => {
    const range = findSnippetLines(file, 'const totallyMadeUp = 42;');
    expect(range).toBeNull();
  });

  it('returns null for a snippet that is real code but from a different function', () => {
    const range = findSnippetLines(file, 'const user = await db.posts.find(id);');
    expect(range).toBeNull();
  });
});
