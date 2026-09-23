import { z } from 'zod';
import { PERF_RANGE_PRESETS, MAX_RANGE_DAYS, type PerfRange } from './perf.js';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/**
 * specs/16-agent-performance-dashboard.md — the range querystring shared by
 * `GET /agents/performance` (all agents) and `GET /agents/:id/stats` (one
 * agent), so both routes validate identically. Either a fixed preset
 * (`range_days`) or a custom `from`/`to` pair (both required together),
 * following the same optional-`from`/`to` shape `ci/routes.ts`'s `RunsQuery`
 * already uses. `from`/`to` reject an inverted or oversized span so neither
 * the performance query nor the trend day-by-day loop is unbounded.
 */
export const PerfRangeQuery = z
  .object({
    range_days: z.coerce.number().int().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null), {
    message: 'from and to must both be provided together',
  })
  .refine((v) => v.range_days == null || (PERF_RANGE_PRESETS as readonly number[]).includes(v.range_days), {
    message: `range_days must be one of ${PERF_RANGE_PRESETS.join(', ')}`,
  })
  .refine((v) => v.from == null || v.to == null || new Date(v.from) < new Date(v.to), {
    message: 'from must be before to',
  })
  .refine(
    (v) => {
      if (v.from == null || v.to == null) return true;
      const spanDays = (new Date(v.to).getTime() - new Date(v.from).getTime()) / (24 * 60 * 60 * 1000);
      return spanDays <= MAX_RANGE_DAYS;
    },
    { message: `custom range may not exceed ${MAX_RANGE_DAYS} days` },
  );
export type PerfRangeQuery = z.infer<typeof PerfRangeQuery>;

/** Turn a validated `PerfRangeQuery` into the `PerfRange` the service layer
 *  expects — `from`/`to` win when both are present, else the preset (default
 *  30 when neither was supplied). */
export function toPerfRange(query: PerfRangeQuery): PerfRange {
  if (query.from != null && query.to != null) {
    return { from: new Date(query.from), to: new Date(query.to) };
  }
  return { days: query.range_days ?? 30 };
}
