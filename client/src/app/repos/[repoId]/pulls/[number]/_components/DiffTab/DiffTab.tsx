"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent } from "../../../helpers";
import { DEFAULT_ORDER, type DiffOrder } from "./constants";
import { diffTotals, flaggedPathsOf, orderFilesByGroups, uniqueByPath } from "./helpers";
import { OrderToggle } from "./OrderToggle";
import { SmartDiffGroup } from "./SmartDiffGroup";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  reviews: ReviewRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
}

const NO_PATHS: ReadonlySet<string> = new Set();

export function DiffTab({
  prId,
  filesCount,
  files: rawFiles,
  canComment,
  reviews,
  repoFullName,
  headSha,
}: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const files = React.useMemo(() => uniqueByPath(rawFiles), [rawFiles]);
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const findingAction = useFindingAction();
  const { data: smartDiff } = useSmartDiff(prId, headSha);
  // Comments AND findings start visible (P1: a finding must be visible right
  // after expanding a file, no extra click); toggle off for a clean diff.
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>(DEFAULT_ORDER);

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

  const groups = smartDiff?.groups;
  const findingApi: DiffFindingApi = {
    findings: latestFindingsPerAgent(reviews),
    flaggedPaths: groups ? flaggedPathsOf(groups) : NO_PATHS,
    onAction: (findingId, action) => findingAction.mutate({ findingId, action, prId: prId ?? undefined }),
    pendingFindingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    repoFullName,
    headSha,
  };

  const showSmart = order === "smart" && !!groups;
  const totals = diffTotals(files);

  // Shown whenever there's something for it to hide — GitHub comments or
  // findings — so it isn't only reachable when someone has also commented.
  const commentsToggle =
    commentCount > 0 || findingApi.findings.length > 0 ? (
      <Button
        kind="ghost"
        size="sm"
        icon={showComments ? "EyeOff" : "Eye"}
        onClick={() => setShowComments((v) => !v)}
      >
        {showComments ? "Hide comments" : "Show comments"}
        {commentCount > 0 ? ` (${commentCount})` : ""}
      </Button>
    ) : undefined;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {commentsToggle}
            {groups && <OrderToggle value={order} onChange={setOrder} />}
          </span>
        }
      >
        {showSmart ? (
          <>
            {t("reviewerOrdered")}
            {" · "}
            {t("filesCount", { count: totals.count })}
            {" · "}
            <span style={{ color: "var(--code-add-text)" }}>+{totals.additions}</span>
            {" "}
            <span style={{ color: "var(--code-del-text)" }}>−{totals.deletions}</span>
          </>
        ) : (
          `Files changed · ${filesCount} files`
        )}
      </SectionLabel>
      {showSmart ? (
        orderFilesByGroups(groups, files).map((g) => (
          <SmartDiffGroup
            key={g.role}
            role={g.role}
            files={g.files}
            flaggedCount={g.flaggedCount}
            findings={findingApi}
            commenting={commenting}
          />
        ))
      ) : (
        <DiffViewer files={files} findings={findingApi} commenting={commenting} />
      )}
    </section>
  );
}
