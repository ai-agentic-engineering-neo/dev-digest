"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import { usePrBlast, useResyncBlast } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { blastStats, degradedReasonKey, symbolRows } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

/** Blast radius of the PR: changed symbols, their downstream callers, endpoints and crons. */
export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrBlast(prId, headSha);
  const resync = useResyncBlast(repoId, prId);

  if (isLoading) {
    return (
      <div style={s.card} aria-busy="true" aria-label={t("card.loading")}>
        <Skeleton height={16} width={120} />
        <Skeleton height={48} />
        <Skeleton height={80} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={s.card}>
        <div style={s.center}>
          <p role="alert" style={s.hint}>{t("card.loadFailed")}</p>
          <Button size="sm" onClick={() => refetch()}>{t("card.retry")}</Button>
        </div>
      </div>
    );
  }

  const stats = blastStats(data);
  const rows = symbolRows(data);
  const reasonKey = degradedReasonKey(data.reason);
  const statItems = [
    { key: "symbols", value: stats.symbols },
    { key: "callers", value: stats.callers },
    { key: "endpoints", value: stats.endpoints },
    { key: "crons", value: stats.crons },
  ] as const;

  return (
    <div style={s.card}>
      <h3 style={s.title}>{tBrief("block.blast")}</h3>

      <div style={s.stats}>
        {statItems.map((it) => (
          <div key={it.key} style={s.stat}>
            <span style={s.statValue}>{it.value}</span>
            <span style={s.statLabel}>{t(`stat.${it.key}`, { count: it.value })}</span>
          </div>
        ))}
      </div>

      {data.degraded && (
        <div role="status" style={s.banner}>
          <span style={s.bannerTitle}>
            <Icon.AlertTriangle size={14} aria-hidden />
            {t("degraded.title")}
          </span>
          {reasonKey && <span>{t(`degraded.reason.${reasonKey}`)}</span>}
          <span>{t("degraded.hint")}</span>
          <Button size="sm" icon="RefreshCw" loading={resync.isPending} disabled={resync.isPending} onClick={resync.resync}>
            {t("degraded.resync")}
          </Button>
          {resync.isSuccess && <span>{t("degraded.resyncStarted")}</span>}
          {resync.isError && <span role="alert">{t("degraded.resyncFailed")}</span>}
        </div>
      )}

      {!data.degraded && stats.callers === 0 && (
        <p style={s.hint}>{t("noDownstream", { count: stats.symbols })}</p>
      )}

      {rows.length > 0 && (
        <ul style={s.list}>
          {rows.map((row) => (
            <li key={row.name} style={{ minWidth: 0 }}>
              <div style={s.symbolHead}>
                <span className="mono" style={s.symbolName} title={row.name}>{row.name}</span>
                <span style={s.symbolCount}>{t("callerCount", { count: row.callers.length })}</span>
              </div>
              {row.callers.length > 0 && (
                <ul style={s.callers}>
                  {row.callers.map((c) => {
                    const label = `${c.file}:${c.line}`;
                    return (
                      <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                        <span className="mono" style={s.callerName} title={c.name}>{c.name}</span>
                        {repoFullName ? (
                          <a
                            className="mono"
                            style={s.callerPath}
                            href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={label}
                            aria-label={t("card.openOnGithub", { file: c.file, line: c.line })}
                          >
                            {label}
                          </a>
                        ) : (
                          <span className="mono" style={s.callerPath} title={label}>{label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {(row.endpoints.length > 0 || row.crons.length > 0) && (
                <div style={s.chips}>
                  {row.endpoints.map((e) => (
                    <Badge key={`e:${e}`} mono><span style={s.chipText} title={e}>{e}</span></Badge>
                  ))}
                  {row.crons.map((c) => (
                    <Badge key={`c:${c}`} mono icon="Clock"><span style={s.chipText} title={c}>{c}</span></Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
