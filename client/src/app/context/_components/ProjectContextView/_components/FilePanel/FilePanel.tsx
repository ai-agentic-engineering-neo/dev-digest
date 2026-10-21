/* FilePanel — the left column of /context: section label, the folder the
   documents share, the toolbar (add/folder/upload disabled, refresh), one
   compact row per document (icon + name, modified dot, too-large badge) and a
   footer with the document and token totals. Pure view: data in, clicks out. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { PLANNED_TOOLS } from "../../constants";
import { displayName } from "../../helpers";
import { s } from "./styles";

export interface FilePanelProps {
  /** Folder shared by every listed document, shown under the label ("" when none). */
  folder: string;
  files: SpecFile[];
  loading: boolean;
  /** Selected document path. */
  selected: string | null;
  /** Hide the toolbar and footer when the repository cannot be listed. */
  listable: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (path: string) => void;
}

export function FilePanel({ folder, files, loading, selected, listable, refreshing, onRefresh, onSelect }: FilePanelProps) {
  const t = useTranslations("context");
  const tokens = files.reduce((sum, f) => sum + (f.tokens ?? 0), 0);
  return (
    <aside style={s.panel} data-testid="context-file-panel">
      <div style={s.head}>
        <SectionLabel>{t("page.panel.title")}</SectionLabel>
        {folder && (
          <div className="mono" style={s.folder} title={folder}>
            {folder}
          </div>
        )}
      </div>
      {listable && (
        <div style={s.toolbar} role="toolbar" aria-label={t("page.tools.label")}>
          {PLANNED_TOOLS.map((tool) => (
            <span key={tool.key} style={s.toolDisabled} aria-disabled="true" title={t("page.tools.unavailable")}>
              <IconBtn icon={tool.icon} size={26} label={`${t(`page.tools.${tool.key}`)} (${t("page.tools.unavailable")})`} />
            </span>
          ))}
          <IconBtn icon="RefreshCw" size={26} label={refreshing ? t("page.tools.refreshing") : t("page.tools.refresh")} onClick={onRefresh} />
        </div>
      )}
      <div style={s.list} role="list" aria-label={t("page.panel.listLabel")}>
        {loading && (
          <>
            <Skeleton height={28} />
            <Skeleton height={28} />
            <Skeleton height={28} />
          </>
        )}
        {!loading &&
          files.map((f) => {
            const on = f.path === selected;
            return (
              <div key={f.path} role="listitem">
                <button
                  type="button"
                  data-testid="context-doc-row"
                  style={s.row(on)}
                  onClick={() => onSelect(f.path)}
                  aria-pressed={on}
                  title={f.path}
                >
                  <span style={s.rowIcon(on)} aria-hidden>
                    <Icon.FileText size={13} />
                  </span>
                  <span className="mono" style={s.rowName(on)}>
                    {displayName(f.path, folder)}
                  </span>
                  {f.modified && <span role="img" aria-label={t("row.modifiedMarker")} title={t("row.modifiedMarker")} style={s.modifiedDot} data-testid="context-row-modified" />}
                  {f.too_large && (
                    <span title={t("row.tooLargeTitle")}>
                      <Badge color="var(--warn)" bg="var(--warn-bg)">
                        {t("row.tooLarge")}
                      </Badge>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
      </div>
      {listable && !loading && (
        <div style={s.footer} data-testid="context-panel-footer">
          <span style={s.footerDot} aria-hidden />
          <span>{t("page.panel.footer", { count: files.length, tokens })}</span>
        </div>
      )}
    </aside>
  );
}
