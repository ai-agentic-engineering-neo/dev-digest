/** onboarding — pure helpers (ring 2). Unit-testable without any double. */

import type { ChatMessage, Onboarding, OnboardingDraft } from '@devdigest/shared';
import {
  EXCLUDED_TREE_SEGMENTS,
  MANIFEST_FILES,
  MAX_ERROR_CHARS,
  MAX_FILE_CHARS,
  MAX_FIRST_TASKS,
  MAX_TREE_PATHS,
  README_PATTERN,
  SECTION_TITLES,
} from './constants.js';

/** A file read from the repo, as sent to the model. */
export interface InputFile {
  path: string;
  content: string;
}

export type Sections = Onboarding['sections'];

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const depth = (p: string) => p.split('/').length - 1;

/** Drop dependency/build folders from a listed tree. */
export function filterTree(paths: readonly string[]): string[] {
  return paths.filter((p) => !EXCLUDED_TREE_SEGMENTS.some((seg) => p.startsWith(seg) || p.includes(`/${seg}`)));
}

/**
 * Which files to read, in priority order: root README, manifests at the root
 * and one folder down, then the top-ranked files, then files on dependency
 * chains. Deduped; only paths present in the tree.
 */
export function selectInputPaths(tree: readonly string[], ranked: readonly string[], chains: readonly string[][]): string[] {
  const inTree = new Set(tree);
  const readme = tree.filter((p) => depth(p) === 0 && README_PATTERN.test(p)).sort();
  const manifests = tree
    .filter((p) => depth(p) <= 1 && MANIFEST_FILES.includes(baseName(p).toLowerCase()))
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [...readme.slice(0, 1), ...manifests, ...ranked, ...chains.flat()]) {
    if (seen.has(p) || !inTree.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Cut text to the per-file cap, on a line boundary, with a marker. */
export function truncate(text: string, max = MAX_FILE_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const nl = cut.lastIndexOf('\n');
  return `${nl > max / 2 ? cut.slice(0, nl) : cut}\n... [truncated]`;
}

/** Escape a value placed inside a double-quoted attribute. */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A closing tag inside data must not end the untrusted block early. */
function neutralize(text: string): string {
  return text.replace(/<\/untrusted/gi, '<\\/untrusted');
}

const untrusted = (source: string, text: string) =>
  `<untrusted source="${escapeAttr(source)}">\n${neutralize(text)}\n</untrusted>`;

/** Messages for the generation call. Everything read from the repo is data, wrapped as untrusted. */
export function buildMessages(input: {
  repoFullName: string;
  systemPrompt: string;
  files: readonly InputFile[];
  tree: readonly string[];
  chains: readonly string[][];
  limited: boolean;
}): ChatMessage[] {
  const parts: string[] = [`Repository: ${input.repoFullName}`];
  if (input.limited) {
    parts.push('The code index is unavailable: work only from the file tree and the files below. Do not guess about code you were not given.');
  }
  const shown = input.tree.slice(0, MAX_TREE_PATHS);
  const more = input.tree.length - shown.length;
  parts.push(`File tree (${input.tree.length} files${more > 0 ? `, first ${shown.length} shown` : ''}):`);
  parts.push(untrusted('file-tree', shown.join('\n')));
  if (input.chains.length > 0) {
    parts.push('Dependency chains between central files:');
    parts.push(untrusted('dependency-chains', input.chains.map((c) => c.join(' -> ')).join('\n')));
  }
  parts.push(`Files read (${input.files.length}):`);
  for (const f of input.files) parts.push(untrusted(f.path, f.content));
  return [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** The script names of a package.json text; tolerates invalid JSON and odd shapes. */
export function scriptsFrom(packageJsonText: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(packageJsonText);
    const scripts = (parsed as { scripts?: unknown } | null)?.scripts;
    if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) return new Set(Object.keys(scripts));
  } catch {
    // truncated or invalid manifest: no scripts
  }
  return new Set();
}

/** Trim and strip a leading shell prompt (`$ `). */
export function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/^\$\s+/, '').trim();
}

/** Every non-empty normalized line of a text (README, compose, Makefile, .env.example). */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeCommand)
    .filter(Boolean);
}

export interface CommandContext {
  /** Script names across every read package.json. */
  scripts: ReadonlySet<string>;
  /** Normalized lines of every read README/compose/Makefile/.env.example. */
  lines: ReadonlySet<string>;
  /** True when at least one package.json was read. */
  hasPackageJson?: boolean;
}

