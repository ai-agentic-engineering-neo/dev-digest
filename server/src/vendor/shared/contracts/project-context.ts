import { z } from 'zod';

// ---- Project context attachments (SPEC-01) ----

/** One attached document path of an agent or skill, in stored order. */
export const ContextAttachment = z.object({
  path: z.string(),
  order: z.number().int(),
  /** The path is no longer in the current listing. */
  missing: z.boolean(),
  /** The listed file is over the size cap. */
  too_large: z.boolean(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

/** Body of PUT /agents/:id/context and PUT /skills/:id/context. */
export const ContextAttachmentsUpdate = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string().min(1).max(300)).max(200),
});
export type ContextAttachmentsUpdate = z.infer<typeof ContextAttachmentsUpdate>;

/**
 * Response of GET|PUT|DELETE /repos/:id/context/file: the effective text (the
 * local override when one exists, otherwise the default-branch text).
 */
export const ContextFileContent = z.object({
  path: z.string(),
  sha: z.string(),
  text: z.string(),
  /** A local override replaces the repository text. */
  modified: z.boolean(),
  /** Default-branch text; only when `modified`. */
  repo_text: z.string().nullish(),
  /** ISO time of the last save of the override; only when `modified`. */
  updated_at: z.string().nullish(),
});
export type ContextFileContent = z.infer<typeof ContextFileContent>;

/** Body of PUT /repos/:id/context/file. Empty and NUL checks live in the service. */
export const ContextFileUpdate = z.object({
  path: z.string().min(1).max(300),
  text: z.string().max(200_000),
});
export type ContextFileUpdate = z.infer<typeof ContextFileUpdate>;
