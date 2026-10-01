"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import { usePrBlast, useResyncBlast } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { MAX_OTHER_ENDPOINTS, MAX_VISIBLE_SYMBOLS, STAT_ICON } from "./constants";
import { blastStats, degradedReasonKey, hasImpact, symbolRows, unattributedEndpoints, type SymbolRow } from "./helpers";
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
  const [showAll, setShowAll] = useState(false);
  const [showAllOther, setShowAllOther] = useState(false);

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
  // The summary counts every changed symbol; the list shows only those with an impact.
  const rows = symbolRows(data).filter(hasImpact);
  const visible = showAll ? rows : rows.slice(0, MAX_VISIBLE_SYMBOLS);
  const hidden = rows.length - MAX_VISIBLE_SYMBOLS;
  const otherEndpoints = unattributedEndpoints(data);
  const otherVisible = showAllOther ? otherEndpoints : otherEndpoints.slice(0, MAX_OTHER_ENDPOINTS);
  const otherHidden = otherEndpoints.length - MAX_OTHER_ENDPOINTS;
  const reasonKey = degradedReasonKey(data.reason);
  const statItems = [
    { key: "symbols", value: stats.symbols },
    { key: "callers", value: stats.callers },
    { key: "endpoints", value: stats.endpoints },
    { key: "crons", value: stats.crons },
  ] as const;

  return (
    <div style={s.card}>
      <h3 style={s.title}>
        <Icon.Target size={14} aria-hidden />
        {tBrief("block.blast")}
      </h3>

      <div style={s.stats}>
        {statItems.map((it) => {
          const StatIcon = Icon[STAT_ICON[it.key]];
          return (
            <span key={it.key} style={s.stat}>
              <StatIcon size={14} aria-hidden />
              <strong style={s.statValue}>{it.value}</strong>
              <span style={s.statLabel}>{t(`stat.${it.key}`, { count: it.value })}</span>
            </span>
          );
        })}
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
          {visible.map((row, i) => (
            <SymbolCard
              key={row.name}
              row={row}
              defaultOpen={i === 0}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </ul>
      )}

      {otherEndpoints.length > 0 && (
        <div style={s.other}>
          <span style={s.otherLabel}>{t("card.otherEndpoints", { count: otherEndpoints.length })}</span>
          <div style={s.chips}>
            {otherVisible.map((e) => (
              <span key={e} className="mono" style={s.endpointChip} title={e}>
                <Icon.Globe size={12} aria-hidden />
                <span style={s.chipText}>{e}</span>
              </span>
            ))}
          </div>
          {otherHidden > 0 && (
            <Button size="sm" kind="ghost" onClick={() => setShowAllOther((v) => !v)}>
              {showAllOther ? t("card.showFewerEndpoints") : t("card.showMoreEndpoints", { count: otherHidden })}
            </Button>
          )}
        </div>
      )}

      {hidden > 0 && (
        <Button size="sm" kind="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("card.showFewerSymbols") : t("card.showMoreSymbols", { count: hidden })}
        </Button>
      )}
    </div>
  );
}

interface SymbolCardProps {
  row: SymbolRow;
  defaultOpen: boolean;
  repoFullName: string | null;
  headSha: string;
}

/** One changed symbol: a collapsible header, its callers as GitHub links, then endpoint/cron chips. */
function SymbolCard({ row, defaultOpen, repoFullName, headSha }: SymbolCardProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <li style={s.symbolCard}>
      <button type="button" style={s.symbolHead} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Chevron size={14} aria-hidden />
        <span style={s.symbolIcon}><Icon.Code size={14} aria-hidden /></span>
        <span className="mono" style={s.symbolName} title={row.name}>{row.name}</span>
        <span style={s.symbolCount}>{t("callerCount", { count: row.callers.length })}</span>
      </button>

      {open && (
        <div style={s.symbolBody}>
          {row.callers.length > 0 && (
            <ul style={s.callers}>
              {row.callers.map((c) => {
                const label = `${c.file}:${c.line}`;
                return (
                  <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                    <span style={s.connector}><Icon.CornerDownRight size={13} aria-hidden /></span>
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
                    <span className="mono" style={s.callerName} title={c.name}>{c.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {(row.endpoints.length > 0 || row.crons.length > 0) && (
            <div style={s.chips}>
              {row.endpoints.map((e) => (
                <span key={`e:${e}`} className="mono" style={s.endpointChip} title={e}>
                  <Icon.Globe size={12} aria-hidden />
                  <span style={s.chipText}>{e}</span>
                </span>
              ))}
              {row.crons.map((c) => (
                <span key={`c:${c}`} className="mono" style={s.cronChip} title={c}>
                  <Icon.Clock size={12} aria-hidden />
                  <span style={s.chipText}>{c}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
