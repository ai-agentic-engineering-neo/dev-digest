/** Locale date-time for timestamps in lists; "—" for a missing or invalid value. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "—";
  return new Date(at).toLocaleString();
}
