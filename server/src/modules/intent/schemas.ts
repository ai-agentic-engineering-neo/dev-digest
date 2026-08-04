import { z } from 'zod';

/**
 * The intent classifier's one structured LLM call output (revision 2 —
 * scope-based, specs/05-intent-layer.md). The model reports what's in and out
 * of scope; it never self-reports a confidence level — `IntentService.resolve`
 * computes `context_gaps` deterministically from the same signals instead of
 * trusting any model self-report (see helpers.ts's `detectContextGaps`).
 */
export const IntentExtractionOutput = z.object({
  summary: z.string().min(1),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type IntentExtractionOutput = z.infer<typeof IntentExtractionOutput>;
