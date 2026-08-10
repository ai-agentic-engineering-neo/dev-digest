import { describe, expect, it, vi } from 'vitest';
import { getBlastRadiusInputSchema, makeGetBlastRadiusHandler } from '../../src/tools/get-blast-radius.js';

describe('get_blast_radius input schema', () => {
  it('requires a non-empty repo string and a positive integer pr', () => {
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: 42 }).success).toBe(true);
    expect(getBlastRadiusInputSchema.safeParse({ repo: '', pr: 42 }).success).toBe(false);
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: -1 }).success).toBe(false);
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: 1.5 }).success).toBe(false);
  });
});

describe('get_blast_radius handler (pure stub)', () => {
  it('makes ZERO backend calls', async () => {
    const mockFetch = vi.fn();
    const handler = makeGetBlastRadiusHandler();
    await handler({ repo: 'acme/widgets', pr: 42 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the not_implemented stub shape, echoing repo/pr as given', async () => {
    const handler = makeGetBlastRadiusHandler();
    const result = await handler({ repo: 'Acme/Widgets', pr: 7 });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
    expect(parsed.status).toBe('not_implemented');
    expect(parsed.repo).toBe('Acme/Widgets');
    expect(parsed.pr).toBe(7);
    expect(parsed.message).toContain('not implemented yet');
  });

  it('returns the same stub for a typo-plausible repo/pr as for a valid one', async () => {
    const handler = makeGetBlastRadiusHandler();
    const a = await handler({ repo: 'totally-not-a-real-repo', pr: 999999 });
    const b = await handler({ repo: 'acme/widgets', pr: 1 });
    const parsedA = JSON.parse((a.content as { type: 'text'; text: string }[])[0]!.text);
    const parsedB = JSON.parse((b.content as { type: 'text'; text: string }[])[0]!.text);
    expect(parsedA.status).toBe(parsedB.status);
    expect(parsedA.message).toBe(parsedB.message);
  });
});
