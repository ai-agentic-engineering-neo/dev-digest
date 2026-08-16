import { z } from 'zod';
import { MAX_FOCUS, MAX_RISKS } from './constants.js';

/**
 * The raw LLM-facing extraction schema for the one structured call — a
 * SEPARATE shape from the shared, stored `PrBrief` contract (Q4), mirroring
 * `onboarding/schemas.ts`'s stated principle: grounding has to reach INSIDE
 * each risk/focus entry to drop a reference, a line or a link — impossible
 * against a rendered blob.
 *
 * `kind: z.string()` (Q4) — an unrecognised kind must be NORMALISED by
 * grounding (AC-15), never a schema-validation failure that would burn a
 * repair attempt or fail the whole generation over one bad word.
 *
 * `file_refs` here are STRUCTURED `{file, line}` pairs, not the rendered
 * `"path:line"` string — the model never has to encode anything, and
 * grounding never has to parse anything back out.
 */

const RawFileRef = z.object({
  file: z.string().min(1).max(500),
  line: z.number().int().positive().nullish(),
});

const RawRisk = z.object({
  kind: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(2000),
  severity: z.enum(['high', 'medium', 'low']),
  file_refs: z.array(RawFileRef).min(1).max(10),
});

const RawFocusItem = z.object({
  file: z.string().min(1).max(500),
  line: z.number().int().positive().nullish(),
  reason: z.string().min(1).max(400),
});

export const BriefGenerationOutput = z.object({
  what: z.string().min(1).max(2000),
  why: z.string().min(1).max(2000),
  risk_level: z.enum(['high', 'medium', 'low']),
  risks: z.array(RawRisk).max(MAX_RISKS * 2), // headroom — grounding/Q5 does the real clamp
  review_focus: z.array(RawFocusItem).max(MAX_FOCUS * 2),
});
export type BriefGenerationOutput = z.infer<typeof BriefGenerationOutput>;
