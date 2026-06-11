import { and, eq, sql } from 'drizzle-orm';
import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { Onboarding, OnboardingSection } from '@devdigest/shared';
import { Onboarding as OnboardingSchema } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import {
  buildSystemPrompt,
  DEFAULT_LANG,
  KEYWORD_SCAN_LIMIT,
  ONBOARDING_MAX_RETRIES,
  ONBOARDING_MODEL,
  ONBOARDING_PROVIDER,
  RETRIEVE_TOP_K,
  SECTION_PLAN,
  TREE_IGNORE_DIRS,
  TREE_MAX_DEPTH,
  TREE_MAX_ENTRIES,
  TREE_MAX_FILE_BYTES,
  type OnboardingLang,
} from './constants.js';
import {
  buildFactsBlock,
  buildKeyFilesBlock,
  queryTokens,
  scoreChunks,
  skeletonTour,
} from './helpers.js';
import { analyzeRepo, emptyFacts } from './analyzer.js';

/** A mermaid diagram must start with a known graph keyword. */
const MERMAID_RE =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

/**
 * Keep `diagram` only if it's a real mermaid string. The model sometimes emits
 * junk (empty string, prose, even a serialized Buffer like {"type":"Buffer"…})
 * for sections that should have no diagram — store null instead so the UI never
 * tries to render garbage.
 */
function sanitizeDiagram(d: unknown): string | null {
  if (typeof d !== 'string') return null;
  const s = d
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  return MERMAID_RE.test(s) ? s : null;
}

/** Minimal structured logger (pino-compatible: (obj, msg)). */
type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

export interface GenerateOptions {
  lang?: OnboardingLang;
  logger?: Logger;
}

/**
 * A3 — Onboarding generator (L05, §7).
 *
 * Deterministic local analysis (analyzer.ts) computes the hard facts (stack,
 * services, structure, routes/APIs, tests, key files); ONE structured LLM call
 * turns those facts + a combined RAG retrieval into the 5-section `Onboarding`
 * tour (overview · tech_stack · architecture · routes_and_apis · getting_started),
 * persisted one-per-repo. Degrades to a deterministic, fact-based skeleton if
 * the repo is not JS/TS or the LLM call fails — and logs the real reason.
 */
export class OnboardingService {
  constructor(private container: Container) {}

  async get(repoId: string): Promise<Onboarding | undefined> {
    const [row] = await this.container.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row?.json as Onboarding | undefined;
  }

  async generate(
    workspaceId: string,
    repoId: string,
    opts: GenerateOptions = {},
  ): Promise<Onboarding> {
    const lang = opts.lang ?? DEFAULT_LANG;
    const log = opts.logger;

    const [repo] = await this.container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!repo) throw new NotFoundError('Repo not found');

    if (!repo.clonePath) {
      return this.persist(
        repoId,
        skeletonTour(emptyFacts('Repo is not cloned yet.'), 'Repo is not cloned yet.'),
      );
    }

    // 1. deterministic local facts (~0 tokens)
    const facts = await analyzeRepo(repo.clonePath);

