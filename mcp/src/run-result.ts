import type { RunFindings } from '@devdigest/shared';
import { UserError } from './errors.js';
import { shapeFindings, type FindingsOptions } from './format.js';

/** Shape a terminal run: failed/cancelled become a user-facing error, done becomes findings. */
export function terminalRunPayload(data: RunFindings, opts: FindingsOptions) {
  const { run } = data;
  if (run.status === 'failed' || run.status === 'cancelled') {
    throw new UserError(
      `Run ${run.run_id} ${run.status}: ${run.error ?? 'no error recorded'}. Check the API log or retry; run_id ${run.run_id}.`,
    );
  }
  return shapeFindings(data, opts);
}
