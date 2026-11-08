/* /repos/:repoId/context — Project Context: full-width two-panel layout (N6). Left: toolbar, filter,
   grouped tree, footer. Right: DocPane for the selection. Selection + mode live in the URL
   (?path, ?mode, ?copy); filter, target folder and not-yet-persisted folders are local. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ContextRepoState } from "@/components/context-repo-state";
import { useContextDocs, useContextResync } from "@/lib/hooks/project-context";
import { useDevdigestDocs } from "@/lib/hooks/devdigest-docs";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DEVDIGEST_ROOT } from "@/lib/devdigest-docs";
import type { ContextRepoState as RepoState, DevdigestDocMeta } from "@/lib/types";
import { DocTree } from "../DocTree";
import { DocPane, type PaneMode } from "../DocPane";
import { ContextToolbar } from "../ContextToolbar";
import { s } from "./styles";

const SKELETON_ROWS = 6;

interface SelectOptions {
  mode?: PaneMode;
  copyExists?: boolean;
}

/** Folders typed in "New folder" stay listed only until a doc exists under them. */
function pendingFolders(extra: readonly string[], docs: readonly DevdigestDocMeta[]): string[] {
  return extra.filter((f) => !docs.some((d) => d.path.startsWith(`${DEVDIGEST_ROOT}${f}/`)));
}

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const format = useFormatter();
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("path");
  const mode: PaneMode = search.get("mode") === "edit" ? "edit" : "preview";
  const copyExists = search.get("copy") === "exists";
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useContextDocs(repoId);
  const ddQuery = useDevdigestDocs(repoId);
  const dd = ddQuery.data;
  const resync = useContextResync(repoId);
  const [filter, setFilter] = React.useState("");
  const [targetFolder, setTargetFolder] = React.useState("");
  const [extraFolders, setExtraFolders] = React.useState<string[]>([]);
  const dirtyRef = React.useRef(false);

  const repo = repos.find((r) => r.id === repoId);
  const crumb = [{ label: repo?.full_name ?? repo?.name ?? "", mono: true }, { label: t("page.breadcrumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const replaceUrl = (path: string | null, opts: SelectOptions = {}) => {
    const sp = new URLSearchParams(search.toString());
    sp.delete("copy");
    if (path === null) {
      sp.delete("path");
      sp.delete("mode");
    } else {
      sp.set("path", path);
      if (opts.mode) sp.set("mode", opts.mode);
      if (opts.copyExists) sp.set("copy", "exists");
    }
    router.replace(`/repos/${repoId}/context?${sp.toString()}`, { scroll: false });
  };

  /** Every selection change goes through the unsaved-changes guard (AC-7). */
  const select = (path: string, opts: SelectOptions = {}) => {
    if (dirtyRef.current && !window.confirm(t("pane.unsavedConfirm", { path: selected ?? path }))) return;
    dirtyRef.current = false;
    replaceUrl(path, opts);
  };

  const docs = data?.docs ?? [];
  const notCloned = data?.state.status === "not_cloned";
  const folders = pendingFolders(extraFolders, dd?.docs ?? []);
  const selectedDoc = docs.find((d) => d.path === selected) ?? null;
  const devdigestId = dd?.docs.find((d) => d.path === selected)?.id ?? null;
  // a .devdigest doc whose id is not known yet must not render as a read-only repo doc
  const devdigestUnresolved = selectedDoc?.source === "devdigest" && devdigestId === null;
  const emptyRepo = !!data && !notCloned && docs.length === 0 && folders.length === 0;
  const syncedAt = dd?.synced_at ?? null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.root}>
        <aside style={s.left}>
          <div style={s.panelHead}>
            <div style={s.panelTitle}>{t("page.panelTitle")}</div>
            {repo?.full_name ? (
              <div className="mono" style={s.panelRepo} title={repo.full_name}>
                {repo.full_name}
              </div>
            ) : null}
          </div>
          <div style={s.block}>
            <ContextToolbar
              repoId={repoId}
              targetFolder={targetFolder}
              onFileCreated={(doc) => select(doc.path, { mode: "edit" })}
              onFolderCreated={(f) => {
                setExtraFolders((prev) => (prev.includes(f) ? prev : [...prev, f]));
                setTargetFolder(f);
              }}
              resync={resync}
            />
          </div>
          <div style={s.block}>
            <TextInput
              value={filter}
              onChange={setFilter}
              placeholder={t("page.filterPlaceholder")}
              aria-label={t("page.filterPlaceholder")}
            />
          </div>
          {dd && dd.ignored_repo_paths > 0 && (
            <div style={s.note}>{t("page.ignoredRepoDevdigest", { count: dd.ignored_repo_paths })}</div>
          )}
          {notCloned && (
            <ContextRepoState
              variant="banner"
              title={t("state.notCloned.title")}
              body={t("state.notCloned.body")}
              actionLabel={t("resync")}
              busy={resync.busy}
              onAction={resync.start}
            />
          )}
          {data && <IndexBanner state={data.state} busy={resync.busy} onResync={resync.start} />}
          <div style={s.treeRegion}>
            {isLoading && (
              <div style={s.skeletons}>
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <Skeleton key={i} height={28} />
                ))}
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {data && (
              <DocTree
                repoId={repoId}
                docs={docs}
                extraFolders={folders}
                filter={filter}
                selectedPath={selected}
                selectedFolder={targetFolder}
                onSelectDoc={(path) => select(path)}
                onSelectFolder={setTargetFolder}
              />
            )}
          </div>
          {data && (
            <div style={s.footer}>
              {syncedAt
                ? t("page.footer", {
                    count: docs.length,
                    time: format.dateTime(new Date(syncedAt), { dateStyle: "medium", timeStyle: "short" }),
                  })
                : t("page.footerNotSynced", { count: docs.length })}
            </div>
          )}
        </aside>
        <section style={s.right}>
          <div style={s.docRegion}>
            {emptyRepo ? (
              <EmptyState
                icon="FileText"
                title={t("emptyDocs.title")}
                body={t("emptyDocs.body")}
                cta={t("resync")}
                onCta={resync.start}
                ctaLoading={resync.busy}
              />
            ) : devdigestUnresolved && ddQuery.isError ? (
              <ErrorState body={t("pane.loadError")} onRetry={() => ddQuery.refetch()} />
            ) : devdigestUnresolved && (!dd || ddQuery.isFetching) ? (
              <div style={s.skeletons} aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : selectedDoc && !devdigestUnresolved ? (
              <DocPane
                key={selectedDoc.path}
                repoId={repoId}
                doc={selectedDoc}
                devdigestId={devdigestId}
                mode={mode}
                onModeChange={(m) => {
                  const sp = new URLSearchParams(search.toString());
                  sp.set("mode", m);
                  router.replace(`/repos/${repoId}/context?${sp.toString()}`, { scroll: false });
                }}
                copyExists={copyExists}
                onCopied={(r) => select(r.doc.path, { mode: "edit", copyExists: !r.created })}
                onDeleted={() => {
                  dirtyRef.current = false;
                  replaceUrl(null);
                }}
                onDirtyChange={(dirty) => {
                  dirtyRef.current = dirty;
                }}
              />
            ) : (
              <span style={s.hint}>{t("page.selectHint")}</span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function IndexBanner({ state, busy, onResync }: { state: RepoState; busy: boolean; onResync: () => void }) {
  const t = useTranslations("context");
  if (state.status !== "index_failed" && state.status !== "index_degraded") return null;
  return (
    <ContextRepoState
      variant="banner"
      title={state.status === "index_failed" ? t("state.indexFailed.title") : t("state.indexDegraded.title")}
      body={state.reason ? t("state.reason", { reason: state.reason }) : t("state.noReason")}
      actionLabel={t("resync")}
      busy={busy}
      onAction={onResync}
    />
  );
}
