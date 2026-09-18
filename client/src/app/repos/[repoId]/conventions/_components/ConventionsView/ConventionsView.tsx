"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import type { ConventionCandidate } from "@devdigest/shared";
import { ConventionCard } from "./ConventionCard";
import { formatLastScan, repoDisplayName } from "./helpers";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = React.useState(false);
  const seeded = React.useRef(false);

  const items = data?.items ?? [];
  const acceptedItems = items.filter((c) => c.status === "accepted");
  const selectedAccepted = acceptedItems.filter((c) => selected.has(c.id));

  React.useEffect(() => {
    if (seeded.current || !data) return;
    seeded.current = true;
    setSelected(new Set(data.items.filter((c) => c.status === "accepted").map((c) => c.id)));
  }, [data]);

  const toggleSelect = (item: ConventionCandidate) => {
    if (item.status !== "accepted") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const runExtract = () => extract.mutate();

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbConventions") },
  ];
  const repoName = repoDisplayName(activeRepo?.full_name, t("page.repoFallback"));
  const provider = activeRepo?.provider ?? "github";
  const gitRef = activeRepo?.default_branch ?? "main";
  const fullName = activeRepo?.full_name ?? "";

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {data?.extracted_at
                ? t("page.scanMeta", {
                    count: data.sample_file_count,
                    when: formatLastScan(data.extracted_at),
                  })
                : t("page.subtitle")}
            </p>
          </div>
          {items.length > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={extract.isPending}
              onClick={runExtract}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : t("page.loadError")}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={runExtract}
            ctaLoading={extract.isPending}
          />
        )}
        {items.length > 0 && (
          <>
            <div style={s.toolbar}>
              <div style={s.toolbarLeft}>
                <Button kind="ghost" size="sm" icon="X" onClick={() => setSelected(new Set())}>
                  {t("toolbar.deselectAll")}
                </Button>
                <span style={s.acceptedMeta}>
                  {t("toolbar.acceptedCount", {
                    selected: selectedAccepted.length,
                    total: acceptedItems.length,
                  })}
                </span>
              </div>
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                disabled={selectedAccepted.length === 0}
                onClick={() => setComposeOpen(true)}
              >
                {t("toolbar.createSkill")}
              </Button>
            </div>
            <div style={s.list}>
              {items.map((item) => (
                <ConventionCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  provider={provider}
                  fullName={fullName}
                  gitRef={gitRef}
                  patching={patch.isPending}
                  onToggleSelect={() => toggleSelect(item)}
                  onAccept={() => {
                    patch.mutate(
                      { cid: item.id, patch: { status: "accepted" } },
                      {
                        onSuccess: () =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.add(item.id);
                            return next;
                          }),
                      },
                    );
                  }}
                  onReject={() => {
                    patch.mutate(
                      { cid: item.id, patch: { status: "rejected" } },
                      {
                        onSuccess: () =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.delete(item.id);
                            return next;
                          }),
                      },
                    );
                  }}
                  onSaveRule={(rule) => patch.mutate({ cid: item.id, patch: { rule } })}
                />
              ))}
            </div>
          </>
        )}
        {composeOpen && (
          <CreateSkillFromConventionsModal
            repoId={repoId}
            repoFullName={fullName}
            selected={selectedAccepted}
            onClose={() => setComposeOpen(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
