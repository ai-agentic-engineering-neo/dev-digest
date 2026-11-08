# Implementation Plan: Project Context Folder

- **Status:** done
- **Execution mode:** single-agent  <!-- user's choice (first pipeline run: limited budget/parallelism) -->
- **Goal:** A user browses a repo's markdown docs on a Project Context page, attaches docs per (agent, repo) in the agent editor's Context tab, and every review run of that agent sends those docs (≤ 4,000 est. tokens, whole docs only) as an untrusted project-context section, with a "Project context" block in the run trace.
- **Specs:** `SPEC-01` — specs/project-context-folder.md (approved, commit 75b8759 — AC-5: only "not cloned" hides the doc list)
- **Packages:** server · client · e2e (reviewer-core: no change — its existing `specs` slot is used as-is)
- **Out of scope:** (spec Non-goals) creating/editing/uploading/deleting docs in the app (`.devdigest/specs/`, N6 New file/Upload/Edit); attaching docs to skills (N2c); chunking/embeddings/retrieval; the "COVERAGE" score; reading a doc as changed by the PR (trace note only); concurrent-edit warnings (last write wins); project context in CI-runner reviews; agent versions for attachment changes; tracking sync progress / storing resync failure reasons. Also not planned: the legacy `useContextFiles` / `useReindexContext` hooks in `client/src/lib/hooks/core.ts` (they target routes that don't exist; left untouched).

## Global constraints

- No edits in `*/src/vendor/shared/**` (pr-self-review non-waivable BLOCK). New API shapes live in `server/src/modules/context/domain.ts` (TS) + `schemas.ts` (Zod) and are mirrored in `client/src/lib/types.ts`. The trace block is an EXTRA key `project_context` on the stored `run_traces.trace` jsonb (the route returns the jsonb as-is), not a change to `RunTrace`.
- Migrations only via `node node_modules/drizzle-kit/bin.cjs generate` (Windows: `pnpm` scripts can fail with "Access is denied"). ONE migration task in this plan (T3). Never hand-edit `server/src/db/migrations/**`.
- Multi-tenancy is manual: every query on `repos` / `agents` filters `workspace_id` from `getContext(container, req)`; the new link table `agent_context_docs` has no `workspace_id` and is scoped through BOTH checked parents (agent AND repo).
- Onion layers (`node scripts/check-architecture.mjs` must add no new violations): `domain.ts` / `ports.ts` / `constants.ts` import no Zod/Fastify/Drizzle/platform; Drizzle only in `repository.ts`; services never import `src/adapters/**` (use container getters); adapters never import `src/modules/**`; no cross-module imports (`reviews` reaches context only via `container.projectContext`).
- Context enrichment is best-effort: a missing clone, unreadable doc or attachment-query error never fails a run (server/CLAUDE.md).
- Doc bodies and doc paths are untrusted: in prompts they go only through reviewer-core's `specs` slot (`wrapUntrusted('spec-i', …)` + `INJECTION_GUARD`), with no keyword filtering. In the UI they render via the kit `Markdown` (react-markdown, no raw HTML), and paths render as plain text.
- Server reads files only via `container.git.readFile` (realpath boundary + `.git` segment refusal) and lists them only via the new `container.docWalker` (no symlinks, skips `node_modules/ vendor/ .git/ clones/`).
- Client: no `fetch` in components; all user text from `messages/en/*.json`; only `@devdigest/ui` barrel imports; styles via existing CSS vars (`src/test/css-vars.test.ts` guards unknown `var(--x)`); tests use `fireEvent` (`@testing-library/user-event` is NOT a dependency); `beforeEach(() => { … })` with a block body.
- INSIGHTS (client, package-wide): `2026-11-06 — @testing-library/user-event is NOT a client dependency … use fireEvent from @testing-library/react (package.json:28 → devDependencies)`; `2026-11-06 — Mock throws "cannot destructure" AFTER a test passed: beforeEach(() => post.mockReset()) returns the mock … always give beforeEach a block body (src/lib/hooks/reviews.test.tsx:33 → beforeEach)`.
- INSIGHTS (server, package-wide): `2026-11-04 — There is no base-repository/workspace guard; scoping is manual per query → always add eq(t.x.workspaceId, workspaceId) from getContext (src/modules/_shared/context.ts:14 → getContext)`; `2026-11-05 — Correction: layer rules moved to .dependency-cruiser.cjs and the check is now node scripts/check-architecture.mjs …; never --update to absorb a new one (scripts/check-architecture.mjs → keyOf)`.

## Contracts (Wave 0)

```ts
// ---------- server/src/modules/context/constants.ts (T1) ----------
export const CONTEXT_TOKEN_CAP = 4000;          // AC-7 / AC-9 cap, est. tokens
export const CHARS_PER_TOKEN = 4;               // AC-1 estimate = ceil(chars / 4)
export const DOC_EXCLUDED_DIRS = ['node_modules', 'vendor', '.git', 'clones'] as const;
export const MAX_DOC_FILES = 2000;              // walker bound (hundreds of docs is the spec's "many")
export const MAX_DOC_PATH_CHARS = 1024;
export const MAX_ATTACHED_DOCS = 200;
export const PROJECT_CONTEXT_UNAVAILABLE = 'repo_not_synced' as const;

// ---------- server/src/modules/context/domain.ts (T1) — pure, no runtime imports ----------
export type DocSource = 'readme' | 'insights' | 'specs' | 'docs';
/** null = not a discoverable doc. Rules (POSIX path relative to the clone root):
 *  reject: empty, absolute, contains '\\', '..' or '' segments, any dir segment in DOC_EXCLUDED_DIRS,
 *          extension other than '.md' (case-insensitive), length > MAX_DOC_PATH_CHARS.
 *  basename 'INSIGHTS.md' (any depth)                         → 'insights'
 *  else first DIRECTORY segment equal to 'specs' or 'docs'    → that label
 *  else basename 'README.md' at depth 0 (root) or depth 1     → 'readme'
 *  else null. */
export function classifyDocPath(path: string): DocSource | null;
export function estimateTokens(content: string): number;      // Math.ceil(content.length / CHARS_PER_TOKEN)

export type LeftOutReason = 'too_large' | 'over_cap' | 'missing';
export interface AttachedDocRead { path: string; content: string | null }   // null = missing / unreadable
export interface IncludedDoc { path: string; tokens: number; content: string }
export interface LeftOutDoc { path: string; tokens: number | null; reason: LeftOutReason }
export interface ContextSelection { included: IncludedDoc[]; left_out: LeftOutDoc[]; total_tokens: number }
/** Walk docs in attach order. content null → 'missing' (tokens null). tokens > cap → 'too_large' (skip, continue).
 *  total + tokens > cap → 'over_cap', and from then on EVERY later doc is left out
 *  (its reason: 'missing' if unreadable, 'too_large' if alone > cap, else 'over_cap'). Never truncates. */
export function selectForRun(docs: readonly AttachedDocRead[], cap: number): ContextSelection;

// API DTOs (snake_case)
export interface ContextDoc { path: string; source: DocSource; tokens: number; attached_agents: number }
export type ContextRepoState =
  | { status: 'ready' }
  | { status: 'not_cloned' }
  | { status: 'index_failed'; reason: string | null }
  | { status: 'index_degraded'; reason: string | null };
export interface ContextDocList { repo_id: string; state: ContextRepoState; docs: ContextDoc[] } // docs [] only when not_cloned (AC-5); listed for ready / index_failed / index_degraded; sorted by path (JS sort)
export interface ContextDocContent extends ContextDoc { content: string }
export interface AgentContextDoc {
  path: string; position: number;                 // 0-based attach order
  status: 'ok' | 'missing';                       // missing = not in the discovered set / unreadable at the synced commit
  source: DocSource | null; tokens: number | null; // null when missing
}
export interface AgentContextDocs { agent_id: string; repo_id: string; docs: AgentContextDoc[] }
export type ProjectContextTrace =
  | { status: 'unavailable'; reason: typeof PROJECT_CONTEXT_UNAVAILABLE; attached: string[] }
  | { status: 'ok'; cap_tokens: number; total_tokens: number;
      included: { path: string; tokens: number }[];
      left_out: LeftOutDoc[];
      changed_by_pr: string[] };                   // attached paths that are in the PR's changed files
/** What the executor gets per run; null = agent has no attachments for the repo (AC-11). */
export interface RunProjectContext { specs: string[]; trace: ProjectContextTrace; logLine: string }

// ---------- server/src/modules/context/schemas.ts (T1) — Zod, `satisfies z.ZodType<…>` ----------
export const ContextDocSchema, ContextDocListSchema, ContextDocContentSchema, AgentContextDocsSchema; // mirror the TS types above
export const RepoIdParams = z.object({ id: z.string().uuid() });
export const ContextDocQuery = z.object({ path: z.string().min(1).max(1024) });
export const AgentContextDocsQuery = z.object({ repo_id: z.string().uuid() });
export const SetAgentContextDocsBody = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string().min(1).max(1024)).max(200),
});

// ---------- server/src/modules/context/ports.ts (T1) ----------
export interface ContextRepoRef { id: string; owner: string; name: string; clonePath: string | null }
export interface ContextRepositoryPort {
  repoInWorkspace(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined>;
  agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean>;
  listAttachments(agentId: string, repoId: string): Promise<string[]>;            // ordered by position
  replaceAttachments(agentId: string, repoId: string, paths: string[]): Promise<void>; // ONE transaction
  attachedAgentCounts(workspaceId: string, repoId: string): Promise<Map<string, number>>; // path → #agents (agents.workspace_id checked)
}

// ---------- server/src/adapters/docs/index.ts (T4) ----------
export interface DocWalker { listMarkdown(root: string): Promise<string[]> } // POSIX rel paths, sorted, ≤ MAX_DOC_FILES
export class FsDocWalker implements DocWalker {}

// ---------- server/src/platform/container.ts (T5) ----------
// ContainerOverrides += { docWalker?: DocWalker; contextRepo?: ContextRepositoryPort }
// get docWalker(): DocWalker; get contextRepo(): ContextRepositoryPort; get projectContext(): ProjectContextService

// ---------- REST (T6, module `context`, registry key `context`) ----------
// GET /repos/:id/context-docs                       → 200 ContextDocList        404 not_found (repo not in workspace)
// GET /repos/:id/context-docs/content?path=<p>      → 200 ContextDocContent     404 not_found (repo, or p not in the discovered set / unreadable)
// GET /agents/:id/context-docs?repo_id=<uuid>       → 200 AgentContextDocs      404 not_found (agent or repo not in workspace)
// PUT /agents/:id/context-docs  {repo_id, paths}    → 200 AgentContextDocs      404 not_found · 422 validation_error (duplicate / non-doc path)

// ---------- client/src/lib/types.ts (T2) — local mirrors, same field names ----------
export type DocSource = "readme" | "insights" | "specs" | "docs";
export interface ContextDoc { path: string; source: DocSource; tokens: number; attached_agents: number }
export type ContextRepoState = /* same union as server */;
export interface ContextDocList { repo_id: string; state: ContextRepoState; docs: ContextDoc[] }
export interface ContextDocContent extends ContextDoc { content: string }
export interface AgentContextDoc { path: string; position: number; status: "ok" | "missing"; source: DocSource | null; tokens: number | null }
export interface AgentContextDocs { agent_id: string; repo_id: string; docs: AgentContextDoc[] }
export type LeftOutReason = "too_large" | "over_cap" | "missing";
export type ProjectContextTrace = /* same union as server */;
export type RunTraceView = RunTrace & { project_context?: ProjectContextTrace | null };

// ---------- client/src/lib/hooks/project-context.ts (T2) ----------
export function useContextDocs(repoId: string | null | undefined, opts?: { poll?: boolean }): UseQueryResult<ContextDocList>; // key ["context-docs", repoId]; refetchInterval 3000 while poll
export function useContextDoc(repoId: string | null | undefined, path: string | null): UseQueryResult<ContextDocContent>;   // key ["context-doc", repoId, path]
export function useAgentContextDocs(agentId: string, repoId: string | null | undefined): UseQueryResult<AgentContextDocs>; // key ["agent-context-docs", agentId, repoId]
export function useSetAgentContextDocs(agentId: string, repoId: string): UseMutationResult<AgentContextDocs, unknown, string[]>;
//   meta OWN_ERROR_TOAST; optimistic setQueryData on ["agent-context-docs", agentId, repoId] (rollback onError);
//   onSuccess setQueryData(result); onSettled invalidate ["agent-context-docs", agentId, repoId] + ["context-docs", repoId]
// client/src/lib/hooks/trace.ts: useRunTrace → api.get<RunTraceView>(…)  (key unchanged ["run-trace", runId])

// ---------- client/src/lib/context-docs.ts (T2) — pure ----------
export const CONTEXT_TOKEN_CAP = 4000;
export function filterDocs<T extends { path: string }>(docs: readonly T[], text: string): T[]; // case-insensitive on basename OR folder; "" → all
export function shortenPath(path: string, max: number): string; // keeps basename, middle "…/"
export function sumTokens(docs: readonly { tokens: number | null }[]): number;
```

## File ownership map

| File | Task | New / Modified |
|---|---|---|
| `server/src/modules/context/constants.ts` | T1 | new |
| `server/src/modules/context/domain.ts` | T1 | new |
| `server/src/modules/context/schemas.ts` | T1 | new |
| `server/src/modules/context/ports.ts` | T1 | new |
| `server/test/context-domain.test.ts` | T1 | new |
| `client/src/lib/types.ts` | T2 | modified |
| `client/src/lib/context-docs.ts` | T2 | new |
| `client/src/lib/context-docs.test.ts` | T2 | new |
| `client/src/lib/hooks/project-context.ts` | T2 | new |
| `client/src/lib/hooks/project-context.test.tsx` | T2 | new |
| `client/src/lib/hooks/index.ts` | T2 | modified |
| `client/src/lib/hooks/trace.ts` | T2 | modified |
| `client/messages/en/context.json` | T2 | modified |
| `client/messages/en/agents.json` | T2 | modified |
| `client/messages/en/runs.json` | T2 | modified |
| `server/src/db/schema/context.ts` | T3 | modified |
| `server/src/db/schema.ts` | T3 | modified |
| `server/src/db/rows.ts` | T3 | modified |
| `server/src/db/migrations/0017_*.sql` + `meta/_journal.json` + `meta/0017_snapshot.json` | T3 | new (generated by drizzle-kit only) |
| `server/src/adapters/docs/index.ts` | T4 | new |
| `server/test/docs-walker.test.ts` | T4 | new |
| `server/src/modules/context/repository.ts` | T5 | new |
| `server/src/modules/context/service.ts` | T5 | new |
| `server/src/platform/container.ts` | T5 | modified |
| `server/test/context-service.test.ts` | T5 | new |
| `server/src/modules/context/routes.ts` | T6 | new |
| `server/src/modules/index.ts` | T6 | modified |
| `server/test/context-routes.it.test.ts` | T6 | new |
| `server/src/modules/reviews/run-executor.ts` | T7 | modified |
| `server/test/context-review-run.it.test.ts` | T7 | new |
| `client/src/components/run-trace-drawer/_components/ProjectContextBlock/ProjectContextBlock.tsx` | T8 | new |
| `client/src/components/run-trace-drawer/_components/ProjectContextBlock/index.ts` | T8 | new |
| `client/src/components/run-trace-drawer/_components/ProjectContextBlock/styles.ts` | T8 | new |
| `client/src/components/run-trace-drawer/_components/ProjectContextBlock/ProjectContextBlock.test.tsx` | T8 | new |
| `client/src/components/run-trace-drawer/_components/TraceBody/TraceBody.tsx` | T8 | modified |
| `client/src/components/run-trace-drawer/RunTraceDrawer.test.tsx` | T8 | modified |
| `client/src/components/context-doc-preview/ContextDocPreview.tsx` | T9 | new |
| `client/src/components/context-doc-preview/index.ts` | T9 | new |
| `client/src/components/context-doc-preview/styles.ts` | T9 | new |
| `client/src/components/context-doc-preview/ContextDocPreview.test.tsx` | T9 | new |
| `client/src/components/context-repo-state/ContextRepoState.tsx` | T9 | new |
| `client/src/components/context-repo-state/index.ts` | T9 | new |
| `client/src/components/context-repo-state/styles.ts` | T9 | new |
| `client/src/components/showcase/Showcase.tsx` | T9 | modified |
| `client/src/vendor/ui/nav.ts` | T9 | modified |
| `client/src/app/repos/[repoId]/context/page.tsx` | T9 | new |
| `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx` | T9 | new |
| `client/src/app/repos/[repoId]/context/_components/ProjectContextView/index.ts` | T9 | new |
| `client/src/app/repos/[repoId]/context/_components/ProjectContextView/styles.ts` | T9 | new |
| `client/src/app/repos/[repoId]/context/_components/ProjectContextView/hooks/useContextResync.ts` | T9 | new |
| `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx` | T9 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` | T10 | modified |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` | T10 | modified |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` | T10 | modified |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/index.ts` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/styles.ts` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/helpers.ts` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/helpers.test.ts` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/_components/ContextDocRow/ContextDocRow.tsx` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/_components/ContextDocRow/index.ts` | T10 | new |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/_components/ContextDocRow/styles.ts` | T10 | new |
| `server/src/db/seed.ts` | T11 | modified |
| `e2e/specs/12-project-context.flow.json` | T11 | new |

## Tasks

### T1 [W0] [backend] Server contracts + pure context rules
- **Status:** done
- **Files (only these):** `server/src/modules/context/constants.ts`, `server/src/modules/context/domain.ts`, `server/src/modules/context/schemas.ts`, `server/src/modules/context/ports.ts`, `server/test/context-domain.test.ts`
- **Depends on:** —
- **Covers:** SPEC-01/AC-1 (classification + token estimate), SPEC-01/AC-9 (included / too large / over cap rules), SPEC-01/AC-10 (missing never fails selection)
- **Produces:** everything under "Contracts" for `constants.ts`, `domain.ts`, `schemas.ts`, `ports.ts`, exactly as written.
- **Insights:** `2026-11-05 — /pr-self-review marks ANY edit under */src/vendor/shared/** as a NON-waivable critical … → put new API DTO types in the module (server: src/modules/skills/domain.ts:60 → SkillImportPreview; client mirror in client/src/lib/types.ts)`; `2026-11-05 — options.exclude … killed domain-shared-type-only … prove rules with node scripts/check-architecture.mjs --self-test (.dependency-cruiser.cjs → options.doNotFollow)`.
- **Skill focus:** onion — `domain.ts`/`ports.ts`/`constants.ts` import nothing but each other (no Zod: it lives in `schemas.ts`); typescript — discriminated unions on `status`, no `any`; zod — `satisfies z.ZodType<T>` on every schema so TS and Zod can't drift.
- **Steps:**
  1. `constants.ts`, then `domain.ts` with `classifyDocPath`, `estimateTokens`, `selectForRun` and the DTO types (pure functions, no I/O).
  2. `schemas.ts`: Zod schemas mirroring the DTOs (`ContextRepoState` as `z.discriminatedUnion('status', …)`) + params/query/body schemas.
  3. `ports.ts`: `ContextRepoRef`, `ContextRepositoryPort`.
  4. Tests in `test/context-domain.test.ts`.
- **Acceptance criteria:**
  - [ ] `classifyDocPath`: `README.md`→readme, `server/README.md`→readme, `a/b/README.md`→null, `client/INSIGHTS.md`→insights, `specs/x.md`→specs, `server/specs/deep/y.md`→specs, `docs/a/b.MD`→docs, `node_modules/p/docs/a.md`→null, `server/src/vendor/docs/a.md`→null, `clones/x/README.md`→null, `.git/docs/a.md`→null, `docs/a.txt`→null, `../docs/a.md`→null, `/docs/a.md`→null, `docs\\a.md`→null (AC-1).
  - [ ] `estimateTokens('abcde') === 2`; `estimateTokens('') === 0` (AC-1).
  - [ ] `selectForRun` with cap 4000: [1000, 5000 (too_large), 2500, 1000] → included [1000, 2500], then the last 1000 goes `over_cap` (total 4500 > 4000), and every doc after it is left out with its own reason; a `content: null` doc → `missing` with `tokens: null` and does not stop later docs before the cap is hit; included content is never truncated (AC-9, AC-10).
  - [ ] Every Zod schema parses a sample object of its TS type (compile-time `satisfies` + one runtime parse each).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/context-domain.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T2 [W0] [frontend] Client contracts, hooks, pure helpers, all i18n keys
- **Status:** done
- **Files (only these):** `client/src/lib/types.ts`, `client/src/lib/context-docs.ts`, `client/src/lib/context-docs.test.ts`, `client/src/lib/hooks/project-context.ts`, `client/src/lib/hooks/project-context.test.tsx`, `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/trace.ts`, `client/messages/en/context.json`, `client/messages/en/agents.json`, `client/messages/en/runs.json`
- **Depends on:** — (shapes copied from Contracts; T1 is the server source of truth)
- **Covers:** SPEC-01/AC-3 (filter helper: name or folder, case-insensitive), SPEC-01/AC-7 (token sum helper)
- **Produces:** client mirrors, `RunTraceView`, the four hooks, `filterDocs` / `shortenPath` / `sumTokens` / `CONTEXT_TOKEN_CAP` exactly as in Contracts; every message key listed below.
- **Insights:** `2026-11-05 — CORRECTION of 2026-11-05 Toggle entry: MutationCache.onError in providers already toasts EVERY failed mutation … a hook whose callers all show their own contextual error sets meta: OWN_ERROR_TOAST (src/lib/providers.tsx:39 → mutationCache onError; src/lib/error-message.ts:13 → OWN_ERROR_TOAST)`; `2026-11-05 — Agent-card skill counts use useQueries with the SAME key ["agent-skills", id] as the Skills tab … invalidate exactly that key after any link change (src/lib/hooks/skills.ts:98 → useAgentSkillCounts)`; `2026-11-05 — Skills Lab Config: … in mutations whose result an editor diffs against, setQueryData the returned entity BEFORE invalidating (src/lib/hooks/skills.ts:89 → useUpdateSkill onSuccess)`; `2026-11-05 — /pr-self-review blocks ANY edit in src/vendor/shared/** … API types missing from @devdigest/shared go into src/lib/types.ts as local mirrors (src/lib/types.ts:67 → SkillImportPreview)`; `2026-11-05 — messages/en/prReview.json repeats key names across namespaces … anchor on the namespace's unique neighbour key and verify with node -e "console.log(require('./messages/en/prReview.json').list.findings)"` (applies to every JSON edit here); `2026-11-05 — next-intl t.rich: a tag name must not equal a value name … (messages/en/conventions.json → modal.banner)`.
- **Skill focus:** react — the optimistic mutation copies `useSetAgentSkills` (`client/src/lib/hooks/skills.ts:180`): cancel → snapshot → set → rollback; zod/typescript — mirrors identical to server field names (snake_case).
- **Steps:**
  1. `types.ts`: append the mirrors + `RunTraceView` (import `RunTrace` type from `@devdigest/shared`).
  2. `context-docs.ts` pure helpers + tests.
  3. `hooks/project-context.ts` (four hooks; `useContextDoc` `enabled: !!repoId && !!path`; path URL-encoded in the query string) + re-export in `hooks/index.ts`; `useRunTrace` returns `RunTraceView`.
  4. Messages. Keep existing keys; ADD:
     - `context.json`: `page.title` "Project Context", `page.subtitle` "Markdown docs in {repo} at the last synced commit. Attach them to agents in the agent editor's Context tab.", `page.filterPlaceholder` "Filter documents…", `page.noMatch` "No documents found", `page.selectHint` "Select a document to preview it.", `page.loadError` "Couldn’t load documents", `page.docLoadError` "Couldn’t load this document", `page.noRepo` "Select a repository to see its documents.", `source.readme` "readme", `source.insights` "insights", `source.specs` "specs", `source.docs` "docs", `meta.tokens` "~{count} tokens", `meta.attachedAgents` "{count, plural, =0 {no agents} one {# agent} other {# agents}}", `meta.path` "Path", `emptyDocs.title` "No documents found in this repo", `emptyDocs.body` "Searched: the root README.md, the README.md of each top-level folder, every INSIGHTS.md, and *.md under any specs/ or docs/ folder. node_modules/, vendor/, .git/ and clones/ are skipped.", `state.notCloned.title` "Repo not cloned yet", `state.notCloned.body` "Docs are read from the local clone. Resync to fetch it.", `state.indexFailed.title` "Code index failed", `state.indexDegraded.title` "Code index is degraded", `state.reason` "Reason: {reason}", `state.noReason` "No reason recorded."
     - `agents.json`: `editor.tabs.context` "Context"; `contextTab.title` "Context", `contextTab.hint` "Attached docs go into this agent's reviews of {repo} as untrusted project context, in this order.", `contextTab.attachedCount` "{attached} of {total} attached", `contextTab.tokenSum` "~{count} tokens per model call", `contextTab.overCap` "Over the 4,000-token cap — later docs will be left out of runs", `contextTab.tooLarge` "{path} is ~{count} tokens — over the 4,000-token cap on its own, so it will be left out of every run.", `contextTab.filterPlaceholder` "Filter documents…", `contextTab.noMatch` "No documents found", `contextTab.noRepo` "Select a repository to attach its docs.", `contextTab.missing` "missing", `contextTab.missingHint` "Not found at the last synced commit", `contextTab.attachLabel` "Attach {path}", `contextTab.detach` "Detach", `contextTab.detachLabel` "Detach {path}", `contextTab.preview` "Preview", `contextTab.previewLabel` "Preview {path}", `contextTab.attached` "Attached", `contextTab.attach` "Attach", `contextTab.moveUp` "Move {path} up", `contextTab.moveDown` "Move {path} down", `contextTab.dragHandle` "Drag to reorder {path}", `contextTab.position` "#{n}", `contextTab.saveError` "Couldn’t save attachments", `contextTab.loadError` "Couldn’t load documents", `contextTab.close` "Close preview".
     - `runs.json` under `trace`: `projectContext.title` "Project context", `projectContext.summary` "{included} included · ~{tokens} of {cap} tokens", `projectContext.included` "Included", `projectContext.leftOut` "Left out", `projectContext.reason.too_large` "too large", `projectContext.reason.over_cap` "over cap", `projectContext.reason.missing` "missing", `projectContext.prChanges` "this PR changes {path}; the agent saw the synced version", `projectContext.unavailable` "project context unavailable: repo not synced", `projectContext.none` "none".
  5. Hook test: real hooks over `vi.mock("@/lib/api")`, asserting the GET/PUT URLs + body, optimistic update, rollback on error, and that `["context-docs", repoId]` is invalidated after a save.
- **Acceptance criteria:**
  - [ ] `filterDocs` matches `"SPECS"` against `server/specs/a.md` (folder) and `"insights"` against `client/INSIGHTS.md` (name); `""` returns all (AC-3).
  - [ ] `sumTokens([{tokens: 3000}, {tokens: null}, {tokens: 1500}]) === 4500` (AC-7).
  - [ ] `useSetAgentContextDocs` PUTs `{ repo_id, paths }` to `/agents/:id/context-docs`, applies the new order optimistically, and rolls back on error.
  - [ ] every key above resolves (`node -e "…require('./messages/en/agents.json').contextTab.tooLarge"` etc. prints the string); JSON stays valid.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/lib/context-docs.test.ts src/lib/hooks/project-context.test.tsx` → all pass

### T3 [W1] [backend] `agent_context_docs` table + generated migration 0017
- **Status:** done
- **Files (only these):** `server/src/db/schema/context.ts`, `server/src/db/schema.ts`, `server/src/db/rows.ts`, generated `server/src/db/migrations/0017_*.sql` + `meta/_journal.json` + `meta/0017_snapshot.json`
- **Depends on:** —
- **Covers:** SPEC-01/AC-6 (per (agent, repo) ordered storage that survives reload), SPEC-01/AC-13 (rows die with their agent/repo; no orphan cross-workspace rows)
- **Produces:** `export const agentContextDocs = pgTable('agent_context_docs', { agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }), repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }), path: text('path').notNull(), position: integer('position').notNull(), createdAt: now() }, (t) => ({ pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }), repoIdx: index('agent_context_docs_repo_idx').on(t.repoId) }))` in `schema/context.ts` (import `agents` from `./agents`, `now` from `./_shared`; no `.js` extensions in `db/schema/`); added to the barrel's `schema` object; `export type AgentContextDocRow = typeof t.agentContextDocs.$inferSelect` in `rows.ts`.
- **Insights:** `2026-11-04 — On Windows pnpm <script> can fail with "Access is denied" → call bins via node: … node node_modules/drizzle-kit/bin.cjs generate (package.json → scripts)`; `2026-11-04 — pgvector is enabled only by runMigrations() (src/db/migrate.ts) … migrate via pnpm db:migrate, never drizzle-kit migrate (src/db/migrate.ts:23 → runMigrations)`; `2026-11-04 — On Windows db:migrate / db:seed exit 0 with NO output and create no tables … workaround: a temp .mts that imports and awaits runMigrations(url) … (src/db/migrate.ts:37, src/db/seed.ts:227 → CLI entrypoint guard)`; `2026-11-05 — drizzle-kit generate asks interactively "renamed or new?" when one run both adds and drops a column; split into two generates` (this task only adds — must not prompt).
- **Skill focus:** postgresql-table-design — composite PK gives (agent, repo, path) uniqueness and the agent-leading lookup index; `agent_context_docs_repo_idx` serves per-repo attached counts and repo-delete cascades; both FKs `on delete cascade` (spec edge case "Agent or repo deleted").
- **Steps:** add the table → barrel/rows → `cd server && node node_modules/drizzle-kit/bin.cjs generate` → read the generated SQL (one `CREATE TABLE`, 2 FKs with `ON DELETE cascade`, PK, 1 index; nothing else).
- **Acceptance criteria:**
  - [ ] generated SQL creates only `agent_context_docs` with PK `(agent_id, repo_id, path)`, both FKs cascade, `agent_context_docs_repo_idx`.
  - [ ] migration applies on a fresh DB (proved by T6's `.it` test, which runs all migrations via the test harness).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `git status --short server/src/db/migrations` → exactly the new 0017 SQL + journal + snapshot

### T4 [W1] [backend] Doc walker adapter
- **Status:** done
- **Files (only these):** `server/src/adapters/docs/index.ts`, `server/test/docs-walker.test.ts`
- **Depends on:** —
- **Covers:** SPEC-01/AC-1 (exclusions, markdown only, non-markdown/binary not listed)
- **Produces:** `export interface DocWalker { listMarkdown(root: string): Promise<string[]> }` + `export class FsDocWalker implements DocWalker` — recursive `readdir({ withFileTypes: true })`; skips symlinks; skips dirs named `node_modules`, `vendor`, `.git`, `clones`; keeps files whose extension is `.md` (case-insensitive); returns POSIX relative paths (`split(sep).join('/')`), sorted, capped at 2000; an unreadable dir is skipped; a missing root returns `[]`. Constants local to the adapter (adapters must not import `modules/**`).
- **Insights:** `2026-11-07 — On Windows the repo-intel index says status: full but file_edges = 0 … depgraph toRel() returns relative(root, abs) with \ … → normalize with .split(sep).join('/') (src/adapters/depgraph/index.ts:109 → toRel)`; `2026-11-08 — dependency-cruiser cruise() resolves against process.cwd(); on Windows an absolute root on a DIFFERENT drive than cwd … → create … test fixtures under cwd (mkdtemp(join(process.cwd(), '.depgraph-test-')))` (use the same fixture placement); `2026-11-05 — GitClient.readFile callers may send content to an LLM: the adapter resolves the real path and refuses anything outside the clone (symlink escape) … (src/adapters/git/simple-git.ts → readFile)`. Pattern to copy: `server/src/modules/repo-intel/pipeline/walk.ts:73 → walkDir` (no symlinks, skip unreadable dirs).
- **Skill focus:** security — never follow symlinks; onion — adapter exports its own port type (like `adapters/tokenizer/index.ts`), no `modules/**` import.
- **Steps:** implement → tests with a fixture tree under `mkdtemp(join(process.cwd(), '.docs-walker-test-'))`, removed in `afterAll`.
- **Acceptance criteria:**
  - [ ] fixture with `README.md`, `docs/a.md`, `docs/b.txt`, `docs/img.png`, `node_modules/x/docs/c.md`, `server/src/vendor/docs/d.md`, `clones/r/README.md`, `.git/x.md` → returns exactly `['README.md', 'docs/a.md']` (AC-1).
  - [ ] Windows backslashes never appear in results; missing root → `[]`.
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/docs-walker.test.ts` → all pass

### T5 [W2] [backend] Context repository + `ProjectContextService` + container wiring
- **Status:** done
- **Files (only these):** `server/src/modules/context/repository.ts`, `server/src/modules/context/service.ts`, `server/src/platform/container.ts`, `server/test/context-service.test.ts`
- **Depends on:** T1, T3, T4
- **Covers:** SPEC-01/AC-1, SPEC-01/AC-2, SPEC-01/AC-5, SPEC-01/AC-6, SPEC-01/AC-8, SPEC-01/AC-10, SPEC-01/AC-13
- **Produces:**
  - `class ContextRepository implements ContextRepositoryPort` (Drizzle). `repoInWorkspace` / `agentInWorkspace` filter `workspace_id`; `listAttachments` orders by `position`; `replaceAttachments` = delete + insert (position = index) in ONE `db.transaction`; `attachedAgentCounts` = `count(*)` grouped by path over `agent_context_docs` inner-joined to `agents` with `eq(agents.workspaceId, workspaceId)` and `eq(agent_context_docs.repoId, repoId)` (one query).
  - `class ProjectContextService` (constructor `(container: Container)`, uses `container.contextRepo`, `container.docWalker`, `container.git`, `container.repoIntel`):
    - `listDocs(workspaceId, repoId): Promise<ContextDocList>` — 404 `NotFoundError` if the repo isn't in the workspace. `clonePath` null → `{status:'not_cloned'}` with docs `[]` (the ONLY state that hides the list, AC-5); `repoIntel.getIndexState` is not called then. Otherwise the docs are ALWAYS built: walker paths filtered by `classifyDocPath`, each read via `git.readFile({owner,name}, path)` (a read error drops the doc), `tokens = estimateTokens`, `attached_agents` from `attachedAgentCounts` (default 0). The state comes from `repoIntel.getIndexState(repoId)` and only labels the list: `status 'failed'` → `index_failed`; `status 'degraded'` or `degraded: true` → `index_degraded` (reason = `degradedReason ?? reason ?? null` for both); anything else → `ready`. If `getIndexState` throws, the state is `ready` (best-effort: index health never blocks the list).
    - `getDoc(workspaceId, repoId, path): Promise<ContextDocContent>` — 404 unless the repo is in the workspace, `clonePath` set, `classifyDocPath(path)` non-null, `path` is in `docWalker.listMarkdown(clonePath)`, and the read succeeds. It does not look at the index state.
    - `getAgentDocs(workspaceId, agentId, repoId): Promise<AgentContextDocs>` — 404 unless BOTH agent and repo are in the workspace; each attachment → `ok` (with source/tokens) when discoverable + readable, else `missing` (source/tokens null); a missing clone marks all `missing`.
    - `setAgentDocs(workspaceId, agentId, repoId, paths): Promise<AgentContextDocs>` — 404 as above; `ValidationError` (422) on duplicates or any path with `classifyDocPath === null`; existence NOT required (lets a user reorder/keep a missing doc until Detach); then `replaceAttachments` → `getAgentDocs`.
    - `forRun(workspaceId, repo: ContextRepoRef, agentId, changedPaths: string[]): Promise<RunProjectContext | null>` — `listAttachments`; none → `null` (AC-11). `clonePath` null → `{ specs: [], trace: { status:'unavailable', reason:'repo_not_synced', attached }, logLine: 'project context unavailable: repo not synced' }`. Else (index state is never consulted for runs) read each attached path (`classifyDocPath` null or read error → content null), `selectForRun(…, CONTEXT_TOKEN_CAP)`, `specs = included.map(d => \`File: ${d.path}\n\n${d.content}\`)`, trace `ok` with `changed_by_pr = attached ∩ changedPaths`, `logLine = "Project context: N of M doc(s) included (~T tokens)"` (+ "; K left out" when any). Never throws for missing docs; an attachment-query error propagates to the caller (T7 catches it).
  - `container.ts`: `ContainerOverrides` += `docWalker?: DocWalker; contextRepo?: ContextRepositoryPort`; getters `docWalker` (`FsDocWalker`), `contextRepo` (`ContextRepository`), `projectContext` (lazy `ProjectContextService`).
- **Insights:** `2026-11-05 — POST /agents/:id/skills used to link ANY skill uuid (only the agent was workspace-checked) … → link tables must check BOTH sides' workspace … (src/modules/agents/service.ts:181 → assertWorkspaceSkills)`; `2026-11-04 — ReviewService builds new ReviewRepository(container.db) instead of container.reviewRepo → can't be swapped via overrides; prefer the container getter in new code (src/modules/reviews/service.ts:34)`; `2026-11-06 — Vendor ports are narrower than PR-context features assume: GitClient.readFile reads the clone's working tree only (no read-at-ref …) (src/vendor/shared/adapters.ts:226 → readFile)` (working tree = last synced commit, which is what the spec wants); `2026-11-07 — repoIntel.getBlastRadius … a consumer that needs an honest reason must combine it with getIndexState() + config.repoIntelEnabled (src/modules/repo-intel/service.ts:220)` (use `getIndexState` only, through the facade; it synthesises `degraded / no_data` for never-indexed repos and when `REPO_INTEL_ENABLED=false`, which now only adds the notice); `2026-11-08 — On Windows POST /repos/:id/resync can "succeed" silently … (src/modules/repo-intel/service.ts:143 → resyncRepo)` (an out-of-date clone still lists the old docs; not this task's bug).
- **Skill focus:** drizzle — `replaceAttachments` in one transaction, counts in one grouped join (no N+1); security — the content route can only read paths that the walker discovered AND that classify (no arbitrary file read); onion — repo-intel only via `container.repoIntel`.
- **Steps:** repository → service → container getters/overrides → `test/context-service.test.ts` (unit, no DB): fake `contextRepo` (in-memory), fake `docWalker`, `MockGitClient`-style fake whose `readFile` returns per-path content or throws, fake `repoIntel.getIndexState`.
- **Acceptance criteria:**
  - [ ] `listDocs`: `clonePath` null → `not_cloned`, docs `[]`, `getIndexState` not called; cloned + index `failed` with reason → `index_failed` + reason AND the full doc list; cloned + `degraded` (incl. synthesised `no_data`) → `index_degraded` + reason AND the full doc list; `getIndexState` throwing → `ready` + list; in every listed case only classifying docs, `tokens` = ceil(chars/4), `attached_agents` from counts (AC-1, AC-5).
  - [ ] `getDoc` on `../.env`, `src/app.ts` or an undiscovered `docs/x.md` → `NotFoundError`; a discovered doc is returned while the index is `failed` (AC-2, AC-5, security).
  - [ ] `setAgentDocs` with a duplicate or a `src/a.ts` path → `ValidationError`; unknown agent or repo → `NotFoundError` (AC-6, AC-13).
  - [ ] `getAgentDocs` marks a deleted path `missing` (AC-10).
  - [ ] `forRun`: no attachments → `null`; `clonePath` null → `unavailable` trace; attachments [a (1000 tokens), gone, big (5000 tokens)] → specs = [a], trace left_out `[missing, too_large]`, `changed_by_pr` lists attached paths in `changedPaths`; a `degraded` index does not change the result (AC-8, AC-9, AC-10).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/context-service.test.ts` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T6 [W3] [backend] Context routes + module registration
- **Status:** done
- **Files (only these):** `server/src/modules/context/routes.ts`, `server/src/modules/index.ts`, `server/test/context-routes.it.test.ts`
- **Depends on:** T5
- **Covers:** SPEC-01/AC-1, SPEC-01/AC-2, SPEC-01/AC-6, SPEC-01/AC-13
- **Produces:** `export default async function contextRoutes(appBase)` with the four routes from Contracts (`app.withTypeProvider<ZodTypeProvider>()`, `schema: { params, querystring | body, response: { 200 } }` from `schemas.ts`, `workspaceId` from `getContext(app.container, req)`, service = `app.container.projectContext`); `modules/index.ts` += `import context from './context/routes.js'` + `context` entry.
- **Insights:** `2026-11-08 — .it files share ONE Postgres per file (beforeAll) and often one seeded repo, so rows from earlier tests leak … → a test whose query spans PRs of a repo … inserts its OWN repo(s) inside the test (test/blast-routes.it.test.ts:160 → ownRepo)`; `2026-11-05 — Integration tests intermittently skip (Docker not available) or fail when the full suite runs in parallel …` (run this file alone); `2026-11-05 — Skill content rules … live in the SERVICE … route Zod only checks shape` (paths' doc-shape rule stays in `setAgentDocs`, not in route Zod).
- **Skill focus:** fastify — Zod `response` schema on every route, `AppError` subclasses only (no `reply.status` for errors); security — every route resolves the workspace before touching data.
- **Steps:** routes → registry line → `.it` test using the existing harness (`test/helpers/pg.ts`), with a container override `docWalker` + `git` (fake, no real clone) and a repo row with a non-null `clone_path`; create a second workspace with its own agent + repo inside the test.
- **Acceptance criteria:**
  - [ ] `GET /repos/:id/context-docs` returns the classified docs with tokens and `attached_agents` (1 after one agent attaches a doc) (AC-1).
  - [ ] `GET …/content?path=docs/a.md` returns the content; `?path=src/app.ts` → 404 (AC-2).
  - [ ] `PUT /agents/:id/context-docs` then `GET` (fresh request = "after reload") returns the same order; reorder persists; `[]` detaches all; duplicate → 422 (AC-6).
  - [ ] other workspace's agent id or repo id on every route → 404 (AC-13); deleting the agent removes its rows (cascade).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/context-routes.it.test.ts` → all pass (Docker)
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T7 [W3] [backend] Inject project context into review runs + trace block
- **Status:** done
- **Files (only these):** `server/src/modules/reviews/run-executor.ts`, `server/test/context-review-run.it.test.ts`
- **Depends on:** T5
- **Covers:** SPEC-01/AC-8, SPEC-01/AC-9, SPEC-01/AC-10, SPEC-01/AC-11, SPEC-01/AC-12, SPEC-01/AC-13
- **Produces:** in `runOneAgent`, after `loadPromptSkills`: `const projectCtx = await this.loadProjectContext(workspaceId, repo, agent, diff, runLog)` (new private method: calls `this.container.projectContext.forRun(workspaceId, { id: repo.id, owner: repo.owner, name: repo.name, clonePath: repo.clonePath }, agent.id, diff.files.map(f => f.path))`; logs `logLine` via `runLog.info`; on error logs `Project context: unavailable (<msg>)` and returns `null`). Engine input gets `...(projectCtx && projectCtx.specs.length > 0 ? { specs: projectCtx.specs } : {})`. Success trace: `specs_read = included paths` (else `[]`) and, only when `projectCtx` is non-null, `project_context: projectCtx.trace` (trace typed `RunTrace & { project_context?: ProjectContextTrace }` via `ReturnType`-derived type, no import from `modules/context`). `traceFromBuffer` gains an optional `projectContext` arg so failed/cancelled runs keep the block too.
- **Insights:** `2026-11-06 — Flaky .it test … executeOne set done BEFORE saveRunTrace … → save the trace first, terminal status last (src/modules/reviews/run-executor.ts:316 → executeOne; test/helpers/runs.ts:14 → waitForPrRuns)`; `2026-11-04 — reviewPullRequest already returns costUsd … collect per-chunk usage via a callback (src/modules/reviews/run-executor.ts:139 → runOneAgent, partial spend via UsageTally at :157)` (extra input tokens flow into `tokens_in`/`cost_usd` through the existing usage path — don't add a second counter); `2026-11-05 — Per-skill metrics need explicit run attribution: run_skills … written by the executor after prompt assembly, best-effort` (same best-effort shape for context); `2026-11-04 — GET /runs/:id/events, … GET /runs/:id/trace … call getContext but ignore workspaceId (src/modules/reviews/routes.ts:49/:114/:121 …)` (pre-existing; don't widen it — the trace route is unchanged).
- **Skill focus:** security — doc text reaches the model only through the engine's `specs` slot (untrusted-wrapped, under `INJECTION_GUARD`); no keyword filtering; typescript — no `any` for the widened trace.
- **Steps:** executor change → `.it` test modelled on `test/intent-review.it.test.ts` (mock LLM via container overrides capturing every `completeStructured` call's messages; fake `docWalker`/`git`; agent strategy `map-reduce` with a 2-file diff for the "every call" check).
- **Acceptance criteria:**
  - [ ] map-reduce run with 2 attached docs: BOTH model calls' user message contains `## Project context` with both docs, in attach order, inside `<untrusted source="spec-0">` / `spec-1` (AC-8).
  - [ ] trace `project_context` lists included docs, a `too_large` doc, a `missing` doc (deleted file), and `changed_by_pr` for an attached doc that is in the diff; the run status is `done` (AC-9, AC-10).
  - [ ] agent with no attachments for this repo: no model call contains `## Project context`, and the trace has no `project_context` key (AC-11).
  - [ ] repo `clone_path` null with attachments: run `done`, trace `project_context.status === 'unavailable'`, log contains "project context unavailable: repo not synced".
  - [ ] attachments replaced (via `container.contextRepo.replaceAttachments`) from inside the FIRST mock LLM call: the second chunk of the same run still carries the original docs; the next run carries the new ones (AC-12).
  - [ ] an attachment of another workspace's agent is never injected (agent/repo rows of a second workspace in the same DB) (AC-13).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/context-review-run.it.test.ts` → all pass (Docker)
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass
  - `cd server && node scripts/check-architecture.mjs` → no new violations

### T8 [W1] [frontend] "Project context" block in the run trace drawer
- **Status:** done
- **Files (only these):** `client/src/components/run-trace-drawer/_components/ProjectContextBlock/{ProjectContextBlock.tsx,index.ts,styles.ts,ProjectContextBlock.test.tsx}`, `client/src/components/run-trace-drawer/_components/TraceBody/TraceBody.tsx`, `client/src/components/run-trace-drawer/RunTraceDrawer.test.tsx`
- **Depends on:** T2
- **Covers:** SPEC-01/AC-9, SPEC-01/AC-10, SPEC-01/AC-11
- **Produces:** `ProjectContextBlock({ block }: { block: ProjectContextTrace })` rendered inside `TraceSection icon="FileText" title={t("trace.projectContext.title")}` (open by default) placed after the Stats section; `TraceBody` prop `trace: RunTraceView`, renders the block only when `trace.project_context` is set. Content: `ok` → summary line, "Included" list (path in `mono` + `~N tokens`), "Left out" list (path + translated reason chip), one `prChanges` line per `changed_by_pr` path; `unavailable` → the `unavailable` text + attached paths. Paths as plain text (`title` = full path).
- **Insights:** `2026-11-04 — To vary data a vi.mock-ed hook returns per test, never mutate the module-level fixture … hook reads a let current = FIXTURE, a test assigns a spread copy, afterEach resets it (src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:24 → currentTrace)` (now `src/components/run-trace-drawer/RunTraceDrawer.test.tsx`); `2026-11-06 — Run-trace drawer collapsible headers are plain divs with only onClick … (src/components/run-trace-drawer/_components/TraceSection/TraceSection.tsx:25)` (known gap — the block is open by default so its content is reachable; don't fix TraceSection here); `2026-11-06 — Multi-agent column cards rendered with NO background: styles used var(--bg-elev) … grep src/vendor/ui/styles.css for every new var(--…)`.
- **Skill focus:** react-testing-library — query by text/role inside the section, not by class; frontend-ui-architecture — sub-component under the drawer's `_components/`.
- **Steps:** component + styles → TraceBody wiring → tests: block unit tests (ok / unavailable / reasons / PR-changes line) and a drawer test with and without `project_context` (spread-copy fixture).
- **Acceptance criteria:**
  - [ ] a trace with `ok` block shows "Project context", each included path, each left-out path with "too large" / "over cap" / "missing", and "this PR changes docs/a.md; the agent saw the synced version" (AC-9, AC-10).
  - [ ] a trace without `project_context` renders no "Project context" text (AC-11).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/components/run-trace-drawer` → all pass

### T9 [W2] [frontend] Project Context page + shared preview/state components + nav entry
- **Status:** done
- **Files (only these):** `client/src/components/context-doc-preview/{ContextDocPreview.tsx,index.ts,styles.ts,ContextDocPreview.test.tsx}`, `client/src/components/context-repo-state/{ContextRepoState.tsx,index.ts,styles.ts}`, `client/src/components/showcase/Showcase.tsx`, `client/src/vendor/ui/nav.ts`, `client/src/app/repos/[repoId]/context/page.tsx`, `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,index.ts,styles.ts,ProjectContextView.test.tsx}`, `client/src/app/repos/[repoId]/context/_components/ProjectContextView/hooks/useContextResync.ts`
- **Depends on:** T2
- **Covers:** SPEC-01/AC-1, SPEC-01/AC-2, SPEC-01/AC-3, SPEC-01/AC-4, SPEC-01/AC-5
- **Produces:**
  - `ContextDocPreview({ doc, content, labels, action? })` — presentational (NO `useTranslations`; `labels: { source: string; tokens: string; attachedAgents: string; path: string }` pre-translated), header with path (plain text), source label, token estimate, attached-agents count, body via kit `Markdown`; optional `action: React.ReactNode` slot (T10 puts the Attach/Attached toggle there).
  - `ContextRepoState({ variant, title, body, actionLabel, busy, onAction })` — presentational, two variants: `variant: "blocking"` (full-width state that replaces the list: used for `not_cloned`) and `variant: "banner"` (compact notice above the list, `role="status"`: used for `index_failed` / `index_degraded`); both show title, body and a Resync button.
  - Both added to `Showcase.tsx` `Gallery` with literal sample props (one `ContextRepoState` per variant).
  - `nav.ts`: `NAV[0].items` += `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` (`activeKeyFor` already maps `/context`).
  - `page.tsx` (`"use client"`, `ProjectContextPage`, `useParams<{ repoId: string }>()`, wraps the view in `<Suspense>` because the view uses `useSearchParams`).
  - `ProjectContextView({ repoId })`: master-detail; selected doc in `?path=` (URL state); filter text local state; list via `filterDocs`, each row a button with accessible name = full path, visible `shortenPath(path, 48)` + `title`. States: loading skeleton; `ErrorState` + retry; `state.status === 'not_cloned'` → `ContextRepoState variant="blocking"` (`state.notCloned.*`) INSTEAD of the list and preview (the only state that hides docs); `index_failed` / `index_degraded` → `ContextRepoState variant="banner"` (title `state.indexFailed.title` / `state.indexDegraded.title`, body `state.reason` with the reason or `state.noReason`, Resync) ABOVE the normal list + filter + preview, which work as in `ready`; listed state with 0 docs → `emptyDocs` + Resync (below the banner when one is shown); filter with 0 matches → `page.noMatch`; preview pane via `useContextDoc` + `ContextDocPreview`.
  - `useContextResync(repoId)`: calls `useResyncRepoIntel(repoId).mutate()`, then turns on `useContextDocs` polling (3 s) and stops after 60 s, or once the list's `state.status` or doc count differs from the value read right before the click; exposes `{ start, busy }`. Used by both the blocking state and the banner.
- **Insights:** `2026-11-04 — Gallery (src/components/showcase/Showcase.tsx) is rendered by src/test/smoke.test.tsx with NO NextIntlClientProvider → components added to /showcase must not call useTranslations; take translated strings as props (src/test/smoke.test.tsx:4 → Gallery; example: src/components/run-cost-badge/RunCostBadge.tsx:21)`; `2026-11-05 — Master-detail pages keep selection + tab in the URL (/skills?id&tab, ?new=1) and wrap the page in <Suspense> (useSearchParams on a static route) (src/app/skills/_components/SkillsLab/SkillsLab.tsx)`; `2026-11-08 — Blast "Resync index" could end on the FIRST poll before the reindex ran … take the baseline fresh right before the mutation with qc.fetchQuery({ ...repoIntelStateQuery(repoId), staleTime: 0 }) (src/lib/hooks/repo-intel.ts:41; …/BlastRadiusPanel/hooks/useBlastResync.ts:44 → start)` (here: read the `["context-docs", repoId]` baseline fresh with `fetchQuery(…, staleTime: 0)` before the mutation); `2026-11-08 — To test real React Query polling / timeouts … vi.mock("@/lib/api", importOriginal) … vi.useFakeTimers({ shouldAdvanceTime: true }) (…/BlastRadiusPanel/BlastRadiusPanel.test.tsx:59, :173)`; `2026-11-04 — RepoIntelState in src/lib/hooks/repo-intel.ts is a deliberate local type …`.
- **Skill focus:** next — `useSearchParams` only under `<Suspense>`; frontend-ui-architecture — shared presentational pieces in `src/components/<kebab>/`, route-only view in `_components/`; react — selection in URL, filter local, server data only in the query cache (no copying into state); the banner/blocking choice is derived from `state.status` at render, never stored.
- **Steps:** shared components + showcase → nav entry → page + view + resync hook → tests (`ProjectContextView.test.tsx` with `vi.mock("@/lib/hooks/project-context")` and `@/lib/hooks/repo-intel`; `ContextDocPreview.test.tsx`).
- **Acceptance criteria:**
  - [ ] list shows path, source label, `~N tokens` and attached-agents count for each doc (AC-1).
  - [ ] clicking a doc sets `?path=` and shows rendered markdown (a `# Heading` renders as a heading role) with path, source, tokens, count; a `<script>` in content is not executed/rendered as an element (AC-2).
  - [ ] typing "SPECS" keeps only docs under a `specs/` folder; a non-matching text shows "No documents found" (AC-3).
  - [ ] listed state + no docs → the searched-locations text and a "Resync" button that calls the resync mutation (AC-4).
  - [ ] `not_cloned` → "Repo not cloned yet" + Resync and NO doc list, filter or preview (AC-5).
  - [ ] `index_failed` with reason "boom" → a `role="status"` banner with "Code index failed", "Reason: boom" and Resync, AND the doc list, filter and preview still work; `index_degraded` with `reason: null` → "Code index is degraded" + "No reason recorded." above the list (AC-5).
  - [ ] `src/test/smoke.test.tsx` and `src/test/css-vars.test.ts` still pass.
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/app/repos src/components/context-doc-preview src/test` → all pass

### T10 [W3] [frontend] Agent editor Context tab
- **Status:** done
- **Files (only these):** `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts,AgentEditor.test.tsx}`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/{ContextTab.tsx,index.ts,styles.ts,helpers.ts,helpers.test.ts,ContextTab.test.tsx}`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/_components/ContextDocRow/{ContextDocRow.tsx,index.ts,styles.ts}`
- **Depends on:** T2, T9
- **Covers:** SPEC-01/AC-2, SPEC-01/AC-3, SPEC-01/AC-6, SPEC-01/AC-7, SPEC-01/AC-10
- **Produces:**
  - `TABS` += `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` (after skills); `AgentEditor` renders `<ContextTab agent={agent} />` for `tab === "context"`.
  - `helpers.ts`: `buildContextRows(docs: ContextDoc[], attached: AgentContextDoc[]): ContextRow[]` (attached first in `position` order — including `missing` ones, then the rest by path); `toggleAttached(paths, path)` (append on attach / remove on detach); `moveAttached(paths, path, to)`; `tooLargeAttached(rows)`.
  - `ContextTab({ agent })`: active repo from `useActiveRepo()` (`noRepo` text when none); `useContextDocs(repoId)` + `useAgentContextDocs(agent.id, repoId)` + `useSetAgentContextDocs`; header "N of M attached", `~T tokens per model call` (`sumTokens` of attached), warning `Badge` `overCap` when T > 4000; the `tooLarge` warning (role `alert`) for each attached doc with tokens > 4000; filter (`filterDocs`, `noMatch`); non-ready repo state → `ContextRepoState` (same mapping as T9); each change saves at once (`save(nextPaths)`, error toast `saveError` via `useToast`).
  - `ContextDocRow`: `Toggle` with `label` = "Attach {path}"; position `#n`; drag handle (HTML5 drag, same pattern as `SkillRow`) with accessible name "Drag to reorder {path}"; ↑/↓ buttons "Move {path} up/down" (keyboard reorder); `missing` badge + "Detach {path}" button; "Preview {path}" button opening a kit `Drawer` with `ContextDocPreview` (via `useContextDoc`) whose `action` is an Attach/Attached toggle.
- **Insights:** `2026-11-05 — Kit Checkbox is a <button role="checkbox"> … Toggle is a role="switch" button with NO label prop → in RTL query getByRole('switch') … (src/vendor/ui/kit/Checkbox.tsx; …/SkillCard/SkillCard.tsx:49 → Toggle)`; `2026-11-05 — Every Toggle needs an accessible name: pass label (→ aria-label) when there is no visible <label> (src/vendor/ui/primitives/Toggle.tsx)`; `2026-11-05 — CORRECTION … a hook whose callers all show their own contextual error sets meta: OWN_ERROR_TOAST …`; `2026-11-05 — Modals rendered at the top of a view come BEFORE the page in the DOM … scope with within(getByRole("dialog")) (ConventionsView.test.tsx)` (preview drawer); pattern to copy: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` (drag state, `save`, `moveLinked`).
- **Skill focus:** react — attached order derived from the query cache (no mirrored `useState` list), drag ids only in local state; react-testing-library — toggles by `getByRole('switch', { name: /Attach docs\/a.md/ })`, reorder by the ↑/↓ buttons (keyboard path), drop via `fireEvent.dragStart/drop`; a11y — every control's name includes the doc path.
- **Steps:** constants + AgentEditor wiring (+ test that `?tab=context` renders the tab) → helpers + tests → row → tab → `ContextTab.test.tsx` (`vi.mock("@/lib/hooks/project-context")`, `@/lib/repo-context`).
- **Acceptance criteria:**
  - [ ] toggling a doc calls the save mutation with the new ordered paths; attached docs render first, in order; ↑/↓ and drag-drop each save the moved order (AC-6).
  - [ ] header shows "2 of 5 attached" and the token sum; sum 4,500 shows the over-cap badge; attaching a 5,000-token doc shows the too-large warning, and the save still happens (AC-7).
  - [ ] a `missing` attachment shows "missing" + a Detach button that saves without it (AC-10).
  - [ ] Preview opens a dialog with the rendered doc, its meta, and an Attach/Attached toggle that saves (AC-2); the filter narrows rows and shows "No documents found" (AC-3).
- **Verify:**
  - `cd client && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd client && node node_modules/vitest/vitest.mjs run src/app/agents` → all pass
  - `cd client && node node_modules/vitest/vitest.mjs run` → all pass

### T11 [W4] [backend] Seeded run trace + e2e flow 12 (integration)
- **Status:** done
- **Files (only these):** `server/src/db/seed.ts`, `e2e/specs/12-project-context.flow.json`
- **Depends on:** T6, T7, T8, T9, T10
- **Covers:** SPEC-01/AC-9 (end-to-end in the browser), SPEC-01/AC-5 (the "not cloned" state, which hides the list, end-to-end; the seeded repo has no clone, so the failed/degraded banner is covered by T5/T9 unit tests only)
- **Produces:**
  - `seed.ts`: after the agents loop, an idempotent block: if the seeded PR #482 review (`model: 'seed'`) has `run_id` null → insert one `agent_runs` row (workspace, Security Reviewer's id, PR #482, `status: 'done'`, `provider`/`model` = seed defaults, `durationMs: 4200`, `tokensIn: 5200`, `tokensOut: 640`, `findingsCount: 2`, `grounding: '2/2 passed'`, `score: 61`, `blockers: 1`), one `run_traces` row whose trace is a valid `RunTrace` plus `project_context: { status: 'ok', cap_tokens: 4000, total_tokens: 820, included: [{ path: 'docs/rate-limiting.md', tokens: 820 }], left_out: [{ path: 'specs/security-baseline.md', tokens: 5100, reason: 'too_large' }], changed_by_pr: [] }` and `specs_read: ['docs/rate-limiting.md']`, then set the review's `run_id` to that run (so flow 04's verdict / "2 findings" / FindingCard stay as they are).
  - Flow 12 ("Run trace shows the Project context block and the Project Context page shows the not-cloned state"): open `{BASE}/` → `wait --url /pulls` → click the PR #482 title → `wait --url /pulls/482` → `wait --load networkidle` → `find role button click --name "Agent runs"` → `wait --url tab=findings` → `find role button click --name "Open run trace & logs"` → `wait --text "Project context"` → `wait --text "docs/rate-limiting.md"` → `wait --text "specs/security-baseline.md"` → `find role link click --name "Project Context"` → `wait --url /context` → `wait --load networkidle` → `wait --text "Repo not cloned yet"` → `wait --text "Docs are read from the local clone. Resync to fetch it."`. Each step gets a lowercase `label`. The flow must not wait for any banner text ("Code index failed" / "Code index is degraded"): the seeded repo is never in a listed state.
- **Insights:** e2e: `2026-11-05 — CI e2e builds the DB from zero (migrate, THEN seed), so a data back-fill inside a migration … never touches seed rows … → put such defaults in the seed / insert path itself (../server/src/db/seed.ts:290)`; `2026-11-05 — wait --text matches RENDERED text, so a label styled text-transform: uppercase … never matches`; `2026-11-07 — CORRECTION … a section label is never a wait --text target; wait for the seeded content under it (specs/09-pr-intent.flow.json:14)` (the trace `TraceSection` title is NOT uppercased — `styles.ts:21 sectionTitle` — but the doc paths are the real assertions); `2026-11-06 — find … click does NOT wait for a navigation started by the previous step … after every click that navigates, add wait --url <new path> + wait --load networkidle (specs/08-skills.flow.json:23)`; `2026-11-04 — Text locators depend on strings owned by other packages … grep e2e/specs/ for it` (flows 02/04 read the seeded PR #482 — re-run them); `2026-11-06 — On Windows npm run e2e:hermetic dies instantly … run hermetic e2e in WSL/CI`.
- **Skill focus:** security — seed data contains no secrets or real doc content; e2e rules — no LLM call, seeded data only, deterministic locators.
- **Steps:** seed block (idempotent: re-seeding doesn't add a second run) → flow file → full hermetic e2e run (CI or WSL).
- **Acceptance criteria:**
  - [ ] fresh seed: PR #482 has one run whose trace drawer shows the Project context block with the included and too-large docs (AC-9).
  - [ ] the Project Context page of `acme/payments-api` (no clone) shows "Repo not cloned yet" + its body text and no doc list (AC-5).
  - [ ] flows 01–11 still pass (notably 04: "request changes", "2 findings", seeded FindingCard).
- **Verify:**
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run --exclude '**/*.it.test.ts'` → all pass
  - `cd e2e && npm run e2e:hermetic` → all flows pass (WSL/CI; not native Windows)

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T1, T2 | sequential: T1 → T2 | server + client typecheck; T1/T2 tests green; architecture check |
| W1 | T3 (migration), T4, T8 | sequential: T3 → T4 → T8 | every task's Verify + typecheck of server and client |
| W2 | T5, T9 | sequential: T5 → T9 | every task's Verify + server unit tests + client tests |
| W3 | T6, T7, T10 | sequential: T6 → T7 → T10 | every task's Verify; server `.it` files T6/T7 green (Docker); full client suite |
| W4 | T11 (integration / e2e) | alone | hermetic e2e green in CI/WSL |

