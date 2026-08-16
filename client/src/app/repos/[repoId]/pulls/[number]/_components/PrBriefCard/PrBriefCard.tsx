/* PrBriefCard — specs/11-why-risk-brief.md. Full-width section ABOVE the
   Intent/Blast-Radius grid (Q8, the design mockup's placement). Renders, in
   order (AC-36/D2): risk level + provenance line, WHAT, WHY, RISK AREAS,
   REVIEW FOCUS. Generation is explicit-action only (D13/N5) — nothing here
   auto-generates on mount, poll, or any other implicit trigger. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Markdown, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatCost, relativeTime } from "@/lib/format";
import { RiskArea } from "./RiskArea";
import { ReviewFocusList } from "./ReviewFocusList";
import { STATUS_META, SEVERITY_COLOR, SEVERITY_ICON } from "./constants";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  repoFullName,
  onFocusFile,
}: {
  prId: string | null;
  repoFullName?: string | null;
  onFocusFile?: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const toast = useToast();
  const { data: page, isLoading } = useBrief(prId);
  const generate = useGenerateBrief(prId);

  const generating = generate.isPending || page?.status === "generating";
  const hasBrief = !!page?.brief;

  function onGenerate(regenerate: boolean) {
    generate.mutate(
      { regenerate },
      {
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Couldn't generate the brief.");
        },
      },
    );
  }

  if (isLoading || !page) {
    return (
      <section>
        <SectionLabel icon="Sparkles">{t("section.title")}</SectionLabel>
        <div style={s.loadingStack}>
          <Skeleton height={20} width={240} />
          <Skeleton height={60} />
          <Skeleton height={120} />
        </div>
      </section>
    );
  }

  const meta = STATUS_META[page.status];
  const StatusIcon = Icon[meta.icon];
  const bannerText =
    page.status === "possibly_stale"
      ? t("status.possibly_stale", { markers: page.stale_markers.join(", ") || t("status.generated") })
      : page.reason
        ? `${t(`status.${page.status}`)} — ${page.reason}`
        : t(`status.${page.status}`);

  return (
    <section>
      <SectionLabel
        icon="Sparkles"
        right={
          <Button
            kind="primary"
            size="sm"
            icon="RefreshCw"
            loading={generating}
            disabled={generating || !prId}
            onClick={() => onGenerate(hasBrief)}
          >
            {generating ? t("generate.generating") : hasBrief ? t("generate.regenerate") : t("generate.generate")}
          </Button>
        }
      >
        {t("section.title")}
      </SectionLabel>

      {/* AC-41/AC-42: one distinct rendering per status, announced to assistive tech. */}
      <div style={s.banner(meta.color, meta.bg)} role="status" aria-live="polite">
        <StatusIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{bannerText}</span>
      </div>

      {!hasBrief && page.status === "none" && (
        <EmptyState icon="Sparkles" title={t("section.emptyTitle")} body={t("section.emptyBody")} />
      )}

      {hasBrief && page.brief && (
        <>
          <div style={s.headRow}>
            <div style={s.levelRow}>
              {(() => {
                const LevelIcon = Icon[SEVERITY_ICON[page.brief.risk_level]];
                return <LevelIcon size={16} style={{ color: SEVERITY_COLOR[page.brief.risk_level], flexShrink: 0 }} />;
              })()}
              <span style={s.levelLabel(SEVERITY_COLOR[page.brief.risk_level])}>
                {t(`risk.level.${page.brief.risk_level}`)}
              </span>
            </div>
          </div>

          {page.provenance && (
            <p style={s.provenance}>
              {t("provenance.generatedBy", {
                when: relativeTime(page.provenance.generated_at),
                model: page.provenance.model,
                cost: formatCost(page.provenance.cost_usd),
              })}
            </p>
          )}

          <div style={s.block}>
            <div style={s.blockLabel}>{t("section.what")}</div>
            <div style={s.prose}>
              <Markdown>{page.brief.what}</Markdown>
            </div>
          </div>

          <div style={s.block}>
            <div style={s.blockLabel}>{t("section.why")}</div>
            <div style={s.prose}>
              <Markdown>{page.brief.why}</Markdown>
            </div>
          </div>

          <div style={s.block}>
            <div style={s.blockLabel}>{t("section.risks")}</div>
            {page.brief.risks.length === 0 ? (
              <p style={s.prose}>{t("section.noRisks")}</p>
            ) : (
              <div style={s.riskList}>
                {page.brief.risks.map((risk, i) => (
                  <RiskArea
                    key={`${risk.kind}-${i}`}
                    risk={risk}
                    repoFullName={repoFullName}
                    headSha={page.provenance?.head_sha}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={s.block}>
            <div style={s.blockLabel}>{t("section.focus")}</div>
            <ReviewFocusList
              items={page.brief.review_focus}
              repoFullName={repoFullName}
              headSha={page.provenance?.head_sha}
              onFocusFile={onFocusFile}
            />
          </div>
        </>
      )}
    </section>
  );
}
