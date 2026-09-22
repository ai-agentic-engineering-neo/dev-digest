/**
 * The parse step shared by the full and incremental indexers: read one file
 * from the clone, hash it, run the source analyzer under a per-file watchdog,
 * and buffer the resulting rows. Outcomes are reported, never thrown.
 */
import { createHash } from 'node:crypto';
import { withTimeout } from '../../../platform/resilience.js';
import { MAX_PARSE_MS_PER_FILE } from '../constants.js';
import type {
  IndexerFileFactsRow,
  IndexerReferenceRow,
  IndexerSymbolRow,
} from '../domain/model.js';
import type { CloneFiles, SourceAnalyzer } from './ports.js';

/** Rows the parse phase accumulates before the persist transaction. */
export interface ParseBuffers {
  symbols: IndexerSymbolRow[];
  references: IndexerReferenceRow[];
  facts: IndexerFileFactsRow[];
}

export function emptyBuffers(): ParseBuffers {
  return { symbols: [], references: [], facts: [] };
}

export type ParseOutcome =
  | { kind: 'indexed' }
  /** Extension the analyzer doesn't parse — skipped without a reason. */
  | { kind: 'unsupported' }
  /** Unreadable file or parser failure / timeout. */
  | { kind: 'failed'; reason: string };

/**
 * Parse `relPath` of the clone at `root` into `buf`. Symbols, references and
 * per-file facts (endpoints/crons, so blast reads `file_facts` instead of
 * re-parsing the clone) are appended only when the whole file parsed.
 */
export async function parseSourceFile(
  deps: { analyzer: SourceAnalyzer; files: CloneFiles },
  repoId: string,
  root: string,
  relPath: string,
  buf: ParseBuffers,
): Promise<ParseOutcome> {
  if (!deps.analyzer.supports(relPath)) return { kind: 'unsupported' };
  let source: string;
  try {
    source = await deps.files.read(root, relPath);
  } catch (err) {
    return { kind: 'failed', reason: asMessage(err) };
  }
  const contentHash = sha1(source);
  try {
    // Per-file watchdog — a pathological file shouldn't burn the whole budget.
    // The analyzer is synchronous, so it is wrapped in a promise and raced.
    const parsed = await withTimeout(
      Promise.resolve().then(() => ({
        symbols: deps.analyzer.symbols(relPath, source),
        references: deps.analyzer.references(relPath, source),
      })),
      MAX_PARSE_MS_PER_FILE,
    );
    for (const s of parsed.symbols) {
      buf.symbols.push({
        repoId,
        path: relPath,
        name: s.name,
        kind: s.kind,
        line: s.line,
        endLine: s.endLine,
        exported: s.exported,
        signature: s.signature,
        contentHash,
      });
    }
    for (const r of parsed.references) {
      buf.references.push({ repoId, fromPath: relPath, toSymbol: r.toSymbol, line: r.line, contentHash });
    }
    const endpoints = deps.analyzer.endpoints(source);
    const crons = deps.analyzer.crons(source);
    if (endpoints.length > 0 || crons.length > 0) {
      buf.facts.push({ filePath: relPath, endpoints, crons });
    }
    return { kind: 'indexed' };
  } catch (err) {
    return { kind: 'failed', reason: asMessage(err) };
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function forEachBounded<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
}

export function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
