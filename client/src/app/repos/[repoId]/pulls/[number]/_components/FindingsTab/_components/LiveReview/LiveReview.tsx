/* LiveReview — in-flight runs of this PR: cancel / open-trace actions, the live
   SSE log (RunStatus) and the "review in progress" note. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, Button, SectionLabel } from "@devdigest/ui";
import { useCancelRun } from "@/lib/hooks/reviews";
import { RunStatus } from "../../../RunStatus";
import { s } from "../../styles";

interface LiveReviewProps {
  prId: string;
  runIds: string[];
  onOpenTrace: (runId: string) => void;
}

export function LiveReview({ prId, runIds, onOpenTrace }: LiveReviewProps) {
  const t = useTranslations("prReview");
  const cancel = useCancelRun(prId);
  const firstRunId = runIds[0];
  if (!firstRunId) return null;

  return (
    <>
      <div style={s.liveRunSection}>
        <SectionLabel
          icon="Sparkles"
          right={
            <div style={s.cancelActions}>
              <Button
                kind="danger"
                size="sm"
                icon="X"
                loading={cancel.isPending}
                onClick={() => runIds.forEach((id) => cancel.mutate(id))}
              >
                {t("findingsTab.cancel")}
              </Button>
              <Button kind="ghost" size="sm" icon="FileText" onClick={() => onOpenTrace(firstRunId)}>
                {t("findingsTab.openTrace")}
              </Button>
            </div>
          }
        >
          {t("findingsTab.liveReview")}
        </SectionLabel>
        <RunStatus runIds={runIds} />
      </div>
      <div style={s.reviewInProgress}>
        <Icon.RefreshCw size={16} style={s.spinnerIcon} />
        <span style={s.reviewInProgressText}>{t("findingsTab.inProgressTitle")}</span>
        <span style={s.reviewInProgressSub}>{t("findingsTab.inProgressBody")}</span>
      </div>
    </>
  );
}
