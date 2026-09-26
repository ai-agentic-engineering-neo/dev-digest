"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { IntentSource, PrIntentRecord } from "@devdigest/shared";
import { confidenceTone, isIntentStale, sourceTone } from "./helpers";
import { s } from "./styles";

export interface IntentCardProps {
  intent: PrIntentRecord | null | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The PR's current head SHA; a stored intent derived at another SHA is flagged stale. */
  headSha: string | null | undefined;
  onRecompute: () => void;
  recomputing: boolean;
}

/** Presentational: `OverviewTab` owns the hooks and passes the state in. */
export function IntentCard({
  intent,
  isLoading,
  isError,
  headSha,
  onRecompute,
  recomputing,
}: IntentCardProps) {
  const t = useTranslations("prReview");

  const label = <SectionLabel icon="Target">{t("detail.intent.title")}</SectionLabel>;

  if (isLoading) {
    return (
      <section aria-busy="true">
        {label}
        <div style={s.card}>
          <div style={s.skeletonStack}>
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
            <Skeleton height={16} width="60%" />
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        {label}
        <div style={s.card}>
          <ErrorState
            title={t("detail.intent.errorTitle")}
            body={t("detail.intent.errorBody")}
            onRetry={onRecompute}
          />
        </div>
      </section>
    );
  }

  if (!intent) {
    return (
      <section>
        {label}
        <div style={s.emptyCard}>
          <span style={s.muted}>{t("detail.intent.empty")}</span>
          <Button kind="secondary" icon="Sparkles" onClick={onRecompute} loading={recomputing}>
            {t("detail.intent.compute")}
          </Button>
        </div>
      </section>
    );
  }

  const stale = isIntentStale(intent, headSha);
  const tone = confidenceTone(intent.confidence);

  return (
    <section>
      {label}
      <div style={s.card}>
        <blockquote style={s.quote}>{intent.intent}</blockquote>

        <div style={s.scopeGrid}>
          <ScopeList
            title={t("detail.intent.inScope")}
            items={intent.in_scope}
            icon="Check"
            iconStyle={s.inIcon}
          />
          <ScopeList
            title={t("detail.intent.outOfScope")}
            items={intent.out_of_scope}
            icon="X"
            iconStyle={s.outIcon}
          />
        </div>

        <div style={s.metaRow}>
          <Badge color={tone.color} bg={tone.bg} dot>
            {t("detail.intent.confidence", { level: t(`detail.intent.level.${intent.confidence}`) })}
          </Badge>
          {stale && (
            <span style={s.staleHint} role="status">
              <Icon.AlertTriangle size={14} />
              {t("detail.intent.stale")}
            </span>
          )}
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            onClick={onRecompute}
            disabled={recomputing}
            style={s.recompute}
          >
            {t("detail.intent.recompute")}
          </Button>
        </div>

        {intent.sources.length > 0 && (
          <div>
            <div style={s.scopeTitle}>{t("detail.intent.sources")}</div>
            <ul style={s.chipList}>
              {intent.sources.map((source, i) => (
                <li key={`${source.kind}:${source.ref}:${i}`}>
                  <SourceChip source={source} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {intent.missing_context.length > 0 && (
          <div>
            <div style={s.scopeTitle}>{t("detail.intent.missingContext")}</div>
            <ul style={s.list}>
              {intent.missing_context.map((item, i) => (
                <li key={`${i}:${item}`} style={s.listItem}>
                  <Icon.Info size={14} style={s.outIcon} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function ScopeList({
  title,
  items,
  icon,
  iconStyle,
}: {
  title: string;
  items: string[];
  icon: "Check" | "X";
  iconStyle: React.CSSProperties;
}) {
  const I = Icon[icon];
  return (
    <div>
      <div style={s.scopeTitle}>{title}</div>
      <ul style={s.list}>
        {items.map((item, i) => (
          <li key={`${i}:${item}`} style={s.listItem}>
            <I size={14} style={iconStyle} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Status is always spelled in words; the warning tone and icon are extra signals. */
function SourceChip({ source }: { source: IntentSource }) {
  const t = useTranslations("prReview");
  const tone = sourceTone(source.status);
  const kind = t(`detail.intent.sourceKind.${source.kind}`);
  const text = source.ref ? `${kind}: ${source.ref}` : kind;
  return (
    <Badge
      icon={source.status === "unavailable" ? "AlertTriangle" : undefined}
      color={tone?.color}
      bg={tone?.bg}
    >
      <span style={s.chipText} title={source.ref || undefined}>
        {text}
      </span>
      {source.status !== "ok" && <span>{t(`detail.intent.sourceStatus.${source.status}`)}</span>}
    </Badge>
  );
}
