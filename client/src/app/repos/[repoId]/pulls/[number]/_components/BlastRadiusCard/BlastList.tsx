/* List view of the Blast Radius card: one collapsible group per changed symbol
   (sorted by how many call sites reach it) → its callers grouped by file, with
   every call-site line linked to GitHub at the PR head; then entry points and
   affected tests. A filter narrows groups/callers by symbol or file. */
"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { symbolDisplayName } from "@/components/graph-canvas";
import { Badge, Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";
import { deletedSymbolNames, filterGroups, groupCallersByFile, splitPath } from "./helpers";
import { s } from "./styles";

/** Groups open by default (the rest stay collapsed to keep the page short). */
const OPEN_BY_DEFAULT = 3;
/** Files shown per group before "+N more files". */
const FILES_PREVIEW = 8;

interface BlastListProps {
  envelope: BlastRadiusResponse;
  repoFullName?: string | null;
  headSha?: string | null;
  onFocusFile?: (file: string, line: number | null) => void;
}

export function BlastList({ envelope, repoFullName, headSha, onFocusFile }: BlastListProps) {
  const t = useTranslations("impactGraph");
  const tCanvas = useTranslations("graph");
  const { data: blast, graph } = envelope;
  const deleted = deletedSymbolNames(envelope);
  const entryPoints = graph?.entryPoints;
  const tests = graph?.tests;
  const [query, setQuery] = useState("");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const fileOf = useMemo(() => {
    const m = new Map(blast.changed_symbols.map((c) => [c.name, c.file]));
    return (symbol: string) => m.get(symbol);
  }, [blast.changed_symbols]);
  const groups = useMemo(() => filterGroups(blast.downstream, query, fileOf), [blast.downstream, query, fileOf]);

  const filtering = query.trim().length > 0;
  const isOpen = (symbol: string, index: number) => toggled[symbol] ?? (filtering || index < OPEN_BY_DEFAULT);
  const allOpen = groups.every((g, i) => isOpen(g.symbol, i));
  const setAll = (open: boolean) => setToggled(Object.fromEntries(groups.map((g) => [g.symbol, open])));
  const link = (file: string, line?: number) =>
    repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line, line) : undefined;

  return (
    <div style={s.groupList}>
      {blast.downstream.length > 0 && (
        <div style={s.listToolbar}>
          <label style={s.search}>
            <Icon.Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("list.filterPlaceholder")}
              aria-label={t("list.filterPlaceholder")}
              style={s.searchInput}
            />
          </label>
          <button type="button" style={s.linkBtn} onClick={() => setAll(!allOpen)}>
            {allOpen ? t("list.collapseAll") : t("list.expandAll")}
          </button>
        </div>
      )}

      {filtering && groups.length === 0 && <div style={s.noCallers}>{t("list.noMatches", { query })}</div>}

      {groups.map((group, index) => {
        const open = isOpen(group.symbol, index);
        const files = groupCallersByFile(group.callers);
        const changedFile = fileOf(group.symbol);
        const isDeleted = deleted.has(group.symbol);
        const bodyId = `blast-group-${index}`;
        return (
          <div key={group.symbol} style={s.groupCard}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setToggled((m) => ({ ...m, [group.symbol]: !open }))}
              style={s.groupHeaderBtn}
            >
              <Icon.ChevronRight size={14} style={s.chevron(open)} aria-hidden />
              <span style={s.changedIcon} aria-hidden>
                <Icon.Edit size={12} />
              </span>
              <span style={s.groupTitle}>
                <span
                  className="mono"
                  style={{
                    ...s.groupSymbol,
                    textDecoration: isDeleted ? "line-through" : undefined,
                  }}
                >
                  {symbolDisplayName(group.symbol, tCanvas("moduleScope"))}
                </span>
                {changedFile && (
                  <span style={s.groupFile} title={changedFile}>
                    {changedFile}
                  </span>
                )}
              </span>
              {isDeleted && (
                <Badge color="var(--crit)" bg="var(--crit-bg)">
                  {t("list.deleted")}
                </Badge>
              )}
              <span style={s.countPill}>
                {t("stat.callers", { count: group.callers.length })}
                <span style={s.countSep}>·</span>
                {t("list.files", { count: files.length })}
              </span>
            </button>

            {open && (
              <div id={bodyId} style={s.groupBody}>
                {(group.endpoints_affected.length > 0 || group.crons_affected.length > 0) && (
                  <div style={s.factsRow}>
                    {group.endpoints_affected.map((e) => (
                      <Badge key={e} icon="Globe" color="var(--ok)" bg="var(--ok-bg)" mono>
                        {e}
                      </Badge>
                    ))}
                    {group.crons_affected.map((cron) => (
                      <Badge key={cron} icon="Clock" color="var(--text-secondary)" mono>
                        {cron}
                      </Badge>
                    ))}
                  </div>
                )}

                <ul style={s.fileList}>
                  {files.slice(0, FILES_PREVIEW).map((f) => {
                    const { dir, base } = splitPath(f.file);
                    const names = [...new Set(f.sites.map((x) => symbolDisplayName(x.name, tCanvas("moduleScope"))))];
                    return (
                      <li key={f.file} style={s.fileRow}>
                        <Icon.FileText size={13} style={s.fileIcon} aria-hidden />
                        <div style={s.fileMain}>
                          <a
                            href={link(f.file)}
                            target="_blank"
                            rel="noreferrer noopener"
                            style={s.filePath}
                            title={f.file}
                          >
                            <span style={s.fileDir}>{dir}</span>
                            <span style={s.fileBase}>{base}</span>
                          </a>
                          <span style={s.fileMeta}>
                            {t("list.in")} <span className="mono">{names.join(", ")}</span>
                          </span>
                        </div>
                        <div style={s.siteLines}>
                          {f.typeOnly && <span style={s.typeTag}>{t("list.typeOnly")}</span>}
                          {f.sites.map((site, i) => (
                            <a
                              key={`${site.line}-${i}`}
                              href={link(f.file, site.line)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mono"
                              style={site.typeOnly && !f.typeOnly ? s.lineChipType : s.lineChip}
                              title={`${f.file}:${site.line}${site.typeOnly ? ` (${t("list.typeOnly")})` : ""}`}
                              aria-label={`${f.file}:${site.line}`}
                            >
                              L{site.line}
                            </a>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {files.length > FILES_PREVIEW && (
                  <span style={s.moreNote}>
                    {t("list.moreFiles", {
                      count: files.length - FILES_PREVIEW,
                    })}
                  </span>
                )}
                {onFocusFile && changedFile && !isDeleted && (
                  <button type="button" style={s.linkBtn} onClick={() => onFocusFile(changedFile, null)}>
                    <Icon.Code size={12} /> {t("detail.showInDiff")}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {((entryPoints && entryPoints.items.length > 0) || (tests && tests.items.length > 0)) && (
        <div style={s.sideGrid}>
          {entryPoints && entryPoints.items.length > 0 && (
            <div style={s.groupCard}>
              <div style={s.plainHeader}>
                <Icon.Globe size={13} style={{ color: "var(--ok)" }} aria-hidden />
                <span style={s.plainTitle}>{t("list.entryPoints")}</span>
                <span style={s.countPill}>{entryPoints.total}</span>
              </div>
              <div style={s.sideBody}>
                <ul style={s.sideList}>
                  {entryPoints.items.map((e) => (
                    <li key={`${e.path}:${e.label}`} style={s.fileRow}>
                      <div style={s.fileMain}>
                        <span className="mono" style={s.entryLabel}>
                          {e.label}
                        </span>
                        <a
                          href={link(e.path)}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={s.filePath}
                          title={e.path}
                        >
                          <span style={s.fileDir}>{e.path}</span>
                        </a>
                      </div>
                      <span style={s.depthTag}>{t("list.depth", { depth: e.depth })}</span>
                    </li>
                  ))}
                </ul>
                {entryPoints.total > entryPoints.items.length && (
                  <span style={s.moreNote}>
                    {t("list.more", {
                      count: entryPoints.total - entryPoints.items.length,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {tests && tests.items.length > 0 && (
            <div style={s.groupCard}>
              <div style={s.plainHeader}>
                <Icon.FlaskConical size={13} style={{ color: "var(--info)" }} aria-hidden />
                <span style={s.plainTitle}>{t("list.tests")}</span>
                <span style={s.countPill}>{tests.total}</span>
              </div>
              <div style={s.sideBody}>
                <ul style={s.sideList}>
                  {tests.items.map((x) => {
                    const { dir, base } = splitPath(x.path);
                    return (
                      <li key={x.path} style={s.fileRow}>
                        <div style={s.fileMain}>
                          <a
                            href={link(x.path)}
                            target="_blank"
                            rel="noreferrer noopener"
                            style={s.filePath}
                            title={x.path}
                          >
                            <span style={s.fileDir}>{dir}</span>
                            <span style={s.fileBase}>{base}</span>
                          </a>
                        </div>
                        <span style={s.depthTag}>{t("list.depth", { depth: x.depth })}</span>
                      </li>
                    );
                  })}
                </ul>
                {tests.total > tests.items.length && (
                  <span style={s.moreNote}>
                    {t("list.more", {
                      count: tests.total - tests.items.length,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
