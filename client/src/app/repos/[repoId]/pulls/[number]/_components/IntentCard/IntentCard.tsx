/* IntentCard — Overview's "Intent" card (L03): derived PR intent + scope,
   deterministic confidence, and the sources it came from. Rendered above
   Description; states: loading / empty / error / ready. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { formatCost } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { CONFIDENCE_COLOR, KIND_ICON } from "./constants";
import { sourceText, isResolved } from "./helpers";
import { s } from "./styles";

export interface IntentCardProps {
  prId: string | null;
}

/** The derive-mutation failure alert. Shared by the empty and ready states so
    the markup isn't duplicated (frontend-ui-architecture §4). */
function DeriveErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" style={s.mutationError}>
      {message}
    </div>
  );
}

export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("intent");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) {
    return (
      <Card>
        <div role="status" aria-label={t("loading")} style={s.loading}>
          <Skeleton width="40%" />
          <Skeleton width="92%" />
          <Skeleton width="86%" />
          <Skeleton width="74%" />
          <Skeleton width="60%" />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <ErrorState title={t("error.title")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const intent = data?.intent ?? null;

  const deriveErrorMessage =
    derive.error instanceof ApiError ? derive.error.message : derive.error?.message;
  const deriveErrorText = t("error.derive", { message: deriveErrorMessage ?? "" });

  if (!intent) {
    return (
      <Card>
        <EmptyState
          icon="Target"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={t("empty.cta")}
          onCta={() => derive.mutate({ force: false })}
          ctaLoading={derive.isPending}
        />
        {derive.isError && <DeriveErrorAlert message={deriveErrorText} />}
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
            <Badge dot color={CONFIDENCE_COLOR[intent.confidence]}>
              {t(`confidence.${intent.confidence}`)}
            </Badge>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              aria-label={t("regenerateAria")}
              loading={derive.isPending}
              onClick={() => derive.mutate({ force: true })}
            >
              {t("regenerate")}
            </Button>
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      {derive.isError && <DeriveErrorAlert message={deriveErrorText} />}

      <p style={s.summary}>&ldquo;{intent.intent}&rdquo;</p>

      <div style={s.scopeGrid}>
        <div>
          <div style={{ ...s.scopeLabel, ...s.scopeLabelInScope }}>
            <Icon.Check size={12} />
            {t("inScope")}
          </div>
          {intent.in_scope.length === 0 ? (
            <div style={s.scopeEmpty}>{t("noneStated")}</div>
          ) : (
            <ul style={s.scopeList}>
              {intent.in_scope.map((item) => (
                <li key={item} style={s.scopeItem}>
                  <span style={s.scopeItemMarker}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div style={{ ...s.scopeLabel, ...s.scopeLabelOutOfScope }}>
            <Icon.X size={12} />
            {t("outOfScope")}
          </div>
          {intent.out_of_scope.length === 0 ? (
            <div style={s.scopeEmpty}>{t("noneStated")}</div>
          ) : (
            <ul style={s.scopeList}>
              {intent.out_of_scope.map((item) => (
                <li key={item} style={s.scopeItem}>
                  <span style={s.scopeItemMarker}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {intent.confidence === "low" && (
        <div style={s.hint}>
          <Icon.Info size={13} />
          {t("lowHint")}
        </div>
      )}
      {intent.downgraded && (
        <div style={s.hint}>
          <Icon.Info size={13} />
          {t("downgraded")}
        </div>
      )}
      {intent.stale && (
        <div style={s.hint}>
          <Icon.Info size={13} />
          {t("stale")}
        </div>
      )}

      <div style={s.sourcesLabel}>{t("sources.label")}</div>
      <div style={s.sourcesRow}>
        {intent.sources.map((src) => {
          const resolved = isResolved(src);
          const suffix = !resolved
            ? ` (${t(`sources.status.${src.status}` as "sources.status.unresolved")})`
            : src.status === "truncated"
              ? ` (${t("sources.status.truncated")})`
              : "";
          const title = src.reason ? t(`sources.reason.${src.reason}` as "sources.reason.empty") : undefined;
          return (
            <span key={`${src.kind}-${src.ref}`} title={title}>
              <Badge icon={KIND_ICON[src.kind]} color={resolved ? undefined : "var(--text-muted)"}>
                {sourceText(src)}
                {suffix}
              </Badge>
            </span>
          );
        })}
      </div>

      <div style={s.meta}>
        {intent.model ?? "—"} · {formatCost(intent.cost_usd) ?? t("costUnknown")}
      </div>
    </Card>
  );
}
