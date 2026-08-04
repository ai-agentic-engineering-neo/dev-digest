import { z } from 'zod';

/**
 * The intent classifier's one structured LLM call output. `confidence` here is
 * the model's SELF-REPORT — `IntentService.resolve` applies a deterministic
 * ceiling on top (never trusts this value alone; see service.ts).
 */
export const IntentExtractionOutput = z.object({
  summary: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string(),
});
export type IntentExtractionOutput = z.infer<typeof IntentExtractionOutput>;
