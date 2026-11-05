/** "2026-05-30T…" → "2026-05-30" (design shows the date only). */
export function versionDate(iso: string): string {
  return iso.slice(0, 10);
}
