/* IntentCard — a self-contained, deletable subtree: why this PR exists, its
   declared scope, and where the model thinks it's risky. Own hooks, own
   loading/empty/ready/error states; the Overview tab only mounts it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Chip, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost";
import { ApiError } from "@/lib/api";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/intent";
import { CONFIDENCE_COLOR, SOURCE_KIND_ORDER } from "./constants";
import { isFixedSourceLabel, sortBySourceOrder, sourceRefText, splitSources } from "./helpers";
import { s } from "./styles";

function deriveErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "the request failed";
}

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <Card>
          <Skeleton height={16} width="60%" style={{ marginBottom: 12 }} />
          <Skeleton height={13} width="100%" style={{ marginBottom: 6 }} />
          <Skeleton height={13} width="85%" />
        </Card>
      </section>
    );
  }

  const intent = data?.intent ?? null;

  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Target">{t("block.intent")}</SectionLabel>
        <Card style={s.emptyCard}>
          <div style={s.emptyText}>{t("intent.empty")}</div>
          <div style={s.emptyHint}>{t("intent.emptyHint")}</div>
          <Button
            kind="primary"
            size="sm"
            icon="Target"
            loading={derive.isPending}
            onClick={() => derive.mutate()}
          >
            {derive.isPending ? t("intent.deriving") : t("intent.derive")}
          </Button>
          {derive.error && (
            <div role="alert" style={s.error}>
              {t("intent.deriveFailed", { message: deriveErrorMessage(derive.error) })}
            </div>
          )}
        </Card>
      </section>
    );
  }

  const confColor = CONFIDENCE_COLOR[intent.confidence];
  const { used, unresolved } = splitSources(intent.sources);
  const orderedUsed = sortBySourceOrder(used, SOURCE_KIND_ORDER);
  const orderedUnresolved = sortBySourceOrder(unresolved, SOURCE_KIND_ORDER);
  const hasInScope = intent.in_scope.length > 0;
  const hasOutOfScope = intent.out_of_scope.length > 0;
  const hasRiskAreas = intent.risk_areas.length > 0;

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
            <Badge color={confColor.color} bg={confColor.bg}>
              {t(`intent.confidence.${intent.confidence}`)}
            </Badge>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={derive.isPending}
              onClick={() => derive.mutate()}
            >
              {t("intent.rederive")}
            </Button>
          </div>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <Card>
        <p style={s.quote}>&ldquo;{intent.intent}&rdquo;</p>

        <div style={s.scopeGrid}>
          <div>
            <div style={{ ...s.scopeLabel, color: "var(--ok)" }}>
              <Icon.Check size={13} />
              {t("intent.inScope")}
            </div>
            {hasInScope ? (
              <ScopeList items={intent.in_scope} color="var(--ok)" />
            ) : (
              <div style={s.sourceUnresolved}>{t("intent.none")}</div>
            )}
          </div>
          <div>
            <div style={{ ...s.scopeLabel, color: "var(--text-muted)" }}>
              <Icon.X size={13} />
              {t("intent.outOfScope")}
            </div>
            {hasOutOfScope ? (
              <ScopeList items={intent.out_of_scope} color="var(--text-muted)" />
            ) : (
              <div style={s.sourceUnresolved}>{t("intent.none")}</div>
            )}
          </div>
        </div>

        {hasRiskAreas && (
          <div style={s.risks}>
            <div style={s.risksLabel}>{t("intent.riskAreas")}</div>
            <div style={s.chipRow}>
              {intent.risk_areas.map((risk, i) => (
                <Chip key={i}>{risk}</Chip>
              ))}
            </div>
          </div>
        )}

        {intent.confidence === "low" && (
          <div style={s.notice}>
            <Icon.Info size={14} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
            <span>{t("intent.lowNotice")}</span>
          </div>
        )}

        {intent.stale && (
          <div style={s.staleNotice}>
            <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
            <span>{t("intent.staleNotice")}</span>
          </div>
        )}

        <div style={s.derivedFrom}>
          <span style={s.derivedFromLabel}>{t("intent.derivedFrom")}: </span>
          {orderedUsed.map((src, i) => (
            <React.Fragment key={`u-${src.kind}-${src.ref}-${i}`}>
              {i > 0 && ", "}
              <span className="mono" style={s.sourceUsed}>
                {isFixedSourceLabel(src.kind) ? t(`intent.sourceKind.${src.kind}`) : sourceRefText(src)}
              </span>
              {src.status === "truncated" && <span style={s.truncatedTag}> ({t("intent.truncated")})</span>}
            </React.Fragment>
          ))}
          {orderedUnresolved.length > 0 && (
            <>
              {" · "}
              {t("intent.unresolved")}:{" "}
              {orderedUnresolved.map((src, i) => (
                <span key={`r-${src.kind}-${src.ref}-${i}`} style={s.sourceUnresolved}>
                  {i > 0 && ", "}
                  {isFixedSourceLabel(src.kind) ? t(`intent.sourceKind.${src.kind}`) : sourceRefText(src)}
                  {src.note ? ` (${src.note})` : ""}
                </span>
              ))}
            </>
          )}
        </div>

        <div style={s.meta}>
          {intent.model && <span className="mono">{intent.model}</span>}
          <RunCostBadge
            costUsd={intent.cost_usd}
            tokensIn={intent.tokens_in}
            tokensOut={intent.tokens_out}
            variant="detailed"
          />
          {intent.head_sha && <span className="mono">head {intent.head_sha.slice(0, 7)}</span>}
        </div>

        {derive.error && (
          <div role="alert" style={s.error}>
            {t("intent.deriveFailed", { message: deriveErrorMessage(derive.error) })}
          </div>
        )}
      </Card>
    </section>
  );
}

function ScopeList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{ fontSize: 12.5, color: "var(--text-secondary)", display: "flex", gap: 7, lineHeight: 1.45 }}
        >
          <span style={{ color, marginTop: 1 }}>·</span>
          {item}
        </li>
      ))}
    </ul>
  );
}
