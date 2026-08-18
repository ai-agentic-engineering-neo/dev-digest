import { describe, expect, it } from 'vitest';
import { validateEmail } from './emailValidator';

describe('validateEmail', () => {
  it('accepts a well-formed address', () => {
    expect(validateEmail('a@b.com')).toEqual({ valid: true, errors: [] });
  });

  it('rejects a malformed address', () => {
    expect(validateEmail('not-an-email').valid).toBe(false);
  });
});
