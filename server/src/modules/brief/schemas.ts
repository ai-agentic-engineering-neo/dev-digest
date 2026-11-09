import { z } from 'zod';
import { FeatureModelChoice, Risk } from '@devdigest/shared';
import {
  BRIEF_BLAST_REASONS,
  BRIEF_INTENT_REASONS,
  type BriefFileRef,
  type BriefFocusItem,
  type BriefMissingInput,
  type BriefReplyData,
  type BriefRisk,
  type BriefTruncation,
  type BriefUsage,
  type PrBriefResponse,
  type StoredBrief,
} from './domain/types.js';

const count = z.number().int().min(0);

export const BriefFileRefSchema = z.object({
  ref: z.string(),
  path: z.string(),
  start_line: z.number().int().min(1).nullable(),
  end_line: z.number().int().min(1).nullable(),
  in_diff: z.boolean(),
}) satisfies z.ZodType<BriefFileRef>;

export const BriefRiskSchema = Risk.extend({
  refs: z.array(BriefFileRefSchema),
}) satisfies z.ZodType<BriefRisk>;

export const BriefFocusItemSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  file_level: z.boolean(),
  in_diff: z.boolean(),
  reason: z.string(),
}) satisfies z.ZodType<BriefFocusItem>;

export const BriefMissingInputSchema = z.discriminatedUnion('input', [
  z.object({ input: z.literal('intent'), reason: z.enum(BRIEF_INTENT_REASONS) }),
  z.object({ input: z.literal('blast'), reason: z.enum(BRIEF_BLAST_REASONS) }),
  z.object({ input: z.literal('smart_diff_roles'), reason: z.literal('not_in_build') }),
]) satisfies z.ZodType<BriefMissingInput>;

export const BriefTruncationSchema = z.object({
  spec_docs: count,
  callers: count,
  boilerplate_hunk_files: count,
}) satisfies z.ZodType<BriefTruncation>;

export const BriefUsageSchema = z.object({
  provider: FeatureModelChoice.shape.provider,
  model: z.string(),
  tokens_in: count,
  tokens_out: count,
  cost_usd: z.number().min(0).nullable(),
}) satisfies z.ZodType<BriefUsage>;

export const StoredBriefSchema = z.object({
  summary: z.string(),
  risks: z.array(BriefRiskSchema),
  review_focus: z.array(BriefFocusItemSchema),
  missing_inputs: z.array(BriefMissingInputSchema),
  truncated: BriefTruncationSchema,
  head_sha: z.string().min(1),
  blast_link_sha: z.string().nullable(),
  usage: BriefUsageSchema,
  generated_at: z.string(),
}) satisfies z.ZodType<StoredBrief>;

export const PrBriefResponseSchema = z.object({
  pr_id: z.string(),
  model: FeatureModelChoice,
  changed_files: count,
  generating: z.boolean(),
  outdated: z.boolean(),
  brief: StoredBriefSchema.nullable(),
}) satisfies z.ZodType<PrBriefResponse>;

/** Lenient LLM reply; grounding.ts filters / clamps in code. */
export const BriefModelReply = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
}) satisfies z.ZodType<BriefReplyData>;
