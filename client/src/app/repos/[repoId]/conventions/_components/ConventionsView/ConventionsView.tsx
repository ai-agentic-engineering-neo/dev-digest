/* /repos/:repoId/conventions — the Conventions extractor (Skills Lab).
   Run Scan (first run, empty state) / ReScan (header, once scanned) sample the repo in code,
   ask one model call for candidate rules and keep only those whose evidence is really in the
   code. Each card is triaged with Accept / Reject / Edit; "Create skill" appears once at least
   one candidate is accepted and turns the accepted set into the `repo-conventions` skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionExtractResult, ConventionSkillResult } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard, githubEvidenceUrl } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { SKELETON_CARDS } from "./constants";
import { acceptedOf, groundedCount } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();

  const [scan, setScan] = React.useState<ConventionExtractResult | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [created, setCreated] = React.useState<ConventionSkillResult | null>(null);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const board = candidates ?? [];
  const accepted = acceptedOf(board);
  // "Scanned" = the board has cards, or a scan just ran (which may legitimately find nothing new).
  const scanned = board.length > 0 || scan !== null;
  const scanning = extract.isPending;

  const runScan = () => {
    setCreated(null);
    extract.mutate(repoId, { onSuccess: (result) => setScan(result) });
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {modalOpen && (
          <CreateSkillModal
            repoId={repoId}
            acceptedCount={accepted.length}
            onClose={() => setModalOpen(false)}
            onCreated={(result) => {
              setModalOpen(false);
              setCreated(result);
            }}
          />
        )}

        <div style={s.headerRow}>
          <h1 style={s.heading}>
            {t("page.headingPrefix")}
            <span className="mono" style={s.repoName}>
              {repoName}
            </span>
          </h1>
          {scanned && (
            <Button icon="RefreshCw" onClick={runScan} loading={scanning} disabled={scanning}>
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>
        <p style={s.subtitle}>
          {scanned
            ? t("page.acceptedCount", { accepted: accepted.length, total: board.length })
            : t("page.subtitle")}
        </p>

        {scanning && (
          <div style={s.progress} role="status">
            <Icon.RefreshCw size={14} />
            {t("scan.progress")}
          </div>
        )}
        {extract.isError && !scanning && (
          <div style={s.error} role="alert">
            <strong>{t("scan.failedTitle")}</strong>
            <div>{extract.error instanceof Error ? extract.error.message : ""}</div>
          </div>
        )}
        {scan && !scanning && (
          <div style={s.summary} aria-label={t("scan.summaryTitle")}>
            <Badge>{t("scan.proposed", { count: scan.proposed })}</Badge>
            <Badge>{t("scan.grounded", { count: groundedCount(scan) })}</Badge>
            <Badge>{t("scan.droppedUngrounded", { count: scan.dropped_ungrounded })}</Badge>
            <Badge>{t("scan.droppedDuplicate", { count: scan.dropped_duplicate })}</Badge>
            <span>{t("scan.sampled", { count: scan.sampled_files.length })}</span>
            <span className="mono">{t("scan.model", { model: scan.model })}</span>
          </div>
        )}
        {created && (
          <div style={s.created} role="status">
            <Icon.CheckCircle size={14} />
            <span>{t("created.message", { name: created.skill.name })}</span>
            <Link href="/skills" style={s.createdLink}>
              {t("created.view")}
            </Link>
          </div>
        )}

        {isLoading && (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={180} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && !scanned && (
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={scanning ? t("page.scanning") : t("page.runScan")}
            ctaLoading={scanning}
            onCta={scanning ? undefined : runScan}
          />
        )}
        {!isLoading && !isError && scanned && board.length === 0 && !scanning && (
          <EmptyState icon="ListChecks" title={t("empty.afterScanTitle")} body={t("empty.afterScanBody")} />
        )}

        {board.length > 0 && (
          <div style={s.list}>
            {board.map((candidate) => (
              <ConventionCard
                key={candidate.id}
                candidate={candidate}
                busy={update.isPending && update.variables?.id === candidate.id}
                evidenceHref={githubEvidenceUrl(
                  activeRepo?.full_name,
                  activeRepo?.default_branch,
                  candidate.evidence_path,
                  candidate.evidence_line,
                )}
                onStatus={(status) => update.mutate({ repoId, id: candidate.id, patch: { status } })}
                onSave={(patch) => update.mutate({ repoId, id: candidate.id, patch })}
              />
            ))}
          </div>
        )}

        {accepted.length > 0 && (
          <div style={s.bar}>
            <span>{t("bar.selected", { count: accepted.length })}</span>
            <Button kind="primary" icon="Sparkles" onClick={() => setModalOpen(true)}>
              {t("page.createSkill")}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
