"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRegenerateIntent } from "@/lib/hooks/intent";
import { formatCostUsd } from "@/lib/format";
import { RiskAreaRow } from "./RiskAreaRow";
import { confidenceTone } from "./helpers";
import { SOURCE_KIND_KEY, SOURCE_STATUS_KEY } from "./constants";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null;
}

function ScopeList({
  label,
  items,
  empty,
  tone,
}: {
  label: string;
  items: string[];
  empty: string;
  tone: "in" | "out";
}) {
  const Mark = tone === "in" ? Icon.Check : Icon.X;
  const labelStyle = { ...s.label, ...(tone === "in" ? s.labelIn : s.labelOut) };
  return (
    <div style={{ minWidth: 0 }}>
      <h4 style={labelStyle}>
        <Mark size={13} aria-hidden />
        {label}
      </h4>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item} style={s.listItem}>
              <span aria-hidden style={s.bullet} />
              <span style={s.listItemText}>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={s.hint}>{empty}</p>
      )}
    </div>
  );
}

/** The PR's derived intent: quoted claim, scope, risk areas, provenance, cost. */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief.intentCard");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const regenerate = useRegenerateIntent(prId);

  const busy = regenerate.isPending;
  const generateBtn = (label: string) => (
    <Button size="sm" icon="RefreshCw" loading={busy} disabled={busy || !prId} onClick={() => regenerate.mutate()}>
      {label}
    </Button>
  );
  const regenError = regenerate.isError ? (
    <p role="alert" style={s.hint}>{t("regenerateFailed")}</p>
  ) : null;

  if (isLoading) {
    return (
      <div style={s.card} aria-busy="true" aria-label={t("loading")}>
        <Skeleton height={16} width={120} />
        <Skeleton height={48} />
        <Skeleton height={80} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={s.card}>
        <div style={s.center}>
          <p role="alert" style={s.hint}>{t("loadFailed")}</p>
          <Button size="sm" onClick={() => refetch()}>{t("retry")}</Button>
        </div>
      </div>
    );
  }

  const intent = data?.intent ?? null;
  if (!intent) {
    return (
      <div style={s.card}>
        <div style={s.center}>
          <h3 style={s.title}>{t("empty")}</h3>
          <p style={s.hint}>{t("emptyHint")}</p>
          {generateBtn(t("generate"))}
          {regenError}
        </div>
      </div>
    );
  }

  const tone = confidenceTone(intent.confidence_level);
  return (
    <div style={s.card}>
      <div style={s.header}>
        <h3 style={s.title}>{t("title")}</h3>
        <Badge color={tone.color} bg={tone.bg} icon={intent.confidence_level === "low" ? "AlertTriangle" : "Check"}>
          {t(`confidence.${intent.confidence_level}`)}
        </Badge>
        <span style={s.spacer}>{generateBtn(t("regenerate"))}</span>
      </div>

      {data?.stale && (
        <div role="status" style={s.notice}>
          <Icon.Clock size={14} aria-hidden />
          {t("stale")}
        </div>
      )}
      {intent.confidence_level === "low" && <p style={s.hint}>{t("lowHint")}</p>}
      {regenError}

      <blockquote style={s.quote}>{intent.intent}</blockquote>

      <div style={s.scopeGrid}>
        <ScopeList label={t("inScope")} items={intent.in_scope} empty={t("noneStated")} tone="in" />
        <ScopeList label={t("outOfScope")} items={intent.out_of_scope} empty={t("noneStated")} tone="out" />
      </div>

      <div>
        <h4 style={s.label}>
          <Icon.AlertTriangle size={13} aria-hidden />
          {t("riskAreas")}
        </h4>
        {intent.risk_areas.length > 0 ? (
          <div style={s.risks}>
            {intent.risk_areas.map((r) => (
              <RiskAreaRow key={`${r.file}:${r.line}:${r.title}`} risk={r} />
            ))}
          </div>
        ) : (
          <p style={s.hint}>{t("noRisks")}</p>
        )}
      </div>

      <div>
        <h4 style={s.label}>{t("sources")}</h4>
        <div style={s.chips}>
          {intent.sources_used.map((src) => {
            const status = t(`sourceStatus.${SOURCE_STATUS_KEY[src.status]}`);
            return (
              <Badge
                key={`${src.kind}:${src.ref}`}
                mono
                style={{ fontWeight: 500, opacity: src.status === "used" ? 1 : 0.65 }}
              >
                <span title={t(src.truncated ? "sourceTitleTruncated" : "sourceTitle", { ref: src.ref, status })}>
                  {t(`sourceKind.${SOURCE_KIND_KEY[src.kind]}`)}
                  {src.kind === "linked_issue" || src.kind === "plan_spec" ? ` ${src.ref}` : ""}
                  {src.status !== "used" ? ` · ${status}` : ""}
                </span>
              </Badge>
            );
          })}
        </div>
      </div>

      <div style={s.footer}>
        <span className="mono">{t("footer", { model: intent.model })}</span>
        <span>{t("cost", { cost: formatCostUsd(intent.cost_usd) })}</span>
      </div>
    </div>
  );
}
