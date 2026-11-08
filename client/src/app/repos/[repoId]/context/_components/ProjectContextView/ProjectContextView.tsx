/* /repos/:repoId/context — Project Context: the repo's markdown docs at the last synced commit
   (list + filter + preview). Selection lives in ?path=; the filter is local. Only "not cloned"
   hides the docs; a failed/degraded code index shows a banner above a working list (AC-5). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ContextDocPreview } from "@/components/context-doc-preview";
import { ContextRepoState } from "@/components/context-repo-state";
import { useContextDoc, useContextDocs, useContextResync } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { filterDocs, shortenPath } from "@/lib/context-docs";
import type { ContextDoc, ContextRepoState as RepoState } from "@/lib/types";
import { s } from "./styles";

const ROW_PATH_CHARS = 48;
const SKELETON_ROWS = 6;

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("path");
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useContextDocs(repoId);
  const resync = useContextResync(repoId);
  const [filter, setFilter] = React.useState("");

  const repo = repos.find((r) => r.id === repoId);
  const crumb = [{ label: t("page.title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const select = (path: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("path", path);
    router.replace(`/repos/${repoId}/context?${sp.toString()}`);
  };

  const docs = data?.docs ?? [];
  const visible = filterDocs(docs, filter);
  const selectedDoc = docs.find((d) => d.path === selected) ?? null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("page.title")}</h1>
          <p style={s.subtitle}>{t("page.subtitle", { repo: repo?.full_name ?? repo?.name ?? "" })}</p>
        </div>

        {isLoading && (
          <div style={s.skeletons}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <Skeleton key={i} height={36} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {data && data.state.status === "not_cloned" && (
          <ContextRepoState
            variant="blocking"
            title={t("state.notCloned.title")}
            body={t("state.notCloned.body")}
            actionLabel={t("resync")}
            busy={resync.busy}
            onAction={resync.start}
          />
        )}

        {data && data.state.status !== "not_cloned" && (
          <div style={s.stack}>
            <IndexBanner state={data.state} busy={resync.busy} onResync={resync.start} />
            {docs.length === 0 ? (
              <EmptyState
                icon="FileText"
                title={t("emptyDocs.title")}
                body={t("emptyDocs.body")}
                cta={t("resync")}
                onCta={resync.start}
                ctaLoading={resync.busy}
              />
            ) : (
              <div style={s.layout}>
                <div style={s.listCol}>
                  <TextInput
                    value={filter}
                    onChange={setFilter}
                    placeholder={t("page.filterPlaceholder")}
                    aria-label={t("page.filterPlaceholder")}
                  />
                  {visible.length === 0 ? (
                    <div style={s.noMatch}>{t("page.noMatch")}</div>
                  ) : (
                    <ul style={s.list}>
                      {visible.map((d) => (
                        <li key={d.path}>
                          <DocRow doc={d} active={d.path === selected} onSelect={() => select(d.path)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div style={s.preview}>
                  {selected ? (
                    <DocPreview repoId={repoId} path={selected} listed={selectedDoc} />
                  ) : (
                    <span style={s.hint}>{t("page.selectHint")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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

function DocRow({ doc, active, onSelect }: { doc: ContextDoc; active: boolean; onSelect: () => void }) {
  const t = useTranslations("context");
  return (
    <button
      type="button"
      aria-label={doc.path}
      aria-current={active ? "true" : undefined}
      title={doc.path}
      onClick={onSelect}
      style={s.row(active)}
    >
      <span className="mono" style={s.rowPath}>
        {shortenPath(doc.path, ROW_PATH_CHARS)}
      </span>
      <span style={s.rowMeta}>
        <Badge>{t(`source.${doc.source}`)}</Badge>
        <span>{t("meta.tokens", { count: doc.tokens })}</span>
        <span>{t("meta.attachedAgents", { count: doc.attached_agents })}</span>
      </span>
    </button>
  );
}

function DocPreview({ repoId, path, listed }: { repoId: string; path: string; listed: ContextDoc | null }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDoc(repoId, path);
  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("page.docLoadError")} onRetry={() => refetch()} />;
  const doc = listed ?? data;
  return (
    <ContextDocPreview
      doc={doc}
      content={data.content}
      labels={{
        source: t(`source.${doc.source}`),
        tokens: t("meta.tokens", { count: doc.tokens }),
        attachedAgents: t("meta.attachedAgents", { count: doc.attached_agents }),
        path: t("meta.path"),
      }}
    />
  );
}
