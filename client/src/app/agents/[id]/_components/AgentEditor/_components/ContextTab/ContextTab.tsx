/* ContextTab — which project-context docs this agent reads when it reviews PRs of the active repo
   (SPEC-01, N2b layout per SPEC-04). Header "Project context" + "N of M attached" + filter, an
   order hint, too-large alerts, a scrollable list (attached docs first in prompt order; reorder by
   dragging the handle or Arrow Up / Arrow Down on it) and a cost footer that stays visible. Each
   change saves at once; the attached order is read from the query cache (optimistic), never
   mirrored in state. Preview opens a drawer with the rendered doc and an Attach toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextRepoState } from "@/components/context-repo-state";
import { DocMarkdown } from "@/components/doc-markdown";
import { DocSourceBadge } from "@/components/doc-source-badge";
import { CONTEXT_TOKEN_CAP, DOC_SOURCE_COLORS, filterDocs, sumTokens } from "@/lib/context-docs";
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
import {
  buildContextRows,
  keyboardMove,
  moveAttached,
  toggleAttached,
  tooLargeAttached,
  type ContextRow,
} from "./helpers";
import { ContextDocRow } from "./_components/ContextDocRow";
import { s } from "./styles";

const code = (chunks: React.ReactNode) => <code className="mono">{chunks}</code>;

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  if (!repoId) return <p style={s.empty}>{t("contextTab.noRepo")}</p>;
  return <RepoContextTab agentId={agent.id} repoId={repoId} />;
}

/** A pending keyboard move: keep focusing `path`'s handle until it sits at `position`. */
interface FocusTarget {
  path: string;
  position: number;
}

