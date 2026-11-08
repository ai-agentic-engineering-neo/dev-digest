import { z } from 'zod';
import { MAX_ATTACHED_DOCS, MAX_DOC_PATH_CHARS } from './constants.js';
import type {
  AgentContextDocs,
  ContextDoc,
  ContextDocContent,
  ContextDocList,
  ContextRepoState,
  DevdigestCopyResult,
  DevdigestDeleteResult,
  DevdigestDoc,
  DevdigestDocList,
  DevdigestDocMeta,
  DocSource,
} from './domain.js';

export const DocSourceSchema = z.enum(['readme', 'insights', 'specs', 'docs', 'devdigest']) satisfies z.ZodType<DocSource>;

export const ContextDocSchema = z.object({
  path: z.string(),
  source: DocSourceSchema,
  tokens: z.number().int().nonnegative(),
  attached_agents: z.number().int().nonnegative(),
}) satisfies z.ZodType<ContextDoc>;

export const ContextRepoStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready') }),
  z.object({ status: z.literal('not_cloned') }),
  z.object({ status: z.literal('index_failed'), reason: z.string().nullable() }),
  z.object({ status: z.literal('index_degraded'), reason: z.string().nullable() }),
]) satisfies z.ZodType<ContextRepoState>;

export const ContextDocListSchema = z.object({
  repo_id: z.string().uuid(),
  state: ContextRepoStateSchema,
  docs: z.array(ContextDocSchema),
}) satisfies z.ZodType<ContextDocList>;

export const ContextDocContentSchema = ContextDocSchema.extend({
  content: z.string(),
}) satisfies z.ZodType<ContextDocContent>;

export const AgentContextDocSchema = z.object({
  path: z.string(),
  position: z.number().int().nonnegative(),
  status: z.enum(['ok', 'missing']),
  source: DocSourceSchema.nullable(),
  tokens: z.number().int().nonnegative().nullable(),
});

export const AgentContextDocsSchema = z.object({
  agent_id: z.string().uuid(),
  repo_id: z.string().uuid(),
  docs: z.array(AgentContextDocSchema),
}) satisfies z.ZodType<AgentContextDocs>;

export const RepoIdParams = z.object({ id: z.string().uuid() });
export const ContextDocQuery = z.object({ path: z.string().min(1).max(MAX_DOC_PATH_CHARS) });
export const AgentContextDocsQuery = z.object({ repo_id: z.string().uuid() });
export const SetAgentContextDocsBody = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string().min(1).max(MAX_DOC_PATH_CHARS)).max(MAX_ATTACHED_DOCS),
});

// ---------- DevDigest-owned docs (SPEC-03) ----------

export const DevdigestDocMetaSchema = z.object({
  id: z.string().uuid(),
  path: z.string(),
  tokens: z.number().int().nonnegative(),
  copied_from: z.string().nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<DevdigestDocMeta>;

export const DevdigestDocListSchema = z.object({
  repo_id: z.string().uuid(),
  docs: z.array(DevdigestDocMetaSchema),
  limit: z.number().int().nonnegative(),
  synced_at: z.string().nullable(),
  ignored_repo_paths: z.number().int().nonnegative(),
}) satisfies z.ZodType<DevdigestDocList>;

export const DevdigestDocSchema = DevdigestDocMetaSchema.extend({
  repo_id: z.string().uuid(),
  content: z.string(),
  used_by: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
}) satisfies z.ZodType<DevdigestDoc>;

export const DevdigestCopyResultSchema = z.object({
  created: z.boolean(),
  doc: DevdigestDocSchema,
}) satisfies z.ZodType<DevdigestCopyResult>;

export const DevdigestDeleteResultSchema = z.object({
  deleted: z.string(),
  detached_agents: z.number().int().nonnegative(),
}) satisfies z.ZodType<DevdigestDeleteResult>;

export const IdParams = z.object({ id: z.string().uuid() });
export const CreateDevdigestDocBody = z.object({
  folder: z.string().max(MAX_DOC_PATH_CHARS),
  name: z.string().max(MAX_DOC_PATH_CHARS),
});
export const UploadDevdigestDocBody = z.object({
  folder: z.string().max(MAX_DOC_PATH_CHARS),
  filename: z.string().max(MAX_DOC_PATH_CHARS),
  content_base64: z.string().min(1),
  overwrite: z.boolean(),
});
export const CopyDevdigestDocBody = z.object({
  source_path: z.string().min(1).max(MAX_DOC_PATH_CHARS),
});
export const SaveDevdigestDocBody = z.object({ content: z.string() });
