export function validatePostalCode(value: string): boolean {
  const country = process.env.DEFAULT_COUNTRY ?? 'US';
  if (country === 'US') {
    return /^\d{5}(-\d{4})?$/.test(value);
  }
  return value.trim().length > 0;
}