## Risks · Review focus

- **Workspace scoping on the link table** (T5, T6): `agent_context_docs` has no `workspace_id`; every read/write must have checked BOTH the agent and the repo first, and `attachedAgentCounts` must join `agents.workspace_id`. Cross-workspace 404s are asserted in T6/T7.
- **Arbitrary file read via the content route** (T5): `getDoc` must require `classifyDocPath` + presence in the walker's list + `git.readFile` (boundary/.git guard). A missing check would let `?path=` read `.env` or source files.
- **Prompt byte-identity and untrusted wrapping** (T7): pass `specs` only when there are included docs; no attachments ⇒ no `specs` key, no `project_context` key. Doc text must not be concatenated into `task`, `system` or any trusted slot.
- **AC-5: only "not cloned" hides the docs** (T5, T9, T11): a failed or degraded index (common: never-indexed repos and `REPO_INTEL_ENABLED=false` both report `degraded / no_data`) must still return and render the full doc list, with only a banner above it. Watch for: `listDocs` returning `docs: []` for `index_*`; the view switching on `status !== 'ready'` instead of `=== 'not_cloned'`; `getIndexState` errors or index state leaking into `getDoc` / `forRun`. T5 and T9 tests assert the list is present under both index states.
- **Cache keys and i18n** (T2, T9, T10): saves must invalidate exactly `["agent-context-docs", agentId, repoId]` and `["context-docs", repoId]` (attached counts). Every new string lives in the three message files T2 owns, and showcase components take strings as props.

## Open questions

- (none)
