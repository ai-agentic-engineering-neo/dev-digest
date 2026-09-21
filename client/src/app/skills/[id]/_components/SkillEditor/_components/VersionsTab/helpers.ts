/** Format an ISO timestamp using the codebase's established convention
    (guarded toLocaleString — see ReviewRunAccordion/CommentCard). */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
