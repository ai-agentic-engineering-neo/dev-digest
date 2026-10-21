import { createHash } from 'node:crypto';

/**
 * Cache key of a derived PR intent. Pure (node:crypto only) and a leaf so both
 * the reviews service and the seed (db ring) use the one implementation; the
 * prompt version is a parameter so this file never imports reviewer-core.
 */
export interface IntentHashInput {
  promptVersion: number;
  provider: string;
  model: string;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

/** sha256 over everything whose change must invalidate a stored intent. */
export function sourceHash(i: IntentHashInput): string {
  const parts = [String(i.promptVersion), i.provider, i.model, i.title, i.body ?? '', i.branch, i.headSha];
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}
