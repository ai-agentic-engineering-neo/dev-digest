/* IntentCard — the PR's derived intent on the Overview tab: an italic quote,
   in/out of scope, and a collapsed "Sources · model · cost" disclosure. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { IntentSource, Risk } from "@devdigest/shared";
import { usePrIntent, useRefreshIntent } from "@/lib/hooks/reviews";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { BASIC_KINDS, CONFIDENCE_META, STATUS_META } from "./constants";
import { reasonKey, sourceHref } from "./helpers";
import { RiskAreas } from "../RiskAreas";
import { s } from "./styles";

function SourceRow({ source, href }: { source: IntentSource; href: string | null }) {
  const t = useTranslations("intent");
  const meta = STATUS_META[source.status];
  const rk = reasonKey(source.reason);
  return (
    <li style={s.sourceRow}>
      <span style={s.sourceKind}>{t(`sourceKind.${source.kind}`)}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="mono" style={s.sourceRef}>
          {source.ref}
        </a>
      ) : (
        <span className="mono" style={s.sourceRef}>
          {source.ref}
        </span>
      )}
      <Badge color={meta.color} bg={meta.bg}>
        {t(`sourceStatus.${source.status}`)}
      </Badge>
      {rk && <span style={s.reason}>{t(`reason.${rk}`)}</span>}
    </li>
  );
}

function ScopeList({ kind, items }: { kind: "in" | "out"; items: string[] }) {
  const t = useTranslations("intent");
  const inScope = kind === "in";
  const Mark = inScope ? Icon.Check : Icon.X;
  return (
    <div>
      <div style={s.scopeTitle(inScope ? "var(--ok)" : "var(--text-muted)")}>
        <Mark size={12} />
        {inScope ? t("inScope") : t("outOfScope")}
      </div>
      <ul style={s.list}>
        {items.map((item) => (
          <li key={item}>
            <span aria-hidden style={s.bullet}>
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IntentCard({
  prId,
  repoFullName,
  risks,
  onOpenRef,
}: {
  prId: string | null;
  repoFullName: string | null;
  /** Risk areas of the stored PR brief; nothing renders when absent or empty. */
  risks?: Risk[];
  onOpenRef?: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("intent");
  const { data, isLoading, error } = usePrIntent(prId);
  const refresh = useRefreshIntent(prId);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  const label = (
    <span style={s.label}>
      <Icon.Target size={14} />
      {t("title")}
    </span>
  );

  if (isLoading) {
    return (
      <Card>
        <div style={s.headRow}>{label}</div>
        <div style={{ marginTop: 12 }}>
          <Skeleton height={80} />
        </div>
      </Card>
    );
  }

  if (!data) {
    const noIntentYet = error instanceof ApiError && error.status === 404;
    return (
      <Card>
        <div style={s.headRow}>{label}</div>
        {noIntentYet ? (
          <EmptyState icon="Target" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <div style={{ ...s.reason, marginTop: 12 }}>{t("loadFailed")}</div>
        )}
        <div style={s.centered}>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={refresh.isPending}
            disabled={!prId}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? t("refreshing") : t("refresh")}
          </Button>
        </div>
      </Card>
    );
  }

  const conf = CONFIDENCE_META[data.confidence];
  const sources = [
    ...data.sources.filter((src) => BASIC_KINDS.has(src.kind)),
    ...data.sources.filter((src) => !BASIC_KINDS.has(src.kind)),
  ];
  const ToggleIcon = sourcesOpen ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <Card>
      <div style={s.headRow}>
        {label}
        <span style={s.spacer} />
        {data.stale && (
          <span title={t("staleHint")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("stale")}
            </Badge>
          </span>
        )}
        <span title={data.confidence === "low" ? t("confidence.lowHint") : undefined}>
          <Badge color={conf.color} bg={conf.bg}>
            {t(`confidence.${data.confidence}`)}
          </Badge>
        </span>
        <IconBtn
          icon="RefreshCw"
          label={t("refreshLabel")}
          size={28}
          active={refresh.isPending}
          onClick={() => {
            if (!refresh.isPending) refresh.mutate();
          }}
        />
      </div>

      <p style={s.quote}>{`“${data.intent}”`}</p>

      {(data.in_scope.length > 0 || data.out_of_scope.length > 0) && (
        <div style={s.scopeGrid}>
          {data.in_scope.length > 0 && <ScopeList kind="in" items={data.in_scope} />}
          {data.out_of_scope.length > 0 && <ScopeList kind="out" items={data.out_of_scope} />}
        </div>
      )}

      {risks && risks.length > 0 && <RiskAreas risks={risks} onOpenRef={onOpenRef} />}

      <button
        type="button"
        style={s.disclosure}
        aria-expanded={sourcesOpen}
        onClick={() => setSourcesOpen((o) => !o)}
      >
        <ToggleIcon size={14} />
        <span>{t("sourcesToggle", { count: data.sources.length })}</span>
        {data.model && (
          <span>
            · {data.model} · {formatCost(data.cost_usd)}
          </span>
        )}
      </button>

      {sourcesOpen && (
        <>
          <ul style={s.sources}>
            {sources.map((src) => (
              <SourceRow
                key={`${src.kind}:${src.ref}`}
                source={src}
                href={sourceHref(src, repoFullName, data.head_sha)}
              />
            ))}
          </ul>
          {data.model && (
            <div style={s.derived}>
              {t("derivedBy", {
                model: data.model,
                when: relativeTime(data.derived_at),
                tokens: (data.tokens_in ?? 0) + (data.tokens_out ?? 0),
                cost: formatCost(data.cost_usd),
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
