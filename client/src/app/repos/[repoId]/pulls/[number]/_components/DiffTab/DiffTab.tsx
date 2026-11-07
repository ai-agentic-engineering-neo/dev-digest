"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton, ErrorState } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { FindingCard } from "@/components/finding-card";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { buildGroupViews } from "./helpers";
import { useDiffTabData } from "./hooks/useDiffTabData";
import { useStickyOffset } from "./hooks/useStickyOffset";
import { DiffToolbar, type DiffMode } from "./_components/DiffToolbar";
import { LargePrBanner } from "./_components/LargePrBanner";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { smart, comments, create, action, findings, hasReview, reviewsLoaded, tokens } = useDiffTabData(prId, files);
  const stickyTop = useStickyOffset();
  const [mode, setMode] = React.useState<DiffMode>("smart");
  const [showFindings, setShowFindings] = React.useState(true);

  const activeCount = findings.filter((f) => f.dismissed_at === null).length;

  const commenting: DiffCommentApi = {
    comments: comments.data ?? [],
    canComment: !!canComment && !!prId,
    showComments: showFindings,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowFindings(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings,
    show: showFindings,
    renderCard: (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        pending={action.isPending}
        onAction={(a) => action.mutate({ findingId: f.id, action: a, prId: prId ?? undefined })}
      />
    ),
    labels: {
      line: {
        CRITICAL: t("smartDiff.lineLabelBlocker"),
        WARNING: t("smartDiff.lineLabelWarning"),
        SUGGESTION: t("smartDiff.lineLabelSuggestion"),
      },
      outOfPatch: t("smartDiff.outOfPatch"),
      severityCount: (severity, count) => t("smartDiff.severityCount", { severity, count }),
      fileDot: (count) => t("smartDiff.fileDot", { count }),
    },
  };

  const splitSuggestion = smart.data?.split_suggestion;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <DiffToolbar
            mode={mode}
            onModeChange={setMode}
            labels={{
              toolbar: t("smartDiff.toolbarLabel"),
              smart: t("smartDiff.smartOrder"),
              original: t("smartDiff.originalOrder"),
            }}
            findingsToggle={{
              label: t(showFindings ? "smartDiff.hideFindings" : "smartDiff.showFindings", { count: activeCount }),
              shown: showFindings,
              disabled: activeCount === 0,
              onToggle: () => setShowFindings((v) => !v),
            }}
          />
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {reviewsLoaded && !hasReview && <p style={s.note}>{t("smartDiff.notRunYet")}</p>}
      {hasReview && tokens !== null && <p style={s.note}>{t("smartDiff.tokensNote", { tokens })}</p>}
      {splitSuggestion?.too_big && (
        <LargePrBanner
          title={t("smartDiff.largeTitle", { lines: splitSuggestion.total_lines })}
          body={t("smartDiff.largeBody")}
        />
      )}
      {mode === "original" ? (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      ) : smart.isLoading ? (
        <Skeleton height={120} />
      ) : smart.isError || !smart.data ? (
        <ErrorState title={t("smartDiff.loadError")} onRetry={() => smart.refetch()} />
      ) : (
        <div style={s.groups}>
          {buildGroupViews(smart.data, files).map((g) => (
            <SmartDiffGroup key={g.role} group={g} commenting={commenting} findings={findingApi} stickyTop={stickyTop} />
          ))}
        </div>
      )}
    </section>
  );
}
