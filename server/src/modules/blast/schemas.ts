import { z } from 'zod';
import { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import {
  BLAST_DEGRADED_REASONS,
  MAX_PRIOR_PULLS,
  MAX_PRIOR_SHARED_FILES,
  type PrBlastRadius,
  type PriorPullsResponse,
} from './domain/types.js';

export const BlastDegradedReasonSchema = z.enum(BLAST_DEGRADED_REASONS);

export const BlastDownstreamSchema = DownstreamImpact.extend({ file: z.string(), kind: z.string() });

export const BlastCountsSchema = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});

export const BlastRadiusResponse = BlastRadius.extend({
  pr_id: z.string().uuid(),
  head_sha: z.string(),
  indexed_sha: z.string().nullable(),
  link_sha: z.string().min(1),
  downstream: z.array(BlastDownstreamSchema),
  unattributed_endpoints: z.array(z.string()),
  counts: BlastCountsSchema,
  callers_omitted: z.number().int().nonnegative(),
  degraded: z.boolean(),
  reason: BlastDegradedReasonSchema.nullable(),
})
  // Domain invariant (BlastStatus): a reason exactly when degraded — the UI and MCP pick next steps by `reason`.
  .refine((b) => b.degraded === (b.reason !== null), {
    message: 'degraded must be true exactly when reason is set',
    path: ['reason'],
  }) satisfies z.ZodType<PrBlastRadius>;

export const PriorPullSchema = z.object({
  pr_id: z.string().uuid(),
  number: z.number().int().positive(),
  title: z.string(),
  author: z.string(),
  status: z.string(),
  updated_at: z.string().datetime({ offset: true }).nullable(),
  shared_count: z.number().int().positive(),
  shared_files: z.array(z.string()).min(1).max(MAX_PRIOR_SHARED_FILES),
});

export const PriorPullsResponseSchema = z
  .object({
    pr_id: z.string().uuid(),
    total: z.number().int().nonnegative(),
    pulls: z.array(PriorPullSchema).max(MAX_PRIOR_PULLS),
  })
  .refine((b) => b.total >= b.pulls.length, { message: 'total must count every listed pull', path: ['total'] }) satisfies z.ZodType<PriorPullsResponse>;
