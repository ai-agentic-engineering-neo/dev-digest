import { z } from 'zod';
import { MAX_CANDIDATES, MAX_SNIPPET_CHARS } from './constants.js';

/**
 * The LLM-facing extraction schema — narrower than the DB-shaped
 * `ConventionCandidate` DTO. The model proposes a rule and a snippet of the
 * evidence it saw; it never assigns an id, a status, or line numbers — those
 * are computed server-side once the snippet is verified against the clone
 * (see `verification.ts`).
 */
export const ConventionExtractionCandidate = z.object({
  category: z.string().min(1).max(40),
  rule: z.string().min(1).max(500),
  evidence_path: z.string().min(1),
  evidence_snippet: z.string().min(1).max(MAX_SNIPPET_CHARS),
  confidence: z.number().min(0).max(1),
});
export type ConventionExtractionCandidate = z.infer<typeof ConventionExtractionCandidate>;

export const ConventionExtractionOutput = z.object({
  candidates: z.array(ConventionExtractionCandidate).max(MAX_CANDIDATES),
});
export type ConventionExtractionOutput = z.infer<typeof ConventionExtractionOutput>;
