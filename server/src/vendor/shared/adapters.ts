import { z } from 'zod';

/**
 * Adapter interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `apps/api/src/adapters/*`; mock implementations
 * live alongside for tests/dev (Services depend on the interface, not the impl).
 */

// ---------- LLM ----------
export const ModelInfo = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  label: z.string().nullish(),
  created: z.number().int().nullish(),
  /** Pricing in USD per 1M tokens (when the provider exposes it, e.g. OpenRouter). */
  pricing: z
    .object({ promptPerM: z.number(), completionPerM: z.number() })
    .nullish(),
  /** Max context window in tokens (when the provider exposes it). */
  contextLength: z.number().int().nullish(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;


// ---------- Embedder ----------

// ---------- GitHub (Octokit REST, thin) ----------
export interface RepoRef {
  owner: string;
  name: string;
}

export interface GitHubReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: { path: string; line: number; body: string }[];
}

/** Create one standalone inline review comment (or a reply to a thread). */
export interface CreateReviewCommentInput {
  /** Head commit the comment pins to (GitHub requires commit_id). */
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  /** When set, post as a reply to that comment's thread instead of a new one. */
  inReplyTo?: number;
}

export interface OpenPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

/** A single file to write in a commit (path relative to repo root + UTF-8 text). */
export interface CommitFile {
  path: string;
  contents: string;
}

export interface CommitFilesPayload {
  /** Branch to create-or-update with the commit (e.g. "devdigest/ci"). */
  branch: string;
  /** Base branch to fork from when `branch` does not yet exist (e.g. "main"). */
  base: string;
  message: string;
  files: CommitFile[];
}

/** specs/14-export-to-ci.md — one GitHub Actions workflow run, as returned by
 *  `GET /repos/{owner}/{repo}/actions/workflows/{workflow}/runs`. */
export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  display_title: string;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  pull_requests: number[];
}

/** One artifact published by a workflow run (metadata only — no bytes). */
export interface RunArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
}


// ---------- Git (simple-git, heavy) ----------

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines present in the *new* file covered by this hunk (for grounding). */
  newLineNumbers: number[];
}

export interface UnifiedDiff {
  raw: string;
  files: { path: string; additions: number; deletions: number; hunks: DiffHunk[] }[];
}


// ---------- CodeIndex (ripgrep + tree-sitter) ----------
export interface CodeMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSymbol {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export interface CodeReference {
  fromPath: string;
  toSymbol: string;
  line: number;
}


// ---------- Auth (pluggable; MVP = LocalNoAuthProvider) ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}


// ---------- Secrets (pluggable; MVP = LocalSecretsProvider) ----------

// ---------- Compat shim (type-only) ----------
// The port interfaces moved to `server/src/domain/ports` (SPEC-16). These
// type-only re-exports keep reviewer-core / agent-runner (which alias
// `@devdigest/shared` to this file) compiling. Source of truth is domain/ports;
// shim removal is a follow-up to SPEC-16.
/** @deprecated compat shim; import from `domain/ports/llm`. */
export type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  LLMProvider,
} from '../../domain/ports/llm.js';
/** @deprecated compat shim; import from `domain/ports/embedder`. */
export type { Embedder } from '../../domain/ports/embedder.js';
/** @deprecated compat shim; import from `domain/ports/github`. */
export type { GitHubClient } from '../../domain/ports/github.js';
/** @deprecated compat shim; import from `domain/ports/git`. */
export type { CloneOptions, BlameLine, GitCommit, GitClient } from '../../domain/ports/git.js';
/** @deprecated compat shim; import from `domain/ports/code-index`. */
export type { CodeIndex } from '../../domain/ports/code-index.js';
/** @deprecated compat shim; import from `domain/ports/auth`. */
export type { AuthProvider } from '../../domain/ports/auth.js';
/** @deprecated compat shim; import from `domain/ports/secrets`. */
export type { SecretKey, SecretsProvider } from '../../domain/ports/secrets.js';
