import { describe, expect, it, vi } from 'vitest';
import { captureHandler, stubClient } from '../test-utils.js';
import { registerGetBlastRadiusTool } from './get-blast-radius.js';

describe('get_blast_radius (stub)', () => {
  it('returns isError:true with a "not implemented, do not retry/infer" message', async () => {
    const get = vi.fn();
    const post = vi.fn();
    const handler = captureHandler(registerGetBlastRadiusTool, stubClient({ get, post }));

    const result = await handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toMatch(/not implemented/i);
    expect(text).toMatch(/do not retry/i);
    expect(text).toMatch(/do not infer/i);
  });

  it('makes zero calls against the injected ApiClient', async () => {
    const get = vi.fn();
    const post = vi.fn();
    const handler = captureHandler(registerGetBlastRadiusTool, stubClient({ get, post }));

    await handler({ repo: 'acme/payments-api', pr: 482 });

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
