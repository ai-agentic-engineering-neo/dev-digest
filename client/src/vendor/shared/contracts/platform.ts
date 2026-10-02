import { z } from 'zod';
import { Provider } from './knowledge.js';

/**
 * Platform / scaffolding DTOs owned by F1:
 *  - settings (GET/PUT /settings, POST /settings/test-connection)
 *  - repos (POST/GET /repos, refresh, delete)
 *  - pulls (GET /repos/:id/pulls, GET /pulls/:id)
 *  - context (Project Context folder)
 */

// ---- Feature → model selection ----
/** System LLM features whose model is selectable in Settings (per-workspace). */
export const FeatureModelId = z.enum([
  'onboarding',
  'review_intent',
  'risk_brief',
  'conformance',
  'conventions',
]);
export type FeatureModelId = z.infer<typeof FeatureModelId>;

/** A chosen provider + model for one feature. */
export const FeatureModelChoice = z.object({
  provider: Provider,
  model: z.string().min(1),
});
export type FeatureModelChoice = z.infer<typeof FeatureModelChoice>;

/**
 * Registry of the selectable features: stable id, display label, and the
 * built-in default used when the workspace hasn't overridden the choice. The
 * defaults MIRROR each module's constants, so behaviour is unchanged until a
 * model is explicitly picked.
 */
export interface FeatureModelDef {
  id: FeatureModelId;
  label: string;
  description: string;
  defaultProvider: Provider;
  defaultModel: string;
}
export const FEATURE_MODELS: FeatureModelDef[] = [
  {
    id: 'onboarding',
    label: 'Onboarding Tour',
    description: 'Writes the per-repo onboarding tour.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'review_intent',
    label: 'PR Review · Intent',
    description: 'Derives a PR’s intent and scope before review.',
    // Advisory context, not a merge-gate agent — cheap model per
    // docs/agent-prompts/choosing-a-model.md's mixed-strategy guidance.
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'risk_brief',
    label: 'Risk Brief',
    description: 'Assesses merge risks for a pull request.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'conformance',
    label: 'Conformance',
    description: 'Checks a PR against the project spec.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    description: 'Extracts coding conventions from the repo.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
  },
];

// ---- Settings ----
/**
 * Non-secret prefs/config. Secrets (API keys) are NOT stored here — they go
 * through SecretsProvider (.env in MVP). Settings is a flat key/value bag,
 * surfaced as a typed object for the well-known keys.
 */
export const SettingsKnown = z.object({
  polling_interval_min: z.number().int().min(1).default(5),
  theme: z.enum(['dark', 'light']).default('dark'),
  density: z.enum(['regular', 'compact']).default('regular'),
  sync_to_folder: z.boolean().default(true),
  automatic_reviews: z.boolean().default(false),
  /** Per-feature model overrides (provider+model), keyed by FeatureModelId. */
  feature_models: z.record(FeatureModelId, FeatureModelChoice).default({}),
});
export type SettingsKnown = z.infer<typeof SettingsKnown>;

/** Full settings payload: well-known keys + arbitrary extras. */
export const Settings = SettingsKnown.passthrough();
export type Settings = z.infer<typeof Settings>;

export const SettingsUpdate = Settings.partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

// ---- Connection test ----
export const ConnTestProvider = z.enum(['openai', 'anthropic', 'openrouter', 'github']);
export type ConnTestProvider = z.infer<typeof ConnTestProvider>;

export const ConnTestRequest = z.object({
  provider: ConnTestProvider,
  /** Optional API key/PAT to persist and then test (BYO key from the UI). */
  key: z.string().min(1).optional(),
});
export type ConnTestRequest = z.infer<typeof ConnTestRequest>;

export const ConnTestResult = z.object({
  provider: ConnTestProvider,
  ok: z.boolean(),
  message: z.string(),
  detail: z.unknown().optional(),
});
export type ConnTestResult = z.infer<typeof ConnTestResult>;

// ---- Secrets status (which provider keys are configured; never the values) ----
/** Boolean per provider: true ⇒ a key/PAT is stored. The value is never exposed. */
export const SecretsStatus = z.object({
  openai: z.boolean(),
  anthropic: z.boolean(),
  openrouter: z.boolean(),
  github: z.boolean(),
});
export type SecretsStatus = z.infer<typeof SecretsStatus>;

// ---- Repos ----
export const RepoInput = z.object({
  url: z.string().url(),
});
export type RepoInput = z.infer<typeof RepoInput>;

