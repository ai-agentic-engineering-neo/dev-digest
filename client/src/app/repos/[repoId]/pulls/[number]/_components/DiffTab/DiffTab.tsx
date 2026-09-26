"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { findingsByFile, orderFromParam, orderToParam, type DiffOrder } from "./helpers";
import { InlineFindingCard } from "./_components/InlineFindingCard";
import { OrderToggle } from "./_components/OrderToggle";
import { SmartOrderView } from "./_components/SmartOrderView";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** `?order=` from the URL (`page.tsx` owns it, like `tab` and `trace`). */
  orderParam: string | null;
  onOrderParamChange: (v: string | null) => void;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  orderParam,
  onOrderParamChange,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const order: DiffOrder = orderFromParam(orderParam);

  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews, isPending: reviewsPending } = usePrReviews(prId);
  const findingAction = useFindingAction();
  const {
    data: smartDiff,
    isPending: smartPending,
    isError: smartErrored,
  } = useSmartDiff(order === "smart" ? prId : null);

  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  // The single source of truth for finding markers (dots/chips/cards) — see
  // `server/specs/L03-smart-diff.md` § Contract. Never reads smart-diff's
  // `finding_lines`.
  const byFile = React.useMemo(() => findingsByFile(reviews ?? []), [reviews]);
  const findingApi: DiffFindingApi = {
    byFile,
    Card: InlineFindingCard,
    pending: findingAction.isPending,
    onAction: (findingId, action) =>
      findingAction.mutate({ findingId, action, prId: prId ?? undefined }),
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerActions}>
            <OrderToggle order={order} onChange={(o) => onOrderParamChange(orderToParam(o))} />
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments
                  ? t("diffTab.hideComments", { count: commentCount })
                  : t("diffTab.showComments", { count: commentCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("diffTab.title", { count: filesCount })}
      </SectionLabel>

      {reviewsPending ? (
        <Skeleton height={200} />
      ) : order === "original" ? (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      ) : smartPending ? (
        <Skeleton height={200} />
      ) : smartErrored || !smartDiff ? (
        <>
          <div style={s.unavailable}>{t("smartDiff.unavailable")}</div>
          <DiffViewer files={files} commenting={commenting} findings={findingApi} />
        </>
      ) : (
        <SmartOrderView
          files={files}
          smart={smartDiff}
          byFile={byFile}
          commenting={commenting}
          findings={findingApi}
        />
      )}
    </section>
  );
}
