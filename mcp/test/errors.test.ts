import { describe, it, expect } from 'vitest';
import { toToolError, UserError } from '../src/errors.js';
import { ApiError } from '../src/api/client.js';

describe('toToolError', () => {
  it('wraps UserError and ApiError as isError text', () => {
    expect(toToolError(new UserError('fix it'))).toEqual({ isError: true, content: [{ type: 'text', text: 'fix it' }] });
    expect(toToolError(new ApiError('unavailable', 'run ./scripts/dev.sh')).content[0]!.text).toContain('./scripts/dev.sh');
  });
  it('does not leak arbitrary internals beyond the message', () => {
    const r = toToolError(new Error('kaput'));
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('Unexpected error: kaput');
  });
  it('maps aborts', () => {
    const e = new Error('x');
    e.name = 'AbortError';
    expect(toToolError(e).content[0]!.text).toContain('cancelled');
  });
});
