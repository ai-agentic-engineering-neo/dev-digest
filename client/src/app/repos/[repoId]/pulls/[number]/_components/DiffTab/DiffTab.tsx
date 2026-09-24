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
import { groupFiles, totals } from "./helpers";
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

  const latestReview = reviews?.[0];
  const hasReview = !!reviews && reviews.length > 0;
  const commentCount = comments?.length ?? 0;

  // One toggle hides GitHub comments, finding cards and the unmatched block
  // together. Until the user flips it, it follows the latest review (on when it
  // has findings), so a finished Run review reveals its findings live
  // (server/specs/06-smart-diff.md, "Live update"/toggle decision).
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);
  const show = showOverride ?? (latestReview?.findings.length ?? 0) > 0;

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
    items: latestReview?.findings ?? [],
    flagged,
    show,
    renderCard: (f) => <InlineFindingCard f={f} prId={prId} />,
  };

  const groups = React.useMemo(() => groupFiles(files, smartDiff), [files, smartDiff]);
  const { additions, deletions } = totals(files);

  return (
    <section>
      <SectionLabel icon="Code" right={<OrderToggle order={order} onSetOrder={onSetOrder} />}>
        {t("smartDiff.heading")}
      </SectionLabel>
      <div style={s.summaryRow}>
        <span style={s.summaryText}>{t("smartDiff.summary", { files: filesCount, additions, deletions })}</span>
        {!hasReview ? (
          <span style={s.noReviewHint}>{t("smartDiff.noReview")}</span>
        ) : commentCount > 0 || (latestReview?.findings.length ?? 0) > 0 ? (
          <Button
            kind="ghost"
            size="sm"
            icon={show ? "EyeOff" : "Eye"}
            style={s.toggleButton}
            onClick={() => setShowOverride(!show)}
          >
            {t(show ? "diff.hideComments" : "diff.showComments", { count: commentCount })}
          </Button>
        ) : null}
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
              flaggedCount={g.flaggedCount}
              defaultCollapsed={DEFAULT_COLLAPSED_ROLES.has(g.role)}
              commenting={commenting}
              findingApi={findingApi}
            />
          ))}
        </div>
      )}
    </section>
  );
}
