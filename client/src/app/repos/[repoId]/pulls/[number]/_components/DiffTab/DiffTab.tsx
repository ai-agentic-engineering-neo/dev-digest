"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const {
    data: comments,
    isLoading: commentsLoading,
    isError: commentsError,
    refetch: refetchComments,
  } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    // A failure is toasted by the global error policy; the rejection reaches
    // the composer, which keeps the draft open.
    onSubmit: async (input) => {
      const res = await create.mutateAsync(input);
      setShowComments(true); // a just-posted comment shouldn't stay hidden
      return res;
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentsLoading ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("diffTab.commentsLoading")}</span>
          ) : commentsError && !comments ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("diffTab.commentsError")}</span>
              <Button kind="ghost" size="sm" icon="RefreshCw" onClick={() => refetchComments()}>
                {t("diffTab.commentsRetry")}
              </Button>
            </span>
          ) : commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer files={files} commenting={commenting} />
    </section>
  );
}
