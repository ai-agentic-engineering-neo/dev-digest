/* ProjectContextView — /repos/:repoId/context (specs/09-project-context-folder.md).
   View-only browser over a repo's synced checkout: discovery listing +
   read-only preview + a compact search-roots control (D2/D7/N2 — no edit,
   upload, create, delete, chunk count, or coverage ring anywhere in this
   tree, AC-35/AC-39). Follows repos/[repoId]/pulls's repo-scoped route
   pattern (useParams + useActiveRepo + useRepoNotFound), not pulls/page.tsx
   itself (client/LEARNINGS.md: that file is the deviation, not the template). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useDocument, useRepoDocuments, useSetDocRoots } from "@/lib/hooks/project-context";
import { ApiError } from "@/lib/api";
import { DocumentRow } from "./DocumentRow";
import { RootsEditor } from "./RootsEditor";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isFetching, isError, error, refetch } = useRepoDocuments(repoId);
  const setRoots = useSetDocRoots(repoId);

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [rootsOpen, setRootsOpen] = React.useState(false);

  const preview = useDocument(repoId, selectedPath);

  const repoName = activeRepo?.full_name ?? repoId ?? t("page.repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: t("page.crumb") }];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const documents = data?.documents ?? [];
  const roots = data?.roots ?? [];

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.title")}</h1>
          <p style={s.pageSubtitle}>
            {data
              ? t("page.summary", { count: data.summary.count, tokens: data.summary.tokens })
              : t("page.loading")}
          </p>
        </div>
        <div style={s.headerActions}>
          <Button kind="secondary" size="sm" icon="Settings" onClick={() => setRootsOpen((v) => !v)}>
            {t("roots.edit")}
          </Button>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={isFetching} onClick={() => refetch()}>
            {t("page.refresh")}
          </Button>
        </div>
      </div>

      {rootsOpen && (
        <RootsEditor
          roots={roots}
          saving={setRoots.isPending}
          onCancel={() => setRootsOpen(false)}
          onSave={(next) => setRoots.mutate(next, { onSuccess: () => setRootsOpen(false) })}
        />
      )}

      {isLoading ? (
        <div style={s.loadingStack}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : t("page.loadError")}
          onRetry={() => refetch()}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          icon="Folder"
          title={t("page.empty.title")}
          body={t("page.empty.body", { roots: roots.join(", ") })}
        />
      ) : (
        <div style={s.split}>
          <div style={s.list}>
            {documents.map((doc) => (
              <DocumentRow
                key={doc.path}
                doc={doc}
                active={doc.path === selectedPath}
                onSelect={() => setSelectedPath(doc.path)}
              />
            ))}
          </div>
          <div style={s.previewPane}>
            {!selectedPath ? (
              <div style={s.previewEmpty}>{t("page.selectPrompt")}</div>
            ) : preview.isLoading ? (
              <Skeleton height={280} />
            ) : preview.isError || !preview.data ? (
              <ErrorState body={t("page.previewLoadError")} onRetry={() => preview.refetch()} />
            ) : (
              <>
                <div style={s.previewHead}>
                  <span className="mono" style={s.previewPath}>
                    {preview.data.path}
                  </span>
                </div>
                <div style={s.previewContent}>
                  <Markdown>{preview.data.content}</Markdown>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ProjectContextView;
