"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffFocus } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import type { DiffOrder } from "./constants";
import { displayedFindings, joinGroupFiles, resolveDeepLink } from "./helpers";
import { useDiffDeepLink } from "./useDiffDeepLink";
import { OrderToggle } from "./_components/OrderToggle";
import { RoleGroup } from "./_components/RoleGroup";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** `file` / `line` query params of a deep link (matched only against changed paths). */
  focusFile?: string | null;
  focusLine?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, focusFile, focusLine }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  const findingAction = useFindingAction();
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  // One toggle for GitHub comments and review findings; visible by default.
  const [showComments, setShowComments] = React.useState(true);

  const shownFindings = React.useMemo(() => displayedFindings(smartDiff, reviews), [smartDiff, reviews]);
  const toggleCount = (comments?.length ?? 0) + shownFindings.length;
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

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

  const findingApi: DiffFindingApi = {
    findings: shownFindings,
    show: showComments,
    pendingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    onAction: (findingId, action) => {
      if (prId) findingAction.mutate({ findingId, action, prId });
    },
  };

  const target = React.useMemo(() => resolveDeepLink(files, focusFile, focusLine), [files, focusFile, focusLine]);
  const highlight = useDiffDeepLink(target);
  const focus: DiffFocus | undefined = target ? { ...target, highlight } : undefined;

  const smart = order === "smart" && smartDiff;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.toolbar}>
            <span className="mono tnum" style={s.summary}>
              {t("smartDiff.summary", { count: filesCount })} · +{additions} −{deletions}
            </span>
            <OrderToggle value={order} onChange={setOrder} />
            {toggleCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: toggleCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.title")}
      </SectionLabel>
      {smart ? (
        <div style={s.groups}>
          {smartDiff.groups
            .filter((g) => g.files.length > 0)
            .map((g) => (
              <RoleGroup
                key={g.role}
                role={g.role}
                files={joinGroupFiles(g, files)}
                filesWithFindings={g.files.filter((f) => f.finding_lines.length > 0).length}
                hasReview={smartDiff.has_review}
                findings={findingApi}
                commenting={commenting}
                forceOpen={!!target && g.files.some((f) => f.path === target.path)}
                focus={focus}
              />
            ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} focus={focus} />
      )}
    </section>
  );
}
