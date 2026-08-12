/**
 * specs/09-project-context-folder.md — discovery (AC-1, AC-2, AC-20, AC-28,
 * AC-29). No DB: a real tmpdir fixture checkout, modeled on
 * `test/indexer-walk.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverDocuments, labelFor } from '../src/modules/project-context/discovery.js';
import { MAX_DOC_BYTES, docTypeLabel } from '../src/modules/project-context/constants.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

describe('docTypeLabel', () => {
  it('is the lowercased last path segment', () => {
    expect(docTypeLabel('specs')).toBe('specs');
    expect(docTypeLabel('.devdigest/specs')).toBe('specs');
    expect(docTypeLabel('Docs')).toBe('docs');
  });
});

describe('discoverDocuments', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-context-discovery-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists .md files under the configured roots, sorted, with the matched-root label', async () => {
    await writeFileAt(root, 'specs/09-project-context-folder.md', '# spec');
    await writeFileAt(root, 'docs/readme.md', '# doc');
    await writeFileAt(root, 'src/index.ts', 'export {}'); // not markdown — excluded

    const { documents } = await discoverDocuments(root, ['specs', 'docs']);
    expect(documents.map((d) => d.path)).toEqual(['docs/readme.md', 'specs/09-project-context-folder.md']);
    const spec = documents.find((d) => d.path.startsWith('specs/'))!;
    expect(labelFor(spec)).toBe('specs');
  });

  it('AC-2/AC-29 — changing the roots changes the listing', async () => {
    await writeFileAt(root, 'specs/a.md', '# a');
    await writeFileAt(root, '.devdigest/specs/b.md', '# b');

    const before = await discoverDocuments(root, ['specs']);
    expect(before.documents.map((d) => d.path)).toEqual(['specs/a.md']);

    const after = await discoverDocuments(root, ['.devdigest/specs']);
    expect(after.documents.map((d) => d.path)).toEqual(['.devdigest/specs/b.md']);
  });

  it('AC-20 — a root that does not exist yields an empty (not errored) result', async () => {
    const { documents, stats } = await discoverDocuments(root, ['specs']);
    expect(documents).toEqual([]);
    expect(stats.bounded).toBe(0);
  });

  it('AC-28 — excludes a symlink that escapes the checkout', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'project-context-discovery-outside-'));
    await writeFile(join(outside, 'evil.md'), '# evil');
    await mkdir(join(root, 'specs'), { recursive: true });
    await symlink(join(outside, 'evil.md'), join(root, 'specs', 'evil.md'));
    await writeFileAt(root, 'specs/real.md', '# real');

    const { documents } = await discoverDocuments(root, ['specs']);
    expect(documents.map((d) => d.path)).toEqual(['specs/real.md']);
    await rm(outside, { recursive: true, force: true });
  });

  it('AC-28 — excludes a file over MAX_DOC_BYTES and records it in skippedTooLarge', async () => {
    await writeFileAt(root, 'specs/small.md', '# small');
    await writeFileAt(root, 'specs/big.md', 'x'.repeat(MAX_DOC_BYTES + 1));

    const { documents, stats } = await discoverDocuments(root, ['specs']);
    expect(documents.map((d) => d.path)).toEqual(['specs/small.md']);
    expect(stats.skippedTooLarge).toBe(1);
  });

  it('a document under a nested root is attributed to the FIRST configured root that contains it', async () => {
    // '.devdigest/specs' is not nested under 'specs' by construction, so build
    // an explicit nesting case: 'docs' contains 'docs/internal'.
    await writeFileAt(root, 'docs/internal/x.md', '# x');

    const { documents } = await discoverDocuments(root, ['docs', 'docs/internal']);
    expect(documents).toHaveLength(1);
    expect(labelFor(documents[0]!)).toBe('docs'); // first-matching-root wins
  });
});
