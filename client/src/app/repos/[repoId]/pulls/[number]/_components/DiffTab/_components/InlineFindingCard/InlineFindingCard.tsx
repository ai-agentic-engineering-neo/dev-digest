/* InlineFindingCard — the FindingCard from Agent runs, reused verbatim under a
   diff line (server/specs/06-smart-diff.md): same severity/title/rationale,
   same Accept/Dismiss wired to the same mutation. */
"use client";

import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../../../FindingCard";

export function InlineFindingCard({
  f,
  prId,
  repoFullName,
  headSha,
}: {
  f: FindingRecord;
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const action = useFindingAction(prId);
  return (
    <FindingCard
      f={f}
      defaultExpanded
      pending={action.isPending}
      repoFullName={repoFullName}
      headSha={headSha}
      onAction={(act) => action.mutate({ findingId: f.id, action: act })}
    />
  );
}
