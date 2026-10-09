export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export function validatePhone(value: string): ValidationResult {
  if (!PHONE_RE.test(value)) {
    return { valid: false, errors: ['must be 7-15 digits, optionally starting with +'] };
  }
  return { valid: true, errors: [] };
}
