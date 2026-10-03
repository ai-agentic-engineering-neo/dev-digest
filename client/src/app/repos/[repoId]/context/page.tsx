/* Project Context — /repos/:repoId/context. Read-only browser over the active
   repo's markdown documents (specs / docs / insights): searchable list on the
   left, rendered preview with type, usage and token count on the right.
   Attaching happens in the agent and skill Context tabs. Selection lives in
   ?doc=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Markdown, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { DocTypeBadge, relativeAgo } from "@/components/project-context";
import { useContextDocument, useContextDocuments } from "@/lib/hooks/context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { formatTokenCount } from "@/lib/format";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch, isFetching } = useContextDocuments(repoId);
  const [filter, setFilter] = React.useState("");

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];
  const docs = data?.documents ?? [];
  const selected = search.get("doc") ?? docs[0]?.path ?? null;
  const select = (path: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("doc", path);
    router.replace(`/repos/${repoId}/context?${sp.toString()}`);
  };

  const q = filter.trim().toLowerCase();
  const shown = q ? docs.filter((d) => d.path.toLowerCase().includes(q)) : docs;

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const notCloned = isError && error instanceof ApiError && error.code === "repo_not_cloned";

  return (
    <AppShell crumb={crumb}>
      <div style={s.frame}>
        <aside style={s.side}>
          <div style={s.sideHead}>
            <div style={s.label}>{t("sectionLabel")}</div>
            <div className="mono" style={s.roots} title={data?.glob}>
              {data ? data.roots.map((r) => (r === "." ? "./" : r)).join(", ") + " · " + data.glob : "…"}
            </div>
            <div style={s.toolbar}>
              <IconBtn icon="RefreshCw" label={isFetching ? t("refreshing") : t("refresh")} onClick={() => void refetch()} />
            </div>
            <TextInput value={filter} onChange={setFilter} placeholder={t("filterPlaceholder")} aria-label={t("filterPlaceholder")} />
          </div>
          <div style={{ height: 8 }} />
          <nav style={s.list} aria-label={t("title")}>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 6px" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} height={30} />
                ))}
              </div>
            ) : isError ? null : shown.length === 0 ? (
              <div style={s.note}>{q ? t("noMatches", { q: filter.trim() }) : null}</div>
            ) : (
              shown.map((d) => {
                const active = d.path === selected;
                return (
                  <button
                    key={d.path}
                    type="button"
                    style={s.item(active)}
                    onClick={() => select(d.path)}
                    aria-current={active ? "true" : undefined}
                    title={d.path}
                  >
                    <Icon.FileText size={15} style={{ color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
                    <span style={s.itemText}>
                      <span className="mono" style={s.itemName}>
                        {d.name}
                      </span>
                      <span className="mono" style={s.itemDir}>
                        {d.dir || "./"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            {data?.truncated && <div style={s.note}>{t("truncated", { count: docs.length })}</div>}
          </nav>
          {data && (
            <div style={s.sideFoot}>
              <span style={s.dot} />
              <span>{t("footer", { count: docs.length, ago: relativeAgo(data.scanned_at) })}</span>
            </div>
          )}
        </aside>

        <main style={s.main}>
          {isError ? (
            notCloned ? (
              <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body", { repo: repoName })} />
            ) : (
              <ErrorState title={t("loadError")} body={(error as Error)?.message} onRetry={() => void refetch()} />
            )
          ) : isLoading ? (
            <div style={{ padding: 28 }}>
              <Skeleton height={28} width={260} />
              <div style={{ height: 16 }} />
              <Skeleton height={300} />
            </div>
          ) : docs.length === 0 ? (
            <EmptyState
              icon="FileText"
              title={t("empty.title")}
              body={t("empty.body", { roots: data!.roots.join(", "), glob: data!.glob })}
            />
          ) : selected ? (
            <DocPane repoId={repoId} path={selected} />
          ) : (
            <div style={s.center}>{t("selectPrompt")}</div>
          )}
        </main>
      </div>
    </AppShell>
  );
}

function DocPane({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data: doc, isLoading, isError, refetch } = useContextDocument(repoId, path);
  return (
    <>
      <div style={s.mainHead}>
        <span className="mono" style={s.path}>
          {path}
        </span>
        <span style={s.mode}>{t("picker.preview")}</span>
        {doc && <DocTypeBadge type={doc.type} />}
        {doc && (
          <span style={s.meta}>
            <span style={s.metaItem}>
              <Icon.Cpu size={14} />
              {t("usedBy", { agents: doc.used_by.agents, skills: doc.used_by.skills })}
            </span>
            <span className="mono" style={s.metaItem}>
              {t("tokens", { tokens: formatTokenCount(doc.tokens) })}
            </span>
          </span>
        )}
      </div>
      <div style={s.body}>
        {isLoading ? (
          <Skeleton height={320} />
        ) : isError || !doc ? (
          <ErrorState title={t("previewError")} onRetry={() => void refetch()} />
        ) : (
          <div className="pc-doc" style={s.doc}>
            <div style={s.readOnly}>{t("readOnly")}</div>
            <Markdown>{doc.content}</Markdown>
          </div>
        )}
      </div>
    </>
  );
}