    // T3: reading path = top files by import-graph rank ∪ critical dependency
    // paths (rank first, then chain order). Reorders the existing key files so
    // "read these first" is computed, not guessed. Degrades to the heuristic
    // order when repo-intel is off / unindexed (both calls → empty).
    try {
      const [top, critical] = await Promise.all([
        this.container.repoIntel.getTopFilesByRank(repoId, 7),
        this.container.repoIntel.getCriticalPaths(repoId),
      ]);
      const ordered = [...top, ...critical.flat()];
      if (ordered.length > 0) {
        const order = new Map<string, number>();
        ordered.forEach((p, i) => {
          if (!order.has(p)) order.set(p, i);
        });
        facts.keyFiles = [...facts.keyFiles].sort(
          (a, b) =>
            (order.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.path) ?? Number.MAX_SAFE_INTEGER),
        );
      }
    } catch {
      /* keep the heuristic key-file order */
    }

    const tree = await this.fileTree(repo.clonePath);

    // 2. JS/TS-only gate — no LLM call for unsupported projects
    if (!facts.isJsTs) {
      log?.info({ repoId, reason: facts.reason }, 'onboarding: skipped LLM (unsupported project)');
      return this.persist(repoId, skeletonTour(facts, facts.reason));
    }

    // 3. one combined RAG retrieval (was 5 separate)
    const query = SECTION_PLAN.map((s) => s.query).join(' ');
    const context = await this.retrieve(repoId, query);

    // 4. ONE structured LLM call → full Onboarding
    const system = await buildSystemPrompt(lang);
    const user = [
      `Repo: ${repo.fullName}. Generate the onboarding tour.`,
      `## FACTS (precomputed — trust these)\n${wrapUntrusted('facts', buildFactsBlock(facts))}`,
      tree.length ? `## File tree\n${wrapUntrusted('tree', tree.join('\n'))}` : '',
      `## Key files\n${wrapUntrusted('key-files', buildKeyFilesBlock(facts))}`,
      context.length
        ? `## Indexed context\n${context.map((c, i) => wrapUntrusted(`chunk-${i}`, c)).join('\n\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ];

    const startedAt = Date.now();
    try {
      const llm = await this.container.llm(ONBOARDING_PROVIDER);
      log?.debug(
        { repoId, lang, model: ONBOARDING_MODEL, messages },
        'onboarding: LLM request (prompt)',
      );
      const res = await llm.completeStructured<Onboarding>({
        model: ONBOARDING_MODEL,
        schema: OnboardingSchema,
        schemaName: 'Onboarding',
        messages,
        maxRetries: ONBOARDING_MAX_RETRIES,
      });
      log?.info(
        {
          repoId,
          lang,
          provider: ONBOARDING_PROVIDER,
          model: res.model,
          promptChars: system.length + user.length,
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          costUsd: res.costUsd,
          attempts: res.attempts,
          durationMs: Date.now() - startedAt,
          outcome: 'ok',
        },
        'onboarding: LLM response',
      );
      return this.persist(repoId, this.normalize(res.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // No silent skeleton: surface WHY it degraded.
      log?.error(
        { repoId, lang, model: ONBOARDING_MODEL, durationMs: Date.now() - startedAt, err: msg },
        'onboarding: LLM call failed — falling back to deterministic skeleton',
      );
      return this.persist(repoId, skeletonTour(facts, `LLM generation failed: ${msg}`));
    }
  }

  /** Force the canonical 5 sections (kind/title/order) regardless of model output. */
  private normalize(data: Onboarding): Onboarding {
    const bySectionKind = new Map(data.sections.map((s) => [s.kind, s]));
    const sections: OnboardingSection[] = SECTION_PLAN.map((plan, i) => {
      const src = bySectionKind.get(plan.kind) ?? data.sections[i];
      return {
        kind: plan.kind,
        title: plan.title,
        body: src?.body ?? '',
        diagram: sanitizeDiagram(src?.diagram),
        links: src?.links ?? [],
      };
    });
    return { sections };
  }

  private async persist(repoId: string, onboarding: Onboarding): Promise<Onboarding> {
    await this.container.db
      .insert(t.onboarding)
      .values({ repoId, json: onboarding, generatedAt: new Date() })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: onboarding, generatedAt: new Date() },
      });
    return onboarding;
  }

  /**
   * RAG retrieval: pgvector cosine top-k over `code_chunks` for this repo when
   * an embedder is configured; otherwise a keyword fallback over chunk content.
   */
  private async retrieve(repoId: string, query: string): Promise<string[]> {
    const embedder = await this.tryEmbedder();
    if (embedder) {
      try {
        const [vec] = await embedder.embed([query]);
        if (vec) {
          const literal = `[${vec.join(',')}]`;
          const rows = await this.container.db
            .select({ content: t.codeChunks.content })
            .from(t.codeChunks)
            .where(and(eq(t.codeChunks.repoId, repoId), sql`${t.codeChunks.embedding} IS NOT NULL`))
            .orderBy(sql`${t.codeChunks.embedding} <=> ${literal}::vector`)
            .limit(RETRIEVE_TOP_K);
          if (rows.length > 0) return rows.map((r) => r.content);
        }
      } catch {
        /* fall through to keyword */
      }
    }
    const tokens = queryTokens(query);
    const rows = await this.container.db
      .select({ content: t.codeChunks.content })
      .from(t.codeChunks)
      .where(eq(t.codeChunks.repoId, repoId))
      .limit(KEYWORD_SCAN_LIMIT);
    return scoreChunks(rows, tokens, RETRIEVE_TOP_K);
  }

  private async tryEmbedder() {
    try {
      return await this.container.embedder();
    } catch {
      return null;
    }
  }

  /** Shallow file tree (2 levels) for grounding links — best effort. */
  private async fileTree(root: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, depth: number, prefix: string) => {
      if (depth > TREE_MAX_DEPTH || out.length > TREE_MAX_ENTRIES) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (TREE_IGNORE_DIRS.has(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          out.push(`${rel}/`);
          await walk(join(dir, e.name), depth + 1, rel);
        } else if (e.isFile()) {
          const s = await stat(join(dir, e.name)).catch(() => null);
          if (s && s.size < TREE_MAX_FILE_BYTES) out.push(rel);
        }
      }
    };
    await walk(root, 0, '');
    return out.slice(0, TREE_MAX_ENTRIES);
  }
}
