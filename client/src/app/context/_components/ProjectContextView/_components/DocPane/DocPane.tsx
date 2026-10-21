/* DocPane — the main area of /context: a header row (document name, Modified
   badge, Preview/Edit pills; token badge, "Used by N agents" and the coverage
   ring on the right) over the document body (rendered Markdown, the editor,
   or the too-large notice). Pure view: state and mutations stay in
   ProjectContextView. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, EmptyState, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { ModifiedLocallyBadge } from "@/components/modified-locally-badge";
import { TokenBadge } from "@/components/token-badge";
import { DocEditor } from "../DocEditor";
import { DOC_MODES, type DocMode } from "../../constants";
import { displayName } from "../../helpers";
import { s } from "./styles";

export interface DocPaneProps {
  /** Selected document path, or null when none is open. */
  doc: string | null;
  /** Folder shared by the listing, used to shorten the shown name. */
  folder: string;
  tokens: number | null | undefined;
  tooLarge: boolean;
  modified: boolean;
  updatedAt: string | null | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  mode: DocMode;
  onMode: (mode: DocMode) => void;
  /** Effective text on record (override or repository). */
  effective: string;
  /** Text shown in the editor (the draft, or the effective text). */
  text: string;
  saving: boolean;
  onDraftChange: (text: string) => void;
  onSave: () => void;
  onResetRequest: () => void;
  usedBy: number;
  enabledAgents: number;
  coverage: number;
}

export function DocPane(p: DocPaneProps) {
  const t = useTranslations("context");
  if (!p.doc) {
    return (
      <section style={s.pane} data-testid="context-preview">
        <div style={s.center}>
          <EmptyState icon="FileText" title={t("page.select.title")} body={t("page.select.body")} />
        </div>
      </section>
    );
  }
  const ready = p.tooLarge || (!p.loading && !p.error);
  const coverageTitle = t("page.coverageTitle", { used: p.usedBy, total: p.enabledAgents });
  return (
    <section style={s.pane} data-testid="context-preview">
      <header style={s.head}>
        <div className="mono" style={s.name} title={p.doc}>
          {displayName(p.doc, p.folder)}
        </div>
        {p.modified && <ModifiedLocallyBadge updatedAt={p.updatedAt} />}
        <div style={s.modePills} role="group" aria-label={t("page.mode.label")}>
          {DOC_MODES.map((m) => (
            <Button key={m} kind="tertiary" size="sm" active={p.mode === m} aria-pressed={p.mode === m} onClick={() => p.onMode(m)}>
              {t(`page.mode.${m}`)}
            </Button>
          ))}
        </div>
        <div style={s.usage}>
          {typeof p.tokens === "number" && <TokenBadge count={p.tokens} />}
          <span style={s.usedBy} data-testid="context-used-by">
            <Icon.Globe size={13} />
            {t("page.usedBy", { count: p.usedBy })}
          </span>
          <span style={s.coverage} data-testid="context-coverage" title={coverageTitle} aria-label={coverageTitle}>
            <CircularScore score={p.coverage} size={40} stroke={3.5} />
            <span style={s.coverageLabel}>{t("page.coverage")}</span>
          </span>
        </div>
      </header>
      <div style={s.body}>
        {!p.tooLarge && p.loading && <Skeleton height={160} />}
        {!p.tooLarge && p.error && <ErrorState body={t("page.previewError")} onRetry={p.onRetry} />}
        {ready && p.modified && (
          <div style={s.resetRow}>
            <Button kind="ghost" size="sm" onClick={p.onResetRequest}>
              {t("page.reset.action")}
            </Button>
          </div>
        )}
        {ready && p.tooLarge && (
          <p style={s.notice} role="note" data-testid="context-not-editable">
            {t("page.notEditable.tooLarge")}
          </p>
        )}
        {ready && !p.tooLarge && p.mode === "preview" && (
          <div style={s.markdown}>
            <Markdown>{p.effective}</Markdown>
          </div>
        )}
        {ready && !p.tooLarge && p.mode === "edit" && (
          <DocEditor value={p.text} effective={p.effective} saving={p.saving} onChange={p.onDraftChange} onSave={p.onSave} />
        )}
      </div>
    </section>
  );
}
