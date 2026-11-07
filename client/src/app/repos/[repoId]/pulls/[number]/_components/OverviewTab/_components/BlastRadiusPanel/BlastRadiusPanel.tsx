/* BlastRadiusPanel — container: loads the PR blast radius, renders its states and wires index resync. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastChips } from "./_components/BlastChips";
import { BlastDegradedNotice } from "./_components/BlastDegradedNotice";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastSymbolCard } from "./_components/BlastSymbolCard";
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
  const resync = useBlastResync(repoId, prId);

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={t("loading")}>
        <Skeleton height={SKELETON_HEIGHT} />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState title={t("loadError")} onRetry={() => refetch()} />;
  }

  const withoutCallers = symbolsWithoutCallers(data);
  const showResync = canResync(data.reason) && (resync.canStart || resync.resyncing);

  return (
    <div style={s.root}>
      <BlastSummary counts={data.counts} />
      {data.reason !== null && (
        <BlastDegradedNotice
          reason={data.reason}
          onResync={showResync ? resync.start : undefined}
          resyncing={resync.resyncing}
          timedOut={resync.timedOut}
        />
      )}
      {data.downstream.length === 0 && isMapComputed(data) && (
        <p style={s.note}>{t("noDownstream", { count: data.counts.symbols })}</p>
      )}
      <div style={s.list}>
        {data.downstream.map((item) => (
          <BlastSymbolCard
            key={`${item.file}::${item.symbol}`}
            item={item}
            repoFullName={repoFullName}
            linkSha={data.link_sha}
          />
        ))}
      </div>
      {withoutCallers > 0 && data.downstream.length > 0 && (
        <p style={s.note}>{t("withoutCallers", { count: withoutCallers })}</p>
      )}
      {data.callers_omitted > 0 && <p style={s.note}>{t("callersOmitted", { count: data.callers_omitted })}</p>}
      <BlastChips kind="endpoint" label={t("unattributed")} items={data.unattributed_endpoints} />
    </div>
  );
}
