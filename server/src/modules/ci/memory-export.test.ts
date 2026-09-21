import { describe, it, expect } from 'vitest';
import { buildMemoryJsonl, parseMemoryJsonl, type MemoryExportRow } from './memory-export.js';

/**
 * specs/14-export-to-ci.md (P2) — `buildMemoryJsonl`/`parseMemoryJsonl`.
 * AC-58 — only `kind`/`content` ever survive into a row, never `embedding`/
 * `sources`/`confidence`. AC-58a — zero rows still produces a valid, never
 * omitted, never-failing empty document.
 */

describe('buildMemoryJsonl', () => {
  it('AC-58a — zero rows produces a valid empty string, never a thrown error or a placeholder', () => {
    expect(buildMemoryJsonl([])).toBe('');
  });

  it('AC-58a — an empty document round-trips to zero parsed rows', () => {
    expect(parseMemoryJsonl(buildMemoryJsonl([]))).toEqual([]);
  });

  it('AC-58 — carries ONLY kind+content per row, one JSON object per line, even if the row object carries extra fields', () => {
    const rows = [
      // A caller-provided row that (incorrectly) also carries fields this
      // export must never leak — `buildMemoryJsonl`'s own type only accepts
      // kind/content, but this proves the OUTPUT itself has no other keys
      // even when cast past the type.
      { kind: 'pattern', content: 'Prefer named exports.', embedding: [0.1, 0.2], sources: ['finding-1'], confidence: 0.9 } as unknown as MemoryExportRow,
      { kind: 'gotcha', content: 'Watch for N+1 queries in list endpoints.' },
    ];
    const jsonl = buildMemoryJsonl(rows);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(Object.keys(parsed).sort()).toEqual(['content', 'kind']);
    }
    expect(jsonl).not.toContain('embedding');
    expect(jsonl).not.toContain('sources');
    expect(jsonl).not.toContain('confidence');
  });

  it('round-trips real rows through buildMemoryJsonl -> parseMemoryJsonl unchanged', () => {
    const rows: MemoryExportRow[] = [
      { kind: 'pattern', content: 'Use the shared AgentLookup port, never a direct cross-module import.' },
      { kind: 'gotcha', content: 'ConfigError responds 500, not 4xx.' },
    ];
    expect(parseMemoryJsonl(buildMemoryJsonl(rows))).toEqual(rows);
  });

  it('every line is independently parseable JSON (true JSONL, not a single JSON array)', () => {
    const rows: MemoryExportRow[] = [
      { kind: 'a', content: 'one' },
      { kind: 'b', content: 'two' },
      { kind: 'c', content: 'three' },
    ];
    const jsonl = buildMemoryJsonl(rows);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
