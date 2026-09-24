/**
 * Domain shapes of the conventions module (write models the use cases pass to
 * the store). No DB row types: the repository maps its rows onto these.
 */
import type { ConventionCategory, ConventionEvidence, DroppedConvention } from '@devdigest/shared';

/** A candidate that passed the evidence gate and de-duplication. */
export interface KeptConvention {
  category: ConventionCategory;
  rule: string;
  evidence: ConventionEvidence[];
  confidence: number;
}

/** What a finished scan records. */
export interface ScanSummary {
  sampledFiles: string[];
  proposed: number;
  kept: number;
  dropped: DroppedConvention[];
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}
