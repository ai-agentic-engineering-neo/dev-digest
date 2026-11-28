/* ConventionsView — the Conventions page body: run or re-run the extraction,
   review each candidate (accept / reject / edit), and open the modal that
   merges the accepted ones into a skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Repo, Skill } from "@devdigest/shared";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import { acceptedOnly, scanAge } from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { s } from "./styles";

export interface ConventionsViewProps {
  repoId: string;
  repo: Repo | null;
}

export function ConventionsView({ repoId, repo }: ConventionsViewProps) {
  const t = useTranslations("conventions");
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [created, setCreated] = React.useState<Skill | null>(null);

  const repoName = repo?.full_name ?? t("page.repoFallback");
  const candidates = data?.candidates ?? [];
  const accepted = acceptedOnly(candidates);
  const scanned = data?.last_scan_at != null;
  const age = data?.last_scan_at ? scanAge(data.last_scan_at, Date.now()) : null;
  const ageLabel = age ? t(`page.age.${age.key}`, { count: age.count }) : "";
  const run = () => {
    setCreated(null);
    extract.mutate();
  };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div>
          <h1 style={s.title}>
            {t("page.headingPrefix")}
            <span style={s.repoName}>{repoName}</span>
          </h1>
          <p style={s.subtitle}>
            {!scanned
              ? t("page.subtitle")
              : data?.sample_count != null
                ? t("page.scanSummary", { count: data.sample_count, age: ageLabel })
                : t("page.scanSummaryNoCount", { age: ageLabel })}
          </p>
        </div>
        {scanned && (
          <div style={s.actions}>
            <span style={s.count}>{t("page.acceptedCount", { accepted: accepted.length, total: candidates.length })}</span>
            <Button icon="RefreshCw" loading={extract.isPending} onClick={run}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
            <Button kind="primary" icon="Sparkles" disabled={accepted.length === 0} onClick={() => setModalOpen(true)}>
              {t("page.createSkill")}
            </Button>
          </div>
        )}
      </header>

      {extract.error && (
        <div role="alert" style={s.alert}>
          {t("page.extractionFailed")}: {extract.error.message}
        </div>
      )}

      {created && (
        <div role="status" style={s.notice}>
          <span>{t("page.skillCreated", { name: created.name })}</span>
          <Link href={`/skills/${created.id}`}>{t("page.openSkill")}</Link>
        </div>
      )}

      {isLoading ? (
        <Skeleton height={120} />
      ) : isError ? (
        <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />
      ) : !scanned ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
          onCta={run}
          ctaLoading={extract.isPending}
        />
      ) : candidates.length === 0 ? (
        <p style={s.muted}>{t("page.noneFound")}</p>
      ) : (
        <div style={s.list}>
          {candidates.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              repo={repo}
              onDecide={(status) => patch.mutate({ id: c.id, patch: { status } })}
              onEditRule={(rule) => patch.mutate({ id: c.id, patch: { rule } })}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          accepted={accepted}
          onClose={() => setModalOpen(false)}
          onCreated={(skill) => {
            setModalOpen(false);
            setCreated(skill);
          }}
        />
      )}
    </div>
  );
}
