"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrBriefResponse } from "@/lib/types";
import { VerdictBanner } from "../../../VerdictBanner";
import { BriefSectionLabel } from "../BriefSectionLabel";
import { BriefBody } from "./_components/BriefBody";
import { VerdictProvenance } from "./_components/VerdictProvenance";
import type { BriefVerdict } from "./types";
import { s } from "./styles";

interface PrBriefCardProps {
  data: PrBriefResponse | undefined;
  loadError: boolean;
  /** mutation pending OR data.generating, computed by the caller */
  generating: boolean;
  generateError: unknown;
  onGenerate: () => void;
  onRetryLoad: () => void;
  verdict?: BriefVerdict;
  onRetryVerdict?: () => void;
}

const NO_VERDICT: BriefVerdict = { state: "none" };

/** PR Brief card: section label, then the brief inside a verdict banner (or the plain box). */
export function PrBriefCard({
  data,
  loadError,
  generating,
  generateError,
  onGenerate,
  onRetryLoad,
  verdict = NO_VERDICT,
  onRetryVerdict,
}: PrBriefCardProps) {
  const t = useTranslations("brief");
  const headingId = useId();

  const body = (
    <BriefBody
      data={data}
      loadError={loadError}
      generating={generating}
      generateError={generateError}
      onGenerate={onGenerate}
      onRetryLoad={onRetryLoad}
    />
  );

  let content;
  switch (verdict.state) {
    case "ready":
      content = (
        <VerdictBanner
          verdict={verdict.verdict}
          score={verdict.score}
          findingsCount={verdict.findings}
          blockers={verdict.blockers}
          summary={null}
          agentName={null}
          titleAside={<VerdictProvenance agentName={verdict.agentName} reviewedAt={verdict.reviewedAt} />}
          body={body}
          stackOnNarrow
        />
      );
      break;
    case "error":
      content = (
        <div style={s.box}>
          <div role="alert" style={s.verdictError}>
            <span>{t("verdict.unavailable")}</span>
            <Button kind="ghost" size="sm" aria-label={t("verdict.retry")} onClick={onRetryVerdict}>
              {t("actions.retry")}
            </Button>
          </div>
          {body}
        </div>
      );
      break;
    case "none":
      content = <div style={s.box}>{body}</div>;
      break;
    default: {
      const unreachable: never = verdict;
      return unreachable;
    }
  }

  return (
    <section style={s.root} aria-labelledby={headingId}>
      <BriefSectionLabel id={headingId} icon="Sparkles">
        {t("card.title")}
      </BriefSectionLabel>
      {content}
    </section>
  );
}
