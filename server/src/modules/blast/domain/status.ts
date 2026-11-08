// Pure: decides whether (and why) a blast map is degraded. No I/O, no zod.
import type { BlastIndexSnapshot, BlastIntelResult, BlastStatus } from './types.js';

export function deriveBlastStatus(input: {
  repoIntelEnabled: boolean;
  index: BlastIndexSnapshot;
  result: Pick<BlastIntelResult, 'degraded' | 'reason'>;
}): BlastStatus {
  const { repoIntelEnabled, index, result } = input;
  if (!repoIntelEnabled) return { degraded: true, reason: 'flag_off' };

  switch (index.status) {
    case 'degraded':
    case 'failed':
      return { degraded: true, reason: index.degradedReason ?? 'index_failed' };
    case 'partial':
      return { degraded: true, reason: 'index_partial' };
    case 'full':
      return result.degraded
        ? { degraded: true, reason: result.reason ?? 'no_data' }
        : { degraded: false, reason: null };
    default: {
      const unreachable: never = index.status;
      return unreachable;
    }
  }
}