export const Repo = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
  default_branch: z.string(),
  clone_path: z.string().nullable(),
  last_polled_at: z.string().nullable(),
  created_by: z.string().nullable(),
});
export type Repo = z.infer<typeof Repo>;

// ---- Pull requests ----
export const PrStatus = z.enum(['needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged']);
export type PrStatus = z.infer<typeof PrStatus>;

export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  // Latest-review score (list endpoint only; null/absent until reviewed).
  score: z.number().int().nullish(),
  // Non-dismissed finding counts keyed by severity, across every run on the PR
  // (list endpoint only; null until reviewed). A record rather than three
  // fields so a new severity needs no contract change.
  findings: z.record(z.string(), z.number().int()).nullish(),
  // Latest-run tokens/cost (list endpoint only; null until a run has completed).
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
});
export type PrMeta = z.infer<typeof PrMeta>;

export const PrFile = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  patch: z.string().nullish(),
});
export type PrFile = z.infer<typeof PrFile>;

export const PrCommit = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  committed_at: z.string().nullish(),
});
export type PrCommit = z.infer<typeof PrCommit>;

export const IssueMeta = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.string(),
});
export type IssueMeta = z.infer<typeof IssueMeta>;

export const PrDetail = PrMeta.extend({
  body: z.string().nullish(),
  files: z.array(PrFile),
  commits: z.array(PrCommit),
  linked_issue: IssueMeta.nullish(),
  // L03 — cached `review_intent` result (read-only pass-through; recomputed
  // only on the next review run, never as a side effect of this GET).
  // Revision 2 (specs/05-intent-layer.md): scope-based, not confidence-based
  // — `intent_confidence` is gone, replaced by structured in/out-of-scope
  // lists plus a deterministic `intent_context_gaps` list.
  intent: z.string().nullish(),
  intent_in_scope: z.array(z.string()).nullish(),
  intent_out_of_scope: z.array(z.string()).nullish(),
  intent_context_gaps: z.array(z.string()).nullish(),
  intent_signals: z.array(z.string()).nullish(),
});
export type PrDetail = z.infer<typeof PrDetail>;

// L03 — response shape for a standalone intent recalculation (POST
// /pulls/:id/intent/recalculate), same five fields as PrDetail's cached
// intent_* columns, returned fresh instead of read from the cache.
export const IntentDetail = z.object({
  intent: z.string().nullish(),
  intent_in_scope: z.array(z.string()).nullish(),
  intent_out_of_scope: z.array(z.string()).nullish(),
  intent_context_gaps: z.array(z.string()).nullish(),
  intent_signals: z.array(z.string()).nullish(),
});
export type IntentDetail = z.infer<typeof IntentDetail>;

// ---- PR review (inline) comments ----
/**
 * A GitHub PR review comment anchored to a diff line. Mirrors the fields the
 * "Files changed" tab needs to render threads inline; `line` is the position in
 * the current diff (null when GitHub can no longer anchor it → `is_outdated`).
 */
export const PrReviewComment = z.object({
  id: z.number().int(),
  path: z.string(),
  line: z.number().int().nullable(),
  original_line: z.number().int().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  body: z.string(),
  user: z.string(),
  created_at: z.string(),
  html_url: z.string(),
  in_reply_to_id: z.number().int().nullable(),
  /** GitHub couldn't anchor it to the current diff (line == null). */
  is_outdated: z.boolean(),
});
export type PrReviewComment = z.infer<typeof PrReviewComment>;

/** Body for POST /pulls/:id/comments (create one inline comment / reply). */
export const PrCommentInput = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']).optional(),
  body: z.string().min(1),
  /** Reply to an existing review comment thread (its comment id). */
  in_reply_to: z.number().int().optional(),
});
export type PrCommentInput = z.infer<typeof PrCommentInput>;

// ---- Project Context ----
export const SpecFile = z.object({
  path: z.string(),
  content: z.string().nullish(),
  size: z.number().int().nullish(),
  updated_at: z.string().nullish(),
});
export type SpecFile = z.infer<typeof SpecFile>;

export const IndexStatus = z.object({
  status: z.enum(['idle', 'cloning', 'parsing', 'embedding', 'done', 'error']),
  pct: z.number().min(0).max(100),
  message: z.string().nullish(),
  chunks_indexed: z.number().int().nullish(),
});
export type IndexStatus = z.infer<typeof IndexStatus>;

