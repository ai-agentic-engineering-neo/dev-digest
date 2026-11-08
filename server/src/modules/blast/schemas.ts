import { z } from 'zod';
import { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import { BLAST_DEGRADED_REASONS, type PrBlastRadius } from './domain/types.js';

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
}) satisfies z.ZodType<PrBlastRadius>;
