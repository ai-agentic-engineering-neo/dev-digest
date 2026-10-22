import { describe, it, expect } from 'vitest';
import { findSnippetLines } from '../src/modules/conventions/evidence.js';

const FILE = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

describe('findSnippetLines', () => {
  it('returns the 1-indexed range of an exact multi-line match', () => {
    const snippet = '  const user = await db.users.find(id);\n  const posts = await db.posts.findMany({ userId: id });';
    expect(findSnippetLines(FILE, snippet)).toEqual({ startLine: 4, endLine: 5 });
  });

  it('tolerates re-indentation, internal whitespace and blank edge lines', () => {
    const snippet = '\n\nconst   user = await db.users.find(id);\n    const posts = await db.posts.findMany({ userId: id });\n\n';
    expect(findSnippetLines(FILE, snippet)).toEqual({ startLine: 4, endLine: 5 });
  });

  it('matches at the very first and last lines', () => {
    expect(findSnippetLines(FILE, "import { db } from '../db';")).toEqual({ startLine: 1, endLine: 1 });
    expect(findSnippetLines(FILE, '  return { user, posts };\n}')).toEqual({ startLine: 6, endLine: 7 });
  });

  it('returns null for paraphrased, partial-line or empty snippets', () => {
    expect(findSnippetLines(FILE, 'const user = await db.users.findOne(id);')).toBeNull();
    expect(findSnippetLines(FILE, 'await db.users.find(id)')).toBeNull();
    expect(findSnippetLines(FILE, '   \n  ')).toBeNull();
  });

  it('handles CRLF files', () => {
    expect(findSnippetLines(FILE.replace(/\n/g, '\r\n'), '  return { user, posts };')).toEqual({ startLine: 6, endLine: 6 });
  });
});