const RUNNER = /^(npm|pnpm|yarn|bun)(\s+run)?\s+([A-Za-z0-9:_.-]+)$/;

/** AC-29: a package.json script (any package manager) or a verbatim line of a read file. Commands are never executed. */
export function isVerifiedCommand(cmd: string, ctx: CommandContext): boolean {
  const c = normalizeCommand(cmd);
  if (!c) return false;
  const m = RUNNER.exec(c);
  if (m) {
    const [, mgr, run, script] = m as unknown as [string, string, string | undefined, string];
    if (ctx.scripts.has(script)) {
      // `npm <script>` is only valid for the built-ins; everything else needs `run`.
      if (mgr !== 'npm' || run || script === 'start' || script === 'test') return true;
    }
    if (mgr === 'npm' && !run && (script === 'start' || script === 'test') && ctx.hasPackageJson) return true;
  }
  return ctx.lines.has(c);
}

const normPath = (p: string) => p.trim().replace(/^\.\//, '');

export interface VerifyContext extends CommandContext {
  allowedPaths: ReadonlySet<string>;
}

/** Every path the draft cites, normalized (for the index-membership lookup). */
export function draftPaths(draft: OnboardingDraft): string[] {
  const out = new Set<string>();
  for (const i of draft.critical_paths.items) out.add(normPath(i.path));
  for (const i of draft.reading_path.items) out.add(normPath(i.path));
  for (const t of draft.first_tasks.items) for (const f of t.files) out.add(normPath(f.path));
  return [...out].filter(Boolean);
}

/**
 * AC-28..AC-31 + D4: drop paths that are not allowed and commands that are not
 * verified, keep the model order, drop first tasks left with no file, cap them.
 */
export function verifyDraft(draft: OnboardingDraft, ctx: VerifyContext): Sections {
  const ok = (p: string) => ctx.allowedPaths.has(normPath(p));
  const pathItems = (items: readonly { path: string; why: string }[]) =>
    items.filter((i) => ok(i.path)).map((i) => ({ path: normPath(i.path), why: i.why.trim() }));
  const diagram = draft.architecture.diagram?.trim() ? draft.architecture.diagram.trim() : null;
  const tasks = draft.first_tasks.items
    .map((t) => ({
      title: t.title.trim(),
      why: t.why.trim(),
      files: t.files.filter((f) => ok(f.path)).map((f) => ({ path: normPath(f.path) })),
    }))
    .filter((t) => t.files.length > 0)
    .slice(0, MAX_FIRST_TASKS);
  return [
    { kind: 'architecture', title: SECTION_TITLES.architecture, body: draft.architecture.body, diagram },
    { kind: 'critical_paths', title: SECTION_TITLES.critical_paths, items: pathItems(draft.critical_paths.items) },
    {
      kind: 'run_locally',
      title: SECTION_TITLES.run_locally,
      items: draft.run_locally.items
        .filter((i) => isVerifiedCommand(i.command, ctx))
        .map((i) => ({ command: normalizeCommand(i.command), note: i.note?.trim() ? i.note.trim() : null })),
    },
    { kind: 'reading_path', title: SECTION_TITLES.reading_path, items: pathItems(draft.reading_path.items) },
    { kind: 'first_tasks', title: SECTION_TITLES.first_tasks, items: tasks },
  ];
}

export interface TourMeta {
  generatedAt: Date;
  provider: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  filesIndexed: number;
  limited: boolean;
}

export function toTour(sections: Sections, meta: TourMeta): Onboarding {
  return {
    generated_at: meta.generatedAt.toISOString(),
    provider: meta.provider,
    model: meta.model,
    tokens_in: meta.tokensIn,
    tokens_out: meta.tokensOut,
    cost_usd: meta.costUsd,
    files_indexed: meta.filesIndexed,
    limited: meta.limited,
    sections,
  };
}

/** AC-38: the tour is stale when the index or the repo sync is newer than it. */
export function isStale(generatedAt: Date, indexUpdatedAt: Date | null, lastPolledAt: Date | null): boolean {
  const g = generatedAt.getTime();
  return (indexUpdatedAt?.getTime() ?? 0) > g || (lastPolledAt?.getTime() ?? 0) > g;
}

/** A structured-output schema failure (as opposed to a provider or network error). */
export function isSchemaFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'ZodError' || /schema/i.test(err.message);
}

/** Error text stored on a run: one capped string. */
export function runErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}...` : text;
}
