export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): ValidationResult {
  if (!EMAIL_RE.test(value)) {
    return { valid: false, errors: ['must be a valid email address'] };
  }
  return { valid: true, errors: [] };
}
