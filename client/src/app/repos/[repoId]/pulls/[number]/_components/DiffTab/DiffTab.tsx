"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { SmartDiffViewer } from "../SmartDiffViewer";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { SmartDiff, PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  smartDiff: SmartDiff | null | undefined;
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, smartDiff, canComment }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
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

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
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
        Files changed · {filesCount} files{smartDiff ? " · Smart Diff (grouped by role)" : ""}
      </SectionLabel>
      {smartDiff && smartDiff.groups.length > 0 ? (
        <SmartDiffViewer smartDiff={smartDiff} files={files} commenting={commenting} />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
