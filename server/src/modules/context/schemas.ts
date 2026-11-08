import { z } from 'zod';
import { MAX_ATTACHED_DOCS, MAX_DOC_PATH_CHARS } from './constants.js';
import type {
  AgentContextDocs,
  ContextDoc,
  ContextDocContent,
  ContextDocList,
  ContextRepoState,
  DocSource,
} from './domain.js';

export const DocSourceSchema = z.enum(['readme', 'insights', 'specs', 'docs']) satisfies z.ZodType<DocSource>;

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
