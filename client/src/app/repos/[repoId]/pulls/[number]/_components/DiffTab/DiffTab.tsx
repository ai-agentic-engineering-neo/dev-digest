"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useLiveRunRefresh, usePrReviews, useSmartDiff } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { DEFAULT_COLLAPSED_ROLES, type DiffOrder } from "./constants";
import { commentedPaths, currentFindings, groupFiles, totals } from "./helpers";
import { RoleGroup } from "./_components/RoleGroup";
import { InlineFindingCard } from "./_components/InlineFindingCard";
import { OrderToggle } from "./_components/OrderToggle";
import { s } from "./styles";

interface DiffTabProps {
  prId: string;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  order: DiffOrder;
  onSetOrder: (order: DiffOrder) => void;
}

export function DiffTab({ prId, filesCount, files, canComment, order, onSetOrder }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  // A run that finishes while this tab is open refreshes counters/dots live,
  // even though no run-status UI is rendered here (server/specs/06-smart-diff.md).
  useLiveRunRefresh(prId);

  // Each agent's newest review — the same findings the PR list counts.
  const findings = React.useMemo(() => currentFindings(reviews), [reviews]);
  const hasReview = !!reviews && reviews.length > 0;
  // The toggle hides GitHub comments and finding cards alike, so its label counts both.
  const toggleCount = (comments?.length ?? 0) + findings.length;

  // One toggle hides GitHub comments, finding cards and the unmatched block
  // together. Until the user flips it, it follows the current findings (on when
  // there are any), so a finished Run review reveals its findings live
  // (server/specs/06-smart-diff.md, "Live update"/toggle decision).
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);
  const show = showOverride ?? findings.length > 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment,
    showComments: show,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("diff.postFailed"));
        throw err;
      }
    },
  };

  const flagged = React.useMemo(() => {
    const set = new Set<string>();
    for (const group of smartDiff?.groups ?? []) {
      for (const f of group.files) if (f.finding_lines.length > 0) set.add(f.path);
    }
    return set;
  }, [smartDiff]);

  const findingApi: DiffFindingApi<FindingRecord> = {
    items: findings,
    flagged,
    show,
    renderCard: (f) => <InlineFindingCard f={f} prId={prId} />,
  };

  const groups = React.useMemo(() => groupFiles(files, smartDiff, findings), [files, smartDiff, findings]);
  // Smart order opens only the files someone commented on or a finding points at.
  const commented = React.useMemo(() => commentedPaths(comments, findings), [comments, findings]);
  const fileDefaultOpen = React.useCallback((f: PrFile) => commented.has(f.path), [commented]);
  const { additions, deletions } = totals(files);
  const canToggle = hasReview && toggleCount > 0;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerActions}>
            {canToggle && (
              <Button kind="ghost" size="sm" icon={show ? "EyeOff" : "Eye"} onClick={() => setShowOverride(!show)}>
                {t(show ? "diff.hideComments" : "diff.showComments", { count: toggleCount })}
              </Button>
            )}
            <OrderToggle order={order} onSetOrder={onSetOrder} />
          </div>
        }
      >
        {t("smartDiff.heading")}
      </SectionLabel>
      <div style={s.summaryRow}>
        <span className="tnum" style={s.summaryText}>
          {t.rich("smartDiff.summary", {
            files: filesCount,
            additions,
            deletions,
            add: (chunks) => <span style={s.addText}>{chunks}</span>,
            del: (chunks) => <span style={s.delText}>{chunks}</span>,
          })}
        </span>
        {!hasReview && <span style={s.noReviewHint}>{t("smartDiff.noReview")}</span>}
      </div>

      {order === "original" ? (
        <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />
      ) : (
        <div style={s.list}>
          {groups.map((g) => (
            <RoleGroup
              key={g.role}
              role={g.role}
              files={g.files}
              counts={g.counts}
              defaultCollapsed={DEFAULT_COLLAPSED_ROLES.has(g.role)}
              commenting={commenting}
              findingApi={findingApi}
              fileDefaultOpen={fileDefaultOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
