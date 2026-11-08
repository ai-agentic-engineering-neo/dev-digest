/* BlastRadiusPanel — container: loads the PR blast radius, renders its states in a card, wires
   the Tree / Graph switch and index resync, and ends with the prior-PRs footer. */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useBlastRadius, usePriorPulls } from "@/lib/hooks/blast";
import { BlastChips } from "./_components/BlastChips";
import { BlastDegradedNotice } from "./_components/BlastDegradedNotice";
import { BlastGraph } from "./_components/BlastGraph";
import { BlastPriorPulls } from "./_components/BlastPriorPulls";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastSymbolCard } from "./_components/BlastSymbolCard";
import { BlastViewToggle, type BlastView } from "./_components/BlastViewToggle";
import { SKELETON_HEIGHT } from "./constants";
import { canResync, isMapComputed, symbolsWithoutCallers } from "./helpers";
import { useBlastResync } from "./hooks/useBlastResync";
import { s } from "./styles";

export function BlastRadiusPanel({
  prId,
  repoId,
  repoFullName,
}: {
  prId: string;
  repoId: string;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);
  // Started here, not in the footer, so it runs in parallel with /blast and survives a /blast error.
  const prior = usePriorPulls(prId);
  const resync = useBlastResync(repoId, prId);
  const [view, setView] = useState<BlastView>("tree");

  if (isLoading) {
    return (
      <div style={s.card} aria-busy="true" aria-label={t("loading")}>
        <Skeleton height={SKELETON_HEIGHT} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={s.card}>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
        <BlastPriorPulls repoId={repoId} query={prior} />
      </div>
    );
  }

  const withoutCallers = symbolsWithoutCallers(data);
  const showResync = canResync(data.reason) && (resync.canStart || resync.resyncing);
  const hasMap = data.downstream.length > 0;

  return (
    <div style={s.card}>
      <div style={s.header}>
        <BlastSummary counts={data.counts} />
        {hasMap && <BlastViewToggle value={view} onChange={setView} />}
      </div>
      {data.summary && <p style={s.summary}>{data.summary}</p>}
      {data.reason !== null && (
        <BlastDegradedNotice
          reason={data.reason}
          onResync={showResync ? resync.start : undefined}
          resyncing={resync.resyncing}
          timedOut={resync.timedOut}
        />
      )}
      {!hasMap && isMapComputed(data) && (
        <p style={s.note}>{t("noDownstream", { count: data.counts.symbols })}</p>
      )}
      {hasMap && view === "graph" && <BlastGraph downstream={data.downstream} />}
      {hasMap && view === "tree" && (
        <div style={s.tree}>
          {data.downstream.map((item) => (
            <BlastSymbolCard
              key={`${item.file}::${item.symbol}`}
              item={item}
              repoFullName={repoFullName}
              linkSha={data.link_sha}
            />
          ))}
        </div>
      )}
      {withoutCallers > 0 && hasMap && (
        <p style={s.note}>{t("withoutCallers", { count: withoutCallers })}</p>
      )}
      {data.callers_omitted > 0 && <p style={s.note}>{t("callersOmitted", { count: data.callers_omitted })}</p>}
      <BlastChips kind="endpoint" label={t("unattributed")} items={data.unattributed_endpoints} />
      <BlastPriorPulls repoId={repoId} query={prior} />
    </div>
  );
}
