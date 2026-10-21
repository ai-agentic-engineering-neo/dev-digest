/* ContextAttachPanel — shared body of the agent and skill Context tabs: pick the
   repository, then check, order and preview the Markdown documents this owner
   attaches. Every change is saved at once (PUT /agents|skills/:id/context) with
   an optimistic cache write that rolls back on failure (the global toast
   reports the error). Token counts are approximate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, SectionLabel, SelectInput, Skeleton } from "@devdigest/ui";
import { ContextDocumentRow } from "@/components/context-document-row";
import { ContextDocPreview } from "@/components/context-doc-preview";
import { TokenBadge } from "@/components/token-badge";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { useContextAttachments, useContextFiles, useSetContextAttachments, type ContextOwnerKind } from "@/lib/hooks/project-context";
import {
  DISCOVERY_ROOTS,
  PROJECT_CONTEXT_RUN_MAX_TOKENS,
  defaultContextRepoId,
  isOverPromptCap,
  serializeContextBlock,
  sumCheckedTokens,
} from "@/lib/project-context";
import { OWNER_NAMESPACE } from "./constants";
import { attachedPaths, filterRows, mergeRows, movePath } from "./helpers";
import { s } from "./styles";

export interface ContextOwner {
  kind: ContextOwnerKind;
  id: string;
  name: string;
}

export function ContextAttachPanel({ owner, footerNote }: { owner: ContextOwner; footerNote?: string }) {
  const tc = useTranslations("context");
  const to = useTranslations(OWNER_NAMESPACE[owner.kind]);
  const toast = useToast();
  const { repos, repoId: activeRepoId, reposLoaded } = useActiveRepo();
  const [picked, setPicked] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  // derived, not stored: the user's pick wins while it is still a known repository
  const repoId = picked && repos.some((r) => r.id === picked) ? picked : defaultContextRepoId(repos, activeRepoId);
  const repo = repos.find((r) => r.id === repoId) ?? null;
  const cloned = repo?.clone_path ? repoId : null;
  const filesQ = useContextFiles(cloned);
  const attachQ = useContextAttachments(owner.kind, owner.id, cloned);
  const save = useSetContextAttachments(owner.kind);

  const rows = React.useMemo(
    () => (filesQ.data && attachQ.data ? mergeRows(filesQ.data, attachQ.data) : []),
    [filesQ.data, attachQ.data],
  );
  const checked = attachedPaths(rows);
  const total = sumCheckedTokens(checked, filesQ.data ?? []);
  const visible = filterRows(rows, query);
  const roots = DISCOVERY_ROOTS.join(", ");

  const commit = (paths: string[]) => {
    if (!repoId) return;
    save.mutate({ id: owner.id, repoId, paths }, { onSuccess: () => toast.success(tc("panel.saved")) });
  };
  const toggle = (path: string, on: boolean) => commit(on ? [...checked, path] : checked.filter((p) => p !== path));
  const move = (index: number, delta: number) => commit(movePath(checked, index, index + delta));

  let content: React.ReactNode;
  if (!reposLoaded || (cloned && (filesQ.isLoading || attachQ.isLoading))) {
    content = (
      <div style={s.list}>
        <Skeleton height={38} />
        <Skeleton height={38} />
      </div>
    );
  } else if (!repo) {
    content = <EmptyState icon="Folder" title={tc("page.noRepo.title")} body={tc("panel.noRepos")} />;
  } else if (!repo.clone_path) {
    content = <EmptyState icon="GitBranch" title={tc("page.notCloned.title")} body={tc("panel.notCloned")} />;
  } else if (filesQ.isError || attachQ.isError) {
    content = <ErrorState body={tc("panel.loadError")} onRetry={() => void Promise.all([filesQ.refetch(), attachQ.refetch()])} />;
  } else if (rows.length === 0) {
    content = <EmptyState icon="FileText" title={tc("page.empty.title")} body={tc("panel.empty", { roots })} />;
  } else {
    content = (
      <>
        {visible.length === 0 && <div style={s.noMatch}>{tc("panel.noMatch", { query })}</div>}
        <div style={s.list} role="list">
          {visible.map((row) => {
            const index = row.attached ? checked.indexOf(row.path) : -1;
            const draggable = row.attached && !query;
            return (
              <ContextDocumentRow
                key={row.path}
                path={row.path}
                kind={row.file?.kind}
                tokens={row.file?.tokens}
                missing={row.missing}
                tooLarge={row.tooLarge}
                onPreview={row.missing ? undefined : () => setPreviewPath(row.path)}
                attach={{
                  checked: row.attached,
                  onToggle: (on) => toggle(row.path, on),
                  draggable,
                  dragging: dragFrom === index && index >= 0,
                  onDragStart: () => setDragFrom(index),
                  onDragOver: (e) => {
                    if (draggable && dragFrom !== null) e.preventDefault();
                  },
                  onDrop: () => {
                    if (draggable && dragFrom !== null && dragFrom !== index) commit(movePath(checked, dragFrom, index));
                    setDragFrom(null);
                  },
                  onDragEnd: () => setDragFrom(null),
                  onMoveUp: () => move(index, -1),
                  onMoveDown: () => move(index, 1),
                }}
              />
            );
          })}
        </div>
        {isOverPromptCap(total) && (
          <div role="alert" style={s.warning}>
            {tc("panel.overCap", { total, cap: PROJECT_CONTEXT_RUN_MAX_TOKENS })}
          </div>
        )}
        <div style={s.footer} data-testid="context-panel-total">
          <TokenBadge count={total} />
          {footerNote && <span style={s.footerNote}>{footerNote}</span>}
        </div>
        {owner.kind === "skill" && (
          <div style={s.blockWrap}>
            <SectionLabel>{to("context.blockTitle")}</SectionLabel>
            <pre className="mono" style={s.block} data-testid="skill-context-block">
              {serializeContextBlock(checked)}
            </pre>
            <div style={s.blockHint}>{to("context.blockHint")}</div>
          </div>
        )}
      </>
    );
  }

  const showControls = !!repo?.clone_path && rows.length > 0;
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{to("context.title")}</h2>
        {showControls && (
          <Badge color="var(--accent)" bg="var(--info-bg)">
            {to("context.badge", { attached: checked.length, total: rows.length })}
          </Badge>
        )}
        <span style={s.spacer} />
        {showControls && (
          <div style={s.search}>
            <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tc("panel.filterPlaceholder")}
              aria-label={tc("panel.filterPlaceholder")}
              style={s.searchInput}
            />
          </div>
        )}
      </div>
      <div style={s.hint}>{to("context.hint")}</div>
      {repos.length > 1 && (
        <div style={s.controls}>
          <label style={s.repoLabel}>
            {tc("panel.repoLabel")}
            <div style={s.repoSelect}>
              <SelectInput mono={false} value={repoId ?? ""} onChange={setPicked} options={repos.map((r) => ({ value: r.id, label: r.name }))} />
            </div>
          </label>
        </div>
      )}
      {content}
      {previewPath && repoId && <ContextDocPreview repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
