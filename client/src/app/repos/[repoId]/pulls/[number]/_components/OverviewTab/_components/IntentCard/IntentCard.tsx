/* IntentCard — the PR's derived intent (server/specs/05-intent-layer.md):
   plain-text intent, change-type chip, confidence badge, inferred/stale hints,
   in/out-of-scope bullets, sources (client-built links), model/cost, Refresh.
   Empty state (no derivation yet) offers a "Derive now" CTA. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRefreshIntent } from "@/lib/hooks/intent";
import { formatUsd } from "@/lib/format-usage";
import { confidenceColor, isSourceOk, sourceHref, sourceIcon } from "./helpers";
import { s } from "./styles";

export interface IntentCardProps {
  prId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function IntentCard({ prId, repoFullName, headSha }: IntentCardProps) {
  const t = useTranslations("prReview");
  const { data, isLoading } = usePrIntent(prId);
  const refresh = useRefreshIntent(prId);

  if (isLoading) return <Skeleton height={140} />;

  const intent = data?.intent ?? null;
  if (!intent) {
    return (
      <EmptyState
        icon="Target"
        title={t("intent.empty.title")}
        body={t("intent.empty.body")}
        cta={t("intent.empty.cta")}
        ctaLoading={refresh.isPending}
        onCta={() => refresh.mutate()}
      />
    );
  }

  const color = confidenceColor(intent.confidence);

  return (
    <section style={s.card} aria-label={t("intent.title")}>
      <div style={s.header}>
        <Icon.Target size={16} style={s.headerIcon} />
        <span style={s.headerTitle}>{t("intent.title")}</span>
        <div style={s.headerRight}>
          {intent.change_type && <Badge>{t(`intent.changeType.${intent.change_type}`)}</Badge>}
          {intent.confidence && (
            <Badge color={color.fg} bg={color.bg}>
              {t(`intent.confidence.${intent.confidence}`)}
            </Badge>
          )}
          <Button kind="ghost" size="sm" icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {t("intent.refresh")}
          </Button>
        </div>
      </div>

      {intent.derived_from === "inferred" && <p style={s.hint}>{t("intent.inferredHint")}</p>}
      {data?.stale && <p style={s.hint}>{t("intent.staleHint")}</p>}

      <p style={s.text}>{intent.intent}</p>

      {intent.in_scope.length > 0 && (
        <div style={s.scopeBlock}>
          <div style={s.scopeLabel}>{t("intent.inScope")}</div>
          <ul style={s.scopeList}>
            {intent.in_scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {intent.out_of_scope.length > 0 && (
        <div style={s.scopeBlock}>
          <div style={s.scopeLabel}>{t("intent.outOfScope")}</div>
          <ul style={s.scopeList}>
            {intent.out_of_scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.sources && intent.sources.length > 0 && (
        <div style={s.sourcesBlock}>
          <div style={s.scopeLabel}>{t("intent.sources")}</div>
          <ul style={s.sourceList}>
            {intent.sources.map((src, i) => {
              const SourceIcon = Icon[sourceIcon(src.kind)];
              const href = repoFullName ? sourceHref(src, repoFullName, headSha) : undefined;
              const ok = isSourceOk(src.status);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: sources have no stable id
                <li key={`${src.kind}-${src.ref}-${i}`} style={s.sourceRow}>
                  <SourceIcon size={13} style={s.sourceIcon} />
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" style={s.sourceRef}>
                      {src.ref}
                    </a>
                  ) : (
                    <span style={s.sourceRefPlain}>{src.ref}</span>
                  )}
                  <span style={s.sourceStatus(ok)}>
                    {t(`intent.sourceStatus.${src.status}`)}
                    {src.detail ? ` — ${src.detail}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div style={s.footer}>
        <span className="mono" style={s.footerModel}>
          {intent.model}
        </span>
        <span>{formatUsd(intent.cost_usd)}</span>
      </div>
    </section>
  );
}