function RepoContextTab({ agentId, repoId }: { agentId: string; repoId: string }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const docsQ = useContextDocs(repoId);
  const attachedQ = useAgentContextDocs(agentId, repoId);
  const setDocs = useSetAgentContextDocs(agentId, repoId);
  const resync = useContextResync(repoId);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [focusTarget, setFocusTarget] = React.useState<FocusTarget | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  if (docsQ.isLoading || attachedQ.isLoading) {
    return (
      <div style={s.listSkeleton}>
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

  // Not cloned: the server lists only the repo's `.devdigest` docs; with none, the notice blocks the list.
  const notCloned = docsQ.data.state.status === "not_cloned" && docsQ.data.docs.length === 0;
  const rows = buildContextRows(docsQ.data.docs, attachedQ.data.docs);
  const paths = rows.filter((r) => r.attached).map((r) => r.path);
  const tokens = sumTokens(rows.filter((r) => r.attached));
  const overCap = tokens > CONTEXT_TOKEN_CAP;
  const tooLarge = tooLargeAttached(rows);
  const visible = filterDocs(rows, filter);
  const previewRow = previewPath ? (rows.find((r) => r.path === previewPath) ?? null) : null;

  // One save per user action; `paths` always comes from the (optimistic) query cache, so rapid
  // Arrow presses chain correctly through the serialized useSetAgentContextDocs.
  const save = (next: string[]) =>
    setDocs.mutate(next, {
      onError: (e) => {
        setFocusTarget(null);
        toast.error(`${t("contextTab.saveError")}: ${errorMessage(e)}`);
      },
    });

  const onDrop = (target: string) => {
    if (dragPath && dragPath !== target) {
      const to = paths.indexOf(target);
      if (to !== -1) save(moveAttached(paths, dragPath, to));
    }
    setDragPath(null);
    setOverPath(null);
  };

  const onKeyMove = (path: string, dir: -1 | 1) => {
    const next = keyboardMove(paths, path, dir);
    if (!next) return;
    const position = next.indexOf(path);
    save(next);
    setFocusTarget({ path, position });
    setAnnouncement(t("contextTab.moved", { path, position: position + 1, total: next.length }));
  };

  return (
    <div style={s.column}>
      <div style={s.header}>
        <h2 style={s.title}>{t("contextTab.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("contextTab.attachedCount", { attached: paths.length, total: rows.length })}
        </Badge>
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
      </div>
      <p style={s.hint}>{t.rich("contextTab.hint", { code })}</p>

      <RepoStateNotice
        state={docsQ.data.state}
        blocking={notCloned}
        busy={resync.busy}
        onResync={() => void resync.start()}
      />

      {tooLarge.map((r) => (
        <div key={r.path} role="alert" style={s.alert}>
          {t("contextTab.tooLarge", { path: r.path, count: r.tokens ?? 0 })}
        </div>
      ))}

      {notCloned ? null : rows.length === 0 ? (
        <p style={s.empty}>{t("contextTab.noDocs")}</p>
      ) : visible.length === 0 ? (
        <p style={s.empty}>{t("contextTab.noMatch")}</p>
      ) : (
        <div style={s.list} role="list">
          {visible.map((row) => (
            <ContextDocRow
              key={row.path}
              row={row}
              onToggle={() => save(toggleAttached(paths, row.path))}
              onKeyMove={(dir) => onKeyMove(row.path, dir)}
              onPreview={() => setPreviewPath(row.path)}
              focusHandle={focusTarget?.path === row.path && focusTarget.position === row.position}
              onHandleFocused={() => setFocusTarget(null)}
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

      {!notCloned && (
        <div style={s.footer}>
          <span style={s.footerTokens(overCap)}>{t("contextTab.footerTokens", { count: tokens })}</span>
          {overCap && (
            <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
              {t("contextTab.overSoftCap")}
            </Badge>
          )}
          <span style={s.footerNote}>{t.rich("contextTab.footerNote", { code })}</span>
        </div>
      )}

      <div aria-live="polite" style={s.visuallyHidden}>
        {announcement}
      </div>

      {previewRow && (
        <PreviewDrawer
          repoId={repoId}
          row={previewRow}
          onToggle={() => save(toggleAttached(paths, previewRow.path))}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

/** Same state → notice mapping as the Project Context page. */
function RepoStateNotice({
  state,
  blocking,
  busy,
  onResync,
}: {
  state: RepoState;
  blocking: boolean;
  busy: boolean;
  onResync: () => void;
}) {
  const tc = useTranslations("context");
  if (state.status === "ready") return null;
  if (state.status === "not_cloned") {
    return (
      <ContextRepoState
        variant={blocking ? "blocking" : "banner"}
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

/** Preview drawer (N2b): icon + path title, source / used-by / tokens subtitle, Attach toggle, doc. */
function PreviewDrawer({
  repoId,
  row,
  onToggle,
  onClose,
}: {
  repoId: string;
  row: ContextRow;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, row.path);
  const color = row.source ? DOC_SOURCE_COLORS[row.source].color : "var(--text-muted)";
  return (
    <Drawer
      width={560}
      onClose={onClose}
      title={
        <span style={s.drawerTitle}>
          <Icon.FileText size={16} style={{ color, flexShrink: 0 }} />
          <span className="mono" style={s.drawerPath}>
            {row.path}
          </span>
        </span>
      }
      subtitle={
        <span style={s.drawerMeta}>
          {row.source && <DocSourceBadge source={row.source} label={tc(`source.${row.source}`)} />}
          <span>{tc("meta.usedBy", { count: row.attachedAgents })}</span>
          {row.tokens != null && <span>{tc("meta.tokens", { count: row.tokens })}</span>}
        </span>
      }
    >
      <div style={s.drawerBody}>
        <div>
          <Button
            kind={row.attached ? "secondary" : "primary"}
            size="sm"
            icon={row.attached ? "Check" : "Plus"}
            aria-pressed={row.attached}
            aria-label={t("contextTab.attachLabel", { path: row.path })}
            onClick={onToggle}
          >
            {row.attached ? t("contextTab.attached") : t("contextTab.attach")}
          </Button>
        </div>
        {isLoading ? (
          <Skeleton height={160} />
        ) : isError || !data ? (
          <ErrorState body={tc("page.docLoadError")} onRetry={() => refetch()} />
        ) : (
          <div style={s.docBox}>
            <DocMarkdown>{data.content}</DocMarkdown>
          </div>
        )}
      </div>
    </Drawer>
  );
}
