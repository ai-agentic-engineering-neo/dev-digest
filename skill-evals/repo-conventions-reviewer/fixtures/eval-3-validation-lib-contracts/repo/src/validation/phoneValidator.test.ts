import { describe, expect, it } from 'vitest';
import { validatePhone } from './phoneValidator';

describe('validatePhone', () => {
  it('accepts a well-formed number', () => {
    expect(validatePhone('+15551234567')).toEqual({ valid: true, errors: [] });
  });

  it('rejects a malformed number', () => {
    expect(validatePhone('abc').valid).toBe(false);
  });
});
