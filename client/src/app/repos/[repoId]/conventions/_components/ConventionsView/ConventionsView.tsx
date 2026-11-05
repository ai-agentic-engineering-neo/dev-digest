/* /repos/:repoId/conventions — Conventions Extractor (Skills Lab → Conventions).
   Run / re-run the extraction (sampling + evidence checks happen server-side),
   review each candidate (accept / reject / edit the rule), then turn the
   accepted ones into one `<repo>-conventions` skill via the create modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionExtractResult } from "@devdigest/shared";
import { AppShell } from "../../../../../../components/app-shell";
import { RepoNotFound } from "../../../../../../components/repo-not-found";
import {
  useConventions,
  useExtractConventions,
  useSetAllConventions,
  useUpdateConvention,
} from "../../../../../../lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "../../../../../../lib/repo-context";
import { useToast } from "../../../../../../lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateConventionsSkillModal } from "./_components/CreateConventionsSkillModal";
import { SKELETON_CARDS } from "./constants";
import { countAccepted } from "./helpers";
import { s } from "./styles";

type ScanSummary = Pick<ConventionExtractResult, "sampled_files" | "rejected_ungrounded">;

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const setAll = useSetAllConventions(repoId);
  const [scan, setScan] = React.useState<ScanSummary | null>(null);
  const [creating, setCreating] = React.useState(false);

  const repo = repos.find((r) => r.id === repoId);
  const repoName = repo?.name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = data ?? [];
  const accepted = countAccepted(list);

  const runExtraction = () =>
    extract.mutate(undefined, {
      onSuccess: (res) => setScan({ sampled_files: res.sampled_files, rejected_ungrounded: res.rejected_ungrounded }),
      onError: (e) => toast.error(`${t("page.extractionFailed")}: ${(e as Error).message}`),
    });

  const onError = (e: unknown) => toast.error(`${t("card.saveError")}: ${(e as Error).message}`);

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateConventionsSkillModal
          repoId={repoId}
          repoName={repoName}
          acceptedCount={accepted}
          onClose={() => setCreating(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.lastScan", { count: scan.sampled_files.length, dropped: scan.rejected_ungrounded })
                : list.length > 0
                  ? t("page.candidateCount", { count: list.length })
                  : t("page.subtitle")}
            </p>
          </div>
          {list.length > 0 && (
            <Button icon="RefreshCw" onClick={runExtraction} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {isLoading && (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={180} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        )}

        {list.length > 0 && (
          <>
            <div style={s.toolbar}>
              {accepted > 0 ? (
                <Button size="sm" icon="X" onClick={() => setAll.mutate("pending", { onError })}>
                  {t("page.deselectAll")}
                </Button>
              ) : (
                <Button size="sm" icon="Check" onClick={() => setAll.mutate("accepted", { onError })}>
                  {t("page.acceptAll")}
                </Button>
              )}
              <span style={s.count}>{t("page.acceptedCount", { accepted, total: list.length })}</span>
              <span style={s.spacer} />
              <span title={accepted === 0 ? t("page.createSkillHint") : undefined}>
                <Button kind="primary" icon="Sparkles" disabled={accepted === 0} onClick={() => setCreating(true)}>
                  {t("page.createSkill")}
                </Button>
              </span>
            </div>
            <div style={s.list}>
              {list.map((c) => (
                <ConventionCard
                  key={c.id}
                  convention={c}
                  onStatus={(status) => update.mutate({ id: c.id, patch: { status } }, { onError })}
                  onRule={(rule) => update.mutate({ id: c.id, patch: { rule } }, { onError })}
                  onCopied={() => toast.success(t("card.copied"))}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
