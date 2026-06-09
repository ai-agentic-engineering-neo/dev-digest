/**
 * A3 — pure helpers for the onboarding generator (extracted from service.ts; no
 * behaviour change). Side-effect free; operate purely on their arguments.
 */
import type { Onboarding, OnboardingSection } from '@devdigest/shared';
import {
  MAX_QUERY_TOKENS,
  MAX_SECTION_LINKS,
  MIN_TOKEN_LEN,
  SECTION_PLAN,
  SKELETON_EXCERPT_CHARS,
  SKELETON_LINK_RE,
} from './constants.js';
import type { RepoFacts } from './analyzer.js';

/** True when `v` is a plain object (not null, not an array). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Dedupe an array, preserving first-seen order. */
export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Normalize an extracted route/endpoint path: template literals → :param, drop query/hash. */
export function cleanPath(p: string): string {
  return p
    .replace(/\$\{[^}]*\}/g, ':param')
    .replace(/[?#].*$/, '')
    .trim();
}

/** Split a RAG query into the keyword tokens used by the ILIKE fallback. */
export function queryTokens(query: string): string[] {
  return query
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > MIN_TOKEN_LEN)
    .slice(0, MAX_QUERY_TOKENS);
}

/** Score chunk contents by how many query tokens they mention; top-k descending. */
export function scoreChunks(
  rows: { content: string }[],
  tokens: string[],
  topK: number,
): string[] {
  return rows
    .map((r) => ({
      content: r.content,
      score: tokens.reduce((n, tok) => n + (r.content.toLowerCase().includes(tok) ? 1 : 0), 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.content);
}

/** Deterministic fallback so onboarding always yields a well-formed section. */
export function skeletonSection(
  plan: { kind: string; title: string },
  context: string[],
  tree: string[],
): OnboardingSection {
  const excerpt = context[0]?.slice(0, SKELETON_EXCERPT_CHARS);
  const body = excerpt
    ? `_Generated without an LLM (no API key configured)._\n\nRelevant context for **${plan.title}**:\n\n> ${excerpt.replace(/\n/g, ' ')}`
    : `_Generated without an LLM and with no indexed context yet._\n\nRe-index the project context and configure an OpenAI key, then regenerate to populate the **${plan.title}** section.`;
  const links = tree
    .filter((p) => SKELETON_LINK_RE.test(p))
    .slice(0, MAX_SECTION_LINKS)
    .map((p) => ({ label: p.split('/').pop() ?? p, path: p }));
  return { kind: plan.kind, title: plan.title, body, diagram: null, links };
}

/** Compact, model-friendly summary of the precomputed repo facts. */
export function buildFactsBlock(facts: RepoFacts): string {
  const top = Object.entries(facts.size.byTopFolder)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([dir, n]) => `${dir} (${n})`)
    .join(', ');
  const lines = [
    `name: ${facts.name ?? '(unknown)'}`,
    facts.description ? `description: ${facts.description}` : '',
    `shape: ${facts.flavor}${facts.isMonorepo ? ' (monorepo)' : ''}`,
    `packageManager: ${facts.packageManager}`,
    `frameworks: ${facts.frameworks.join(', ') || '(none detected)'}`,
    `services (from deps): ${facts.services.join(', ') || '(none detected)'}`,
    `size: ${facts.size.totalFiles} files, ${facts.size.codeFiles} code files, ${facts.size.workspacePackages} workspace packages`,
    `top folders: ${top}`,
    `scripts: ${Object.entries(facts.scripts).map(([k, v]) => `${k}="${v}"`).join('; ') || '(none)'}`,
    `dependencies: ${facts.dependencies.join(', ') || '(none)'}`,
    `tests: runner=${facts.tests.runner ?? 'none'}, testFiles=${facts.tests.testFiles}, coverage=${facts.tests.coveragePct != null ? facts.tests.coveragePct + '%' : 'not measured'}`,
    `frontend routes (${facts.frontendRoutes.length}): ${facts.frontendRoutes.slice(0, 40).join(', ') || '(none)'}`,
    `api endpoints (${facts.apiEndpoints.length}): ${facts.apiEndpoints.slice(0, 50).map((e) => `${e.method} ${e.path}`).join(', ') || '(none)'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

/** Key-file excerpts, delimited so the model can quote real paths. */
export function buildKeyFilesBlock(facts: RepoFacts): string {
  if (facts.keyFiles.length === 0) return '(no key files extracted)';
  return facts.keyFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.excerpt}\n\`\`\``)
    .join('\n\n');
}

/**
 * Deterministic full-tour fallback built purely from facts — used when no LLM
 * is available or the call fails. Honest about being non-LLM; never claims a
 * missing key when the real cause was elsewhere.
 */
export function skeletonTour(facts: RepoFacts, note?: string): Onboarding {
  const prefix = note ? `_${note}_\n\n` : '_Generated locally without an LLM._\n\n';
  const byKind: Record<string, string> = {
    overview: `${prefix}**${facts.name ?? 'Project'}** — ${facts.description ?? 'no description'}.\n\nShape: ${facts.flavor}${facts.isMonorepo ? ' (monorepo)' : ''}. Size: ${facts.size.totalFiles} files, ${facts.size.codeFiles} code files.`,
    tech_stack: `${prefix}Frameworks: ${facts.frameworks.join(', ') || 'n/a'}.\n\nServices: ${facts.services.join(', ') || 'n/a'}.\n\nDependencies: ${facts.dependencies.slice(0, 30).join(', ') || 'n/a'}.`,
    architecture: `${prefix}Top-level folders: ${facts.topFolders.join(', ') || 'n/a'}.`,
    routes_and_apis: `${prefix}Frontend routes: ${facts.frontendRoutes.slice(0, 30).join(', ') || 'n/a'}.\n\nAPI endpoints: ${facts.apiEndpoints.slice(0, 30).map((e) => `${e.method} ${e.path}`).join(', ') || 'n/a'}.`,
    getting_started: `${prefix}Scripts: ${Object.keys(facts.scripts).join(', ') || 'n/a'}.\n\nTests: ${facts.tests.runner ?? 'none'} (${facts.tests.testFiles} files).`,
  };
  const sections: OnboardingSection[] = SECTION_PLAN.map((p) => ({
    kind: p.kind,
    title: p.title,
    body: byKind[p.kind] ?? `${prefix}(no data)`,
    diagram: null,
    links: facts.keyFiles.slice(0, MAX_SECTION_LINKS).map((f) => ({
      label: f.path.split('/').pop() ?? f.path,
      path: f.path,
    })),
  }));
  return { sections };
}
