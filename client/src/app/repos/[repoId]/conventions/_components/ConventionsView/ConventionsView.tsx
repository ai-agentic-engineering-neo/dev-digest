/* ConventionsView — /repos/:repoId/conventions. Scan a repo for house
   conventions, accept/reject each candidate (every one already verified
   server-side against real code), then merge the accepted set into a skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useSetConventionStatus,
  useCreateSkillFromConventions,
} from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatRelativeTime } from "./helpers";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const setStatus = useSetConventionStatus(repoId);
  const createSkill = useCreateSkillFromConventions(repoId);

  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = activeRepo?.full_name ?? repoId ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const candidates = data?.candidates ?? [];
  const accepted = candidates.filter((c) => c.status === "accepted");

  const handleExtract = () => {
    extract.mutate(undefined, {
      onError: (e) => {
        toast.toast(e instanceof ApiError ? e.message : t("page.extractionFailed"), "error");
      },
    });
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            <span className="mono">{repoName}</span>
          </h1>
          <p style={s.pageSubtitle}>
            {data?.scan
              ? t("page.subtitleScanned", {
                  sampleCount: data.scan.sample_file_count,
                  when: formatRelativeTime(data.scan.created_at),
                })
              : t("page.subtitleNone")}
          </p>
        </div>
        {candidates.length > 0 && (
          <div style={s.headerActions}>
            <span className="tnum" style={s.acceptedCount}>
              {t("page.acceptedCount", { accepted: accepted.length, total: candidates.length })}
            </span>
            <Button kind="secondary" icon="RefreshCw" loading={extract.isPending} onClick={handleExtract}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
            <Button
              kind="primary"
              icon="Sparkles"
              disabled={accepted.length === 0}
              onClick={() => setModalOpen(true)}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={s.loadingStack}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={110} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : t("page.loadError")}
          onRetry={() => refetch()}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={handleExtract}
          ctaLoading={extract.isPending}
        />
      ) : (
        <div style={s.cardGrid}>
          {candidates.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              repoFullName={activeRepo?.full_name ?? null}
              sourceSha={data?.scan?.source_sha ?? null}
              onAccept={() => setStatus.mutate({ id: c.id, status: "accepted" })}
              onReject={() => setStatus.mutate({ id: c.id, status: "rejected" })}
              pending={setStatus.isPending && setStatus.variables?.id === c.id}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateSkillModal
          repoName={repoName}
          candidates={accepted}
          saving={createSkill.isPending}
          onClose={() => setModalOpen(false)}
          onCreate={(input) =>
            createSkill.mutate(input, {
              onSuccess: (skill) => {
                toast.toast(t("modal.createdToast", { name: skill.name }), "success");
                setModalOpen(false);
              },
              onError: (e) => {
                toast.toast(e instanceof ApiError ? e.message : t("modal.failed"), "error");
              },
            })
          }
        />
      )}
    </AppShell>
  );
}

export default ConventionsView;
