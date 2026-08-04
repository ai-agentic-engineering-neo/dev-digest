/**
 * Language registry — the single source of truth for "which file extensions
 * does repo-intel index at all." Replaces what used to be three independently
 * maintained copies of the same allowlist (repo-intel/constants.ts,
 * adapters/codeindex/ripgrep.ts, adapters/astgrep/index.ts's SUPPORTED_EXT
 * re-import) — the "added a language to one allowlist, forgot the other two"
 * risk this closes.
 *
 * Extension-level only: this does NOT decide which ast-grep grammar or which
 * concrete parser module handles a file — that's `adapters/astgrep/index.ts`'s
 * job (it needs finer-grained info than a language id, e.g. TS vs Tsx vs JS
 * per extension). This registry answers exactly one question: is this
 * extension indexed at all, and which language bucket does it belong to.
 */
import { extname } from 'node:path';

export interface LanguageDef {
  id: string;
  /** Human-readable name, e.g. for a review prompt's "languages touched" framing. */
  label: string;
  extensions: readonly string[];
}

export const LANGUAGES: readonly LanguageDef[] = [
  {
    id: 'typescript',
    label: 'TypeScript/JavaScript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  { id: 'go', label: 'Go', extensions: ['.go'] },
];

/** Flattened list of every indexed extension, across every language. */
export const SUPPORTED_EXT: readonly string[] = LANGUAGES.flatMap((l) => l.extensions);

export const SUPPORTED_EXT_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

const LANG_BY_EXT: ReadonlyMap<string, string> = new Map(
  LANGUAGES.flatMap((l) => l.extensions.map((ext) => [ext, l.id] as const)),
);

/** Language id for a file's extension, or null when it's not indexed. */
export function languageIdForFile(file: string): string | null {
  return LANG_BY_EXT.get(extname(file).toLowerCase()) ?? null;
}

const LABEL_BY_ID: ReadonlyMap<string, string> = new Map(LANGUAGES.map((l) => [l.id, l.label]));

/** Human-readable label for a language id, falling back to the id itself. */
export function labelForLanguageId(id: string): string {
  return LABEL_BY_ID.get(id) ?? id;
}

/**
 * The distinct, sorted set of language ids present across `files` — e.g. for
 * persisting `repo_index_state.languages` (Phase 5). Files with no
 * recognized extension are silently excluded, same as everywhere else this
 * registry gates indexing.
 */
export function languagesPresent(files: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const f of files) {
    const id = languageIdForFile(f);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}