// ---- Project Context Folder (specs/09-project-context-folder.md) ----
// View-only document browser (D2/D7/N2) over a repo's synced checkout —
// discovery + token visibility + agent/skill attachment. Distinct from the
// SpecFile/IndexStatus groundwork above, which is reserved for a later
// chunking/indexing feature (N3) this slice deliberately does not build.

/** One markdown document discovered under a repo's configured search roots
 *  (`GET /repos/:id/context/documents`). */
export const ProjectDocument = z.object({
  path: z.string(),
  /** Deterministic label derived from the matched root's last path segment,
   *  lowercased (Q4) — 'specs'/'docs'/'insights' get the mockup's fixed
   *  colors client-side; any other label renders with the neutral default. */
  doc_type: z.string(),
  /** Same counter as a skill body / per-run skill attribution (AC-6) — never
   *  a separate estimate. */
  tokens: z.number().int(),
  /** Direct-attachment count only (AC-22/D8) — agents that would only
   *  inherit this document through a skill do not count. */
  used_by: z.number().int(),
});
export type ProjectDocument = z.infer<typeof ProjectDocument>;

/** `GET /repos/:id/context/documents` response. */
export const DocumentList = z.object({
  /** The search roots actually used for this scan (repo override or the
   *  documented default — Q1/Q2). */
  roots: z.array(z.string()),
  documents: z.array(ProjectDocument),
  /** AC-38 — count + summed tokens across ALL discovered documents, not only
   *  attached ones. `bounded` mirrors `walkClone`'s stats shape: how many
   *  discovered documents were excluded once MAX_DISCOVERED_DOCS was hit. */
  summary: z.object({
    count: z.number().int(),
    tokens: z.number().int(),
    bounded: z.number().int(),
  }),
});
export type DocumentList = z.infer<typeof DocumentList>;

/** `GET /repos/:id/context/documents/one?path=…` — read-only content preview
 *  (AC-4); never a write path (AC-5, AC-35). */
export const DocumentContent = z.object({
  path: z.string(),
  content: z.string(),
});
export type DocumentContent = z.infer<typeof DocumentContent>;

/** `PUT /repos/:id/context/config` request body (Q1/Q2, US-8/AC-29). Each
 *  entry is validated server-side as a relative, `..`-free, non-absolute path
 *  before it is stored (AC-27's search-root config bullet). */
export const SetDocRootsRequest = z.object({
  doc_roots: z.array(z.string()),
});
export type SetDocRootsRequest = z.infer<typeof SetDocRootsRequest>;

/**
 * One document attached to an agent or a skill
 * (`GET|POST|PUT /agents|skills/:id/documents`). `attached` mirrors
 * `AgentSkillLink.enabled`'s shape: the row (and its `order`) survives being
 * switched off, so re-attaching without reordering restores its previous
 * position (AC-10) instead of appending it to the end.
 */
export const AttachedDocument = z.object({
  repo_id: z.string(),
  path: z.string(),
  order: z.number().int(),
  attached: z.boolean(),
  tokens: z.number().int(),
  /** 'missing' when the path no longer resolves under the pinned repo's
   *  synced checkout since it was attached (AC-26) — the attachment itself
   *  is retained, never silently dropped. */
  status: z.enum(['present', 'missing']),
});
export type AttachedDocument = z.infer<typeof AttachedDocument>;

/** `POST /agents|skills/:id/documents` — set/reorder the whole attached set
 *  (AC-9, AC-37). Documents omitted from a later call are detached, not
 *  deleted — same "keep the row" rule `AttachedDocument.attached` describes. */
export const SetAttachedDocumentsRequest = z.object({
  documents: z.array(z.object({ repo_id: z.string(), path: z.string() })),
});
export type SetAttachedDocumentsRequest = z.infer<typeof SetAttachedDocumentsRequest>;

/** `PUT /agents|skills/:id/documents` — attach/detach exactly ONE document,
 *  keeping its position (AC-8, AC-10). */
export const SetAttachedDocumentRequest = z.object({
  repo_id: z.string(),
  path: z.string(),
  attached: z.boolean(),
});
export type SetAttachedDocumentRequest = z.infer<typeof SetAttachedDocumentRequest>;

// ---- Run request (review trigger; owned by A2, contract lives here) ----
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
  /** specs/13 (D3) — an explicit set of agent ids, additive: `agentId` and
   *  `all` keep their existing meaning and consumers unchanged. */
  agentIds: z.array(z.string().uuid()).min(1).optional(),
});
export type RunRequest = z.infer<typeof RunRequest>;

// ---- Structured API error envelope (returned by the API; UX taxonomy is FE) ----
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
