/* ContextTab — which project-context docs this agent reads when it reviews PRs of the active repo
   (SPEC-01). Header "N of M attached" + the per-call token sum (over-cap badge above 4,000), a
   too-large alert per attached doc over the cap, a filter, and one row per doc: attached docs first
   in prompt order (drag or ↑/↓ to reorder), missing ones with Detach. Each change saves at once;
   the attached order is read from the query cache (optimistic), never mirrored in state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocPreview } from "@/components/context-doc-preview";
import { ContextRepoState } from "@/components/context-repo-state";
import { CONTEXT_TOKEN_CAP, filterDocs, sumTokens } from "@/lib/context-docs";
import {
  useAgentContextDocs,
  useContextDoc,
  useContextDocs,
  useContextResync,
  useSetAgentContextDocs,
} from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/lib/error-message";
import type { ContextRepoState as RepoState } from "@/lib/types";
import { buildContextRows, moveAttached, toggleAttached, tooLargeAttached, type ContextRow } from "./helpers";
import { ContextDocRow } from "./_components/ContextDocRow";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId, activeRepo } = useActiveRepo();
  if (!repoId) return <p style={s.empty}>{t("contextTab.noRepo")}</p>;
  return <RepoContextTab agentId={agent.id} repoId={repoId} repoName={activeRepo?.full_name ?? activeRepo?.name ?? ""} />;
}

function RepoContextTab({ agentId, repoId, repoName }: { agentId: string; repoId: string; repoName: string }) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const toast = useToast();
  const docsQ = useContextDocs(repoId);
  const attachedQ = useAgentContextDocs(agentId, repoId);
  const setDocs = useSetAgentContextDocs(agentId, repoId);
  const resync = useContextResync(repoId);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (docsQ.isLoading || attachedQ.isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (docsQ.isError || attachedQ.isError || !docsQ.data || !attachedQ.data) {
    return (
      <ErrorState
        body={t("contextTab.loadError")}
        onRetry={() => {
          void docsQ.refetch();
          void attachedQ.refetch();
        }}
      />
    );
  }

  const rows = buildContextRows(docsQ.data.docs, attachedQ.data.docs);
  const paths = rows.filter((r) => r.attached).map((r) => r.path);
  const attachedRows = rows.filter((r) => r.attached);
  const tokens = sumTokens(attachedRows);
  const tooLarge = tooLargeAttached(rows);
  const visible = filterDocs(rows, filter);
  const previewRow = previewPath ? (rows.find((r) => r.path === previewPath) ?? null) : null;

  const save = (next: string[]) =>
    setDocs.mutate(next, { onError: (e) => toast.error(`${t("contextTab.saveError")}: ${errorMessage(e)}`) });

  const onDrop = (target: string) => {
    if (dragPath && dragPath !== target) {
      const to = paths.indexOf(target);
      if (to !== -1) save(moveAttached(paths, dragPath, to));
    }
    setDragPath(null);
    setOverPath(null);
  };

  return (
    <div style={s.column}>
      <div style={s.header}>
        <h2 style={s.title}>{t("contextTab.title")}</h2>
        <div style={s.counts}>
          <span style={s.count}>{t("contextTab.attachedCount", { attached: paths.length, total: rows.length })}</span>
          <span style={s.count}>{t("contextTab.tokenSum", { count: tokens })}</span>
          {tokens > CONTEXT_TOKEN_CAP && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("contextTab.overCap")}
            </Badge>
          )}
        </div>
      </div>
      <p style={s.hint}>{t("contextTab.hint", { repo: repoName })}</p>

      <RepoStateNotice state={docsQ.data.state} busy={resync.busy} onResync={() => void resync.start()} />

      {tooLarge.map((r) => (
        <div key={r.path} role="alert" style={s.alert}>
          {t("contextTab.tooLarge", { path: r.path, count: r.tokens ?? 0 })}
        </div>
      ))}

      {rows.length > 0 && (
        <div style={s.filter}>
          <Icon.Search size={14} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("contextTab.filterPlaceholder")}
            aria-label={t("contextTab.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      )}

      {rows.length > 0 && visible.length === 0 ? (
        <p style={s.empty}>{t("contextTab.noMatch")}</p>
      ) : (
        <div style={s.list} role="list">
          {visible.map((row) => (
            <ContextDocRow
              key={row.path}
              row={row}
              attachedCount={paths.length}
              onToggle={() => save(toggleAttached(paths, row.path))}
              onMove={(to) => save(moveAttached(paths, row.path, to))}
              onPreview={() => setPreviewPath(row.path)}
              drag={{
                over: overPath === row.path,
                onStart: () => setDragPath(row.path),
                onOver: () => {
                  if (!dragPath || !row.attached) return false;
                  setOverPath(row.path);
                  return true;
                },
                onLeave: () => setOverPath((o) => (o === row.path ? null : o)),
                onDrop: () => onDrop(row.path),
                onEnd: () => {
                  setDragPath(null);
                  setOverPath(null);
                },
              }}
            />
          ))}
        </div>
      )}

      {previewRow && (
        <Drawer title={previewRow.path} onClose={() => setPreviewPath(null)}>
          <PreviewBody
            repoId={repoId}
            row={previewRow}
            onToggle={() => save(toggleAttached(paths, previewRow.path))}
            labels={{
              attached: t("contextTab.attached"),
              attach: t("contextTab.attach"),
              attachLabel: t("contextTab.attachLabel", { path: previewRow.path }),
              loadError: tc("page.docLoadError"),
            }}
          />
        </Drawer>
      )}
    </div>
  );
}

/** Same state → notice mapping as the Project Context page. */
function RepoStateNotice({ state, busy, onResync }: { state: RepoState; busy: boolean; onResync: () => void }) {
  const tc = useTranslations("context");
  if (state.status === "ready") return null;
  if (state.status === "not_cloned") {
    return (
      <ContextRepoState
        variant="blocking"
        title={tc("state.notCloned.title")}
        body={tc("state.notCloned.body")}
        actionLabel={tc("resync")}
        busy={busy}
        onAction={onResync}
      />
    );
  }
  return (
    <ContextRepoState
      variant="banner"
      title={state.status === "index_failed" ? tc("state.indexFailed.title") : tc("state.indexDegraded.title")}
      body={state.reason ? tc("state.reason", { reason: state.reason }) : tc("state.noReason")}
      actionLabel={tc("resync")}
      busy={busy}
      onAction={onResync}
    />
  );
}

function PreviewBody({
  repoId,
  row,
  onToggle,
  labels,
}: {
  repoId: string;
  row: ContextRow;
  onToggle: () => void;
  labels: { attached: string; attach: string; attachLabel: string; loadError: string };
}) {
  const tc = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, row.path);
  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={labels.loadError} onRetry={() => refetch()} />;
  return (
    <ContextDocPreview
      doc={data}
      content={data.content}
      labels={{
        source: tc(`source.${data.source}`),
        tokens: tc("meta.tokens", { count: data.tokens }),
        attachedAgents: tc("meta.attachedAgents", { count: data.attached_agents }),
        path: tc("meta.path"),
      }}
      action={
        <Button
          kind={row.attached ? "secondary" : "primary"}
          size="sm"
          icon={row.attached ? "Check" : "Plus"}
          aria-pressed={row.attached}
          aria-label={labels.attachLabel}
          onClick={onToggle}
        >
          {row.attached ? labels.attached : labels.attach}
        </Button>
      }
    />
  );
}
