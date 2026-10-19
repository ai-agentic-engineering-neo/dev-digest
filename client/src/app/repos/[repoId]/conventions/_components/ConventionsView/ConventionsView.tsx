/* ConventionsView — header (repo, sample count, last scan, Re-scan), bulk
   Accept all / Reject all, the candidate cards, and the "Create skill" bar
   that opens the compose modal over every accepted candidate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  useBulkConventions,
  useConventions,
  useExtractConventions,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillBar } from "../CreateSkillBar";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { SKELETON_CARDS } from "./constants";
import { agoParts, countByStatus } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId, repo }: { repoId: string; repo: Repo | null }) {
  const t = useTranslations("conventions");
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const bulk = useBulkConventions(repoId);
  const [composing, setComposing] = React.useState(false);

  const items = data?.items ?? [];
  const scan = data?.scan ?? null;
  const running = scan?.status === "running" || extract.isPending;
  const { pending, accepted } = countByStatus(items);
  const acceptedItems = items.filter((i) => i.status === "accepted");

  const ago = agoParts(scan?.finished_at ?? scan?.started_at);
  const agoText = !ago
    ? ""
    : ago.unit === "now"
      ? t("page.justNow")
      : t(ago.unit === "m" ? "page.minutesAgo" : ago.unit === "h" ? "page.hoursAgo" : "page.daysAgo", { n: ago.n });
  const subtitle = running
    ? t("page.scanning")
    : scan?.status === "done"
      ? t("page.detected", { count: scan.files_sampled, ago: agoText })
      : t("page.subtitle");

  const runExtraction = () => extract.mutate();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerText}>
          <h1 style={s.title}>
            {t("page.headingPrefix")}
            <span className="mono">{repo?.name ?? t("page.repoFallback")}</span>
          </h1>
          <p style={s.subtitle}>{subtitle}</p>
        </div>
        <Button icon="RefreshCw" onClick={runExtraction} loading={running} disabled={running || isLoading}>
          {items.length > 0 || scan ? t("page.rescan") : t("page.runExtraction")}
        </Button>
      </div>

      {extract.error && (
        <div role="alert" style={s.banner}>
          <strong>{t("page.extractionFailed")}</strong>
          <span>{extract.error instanceof ApiError ? extract.error.message : String(extract.error)}</span>
        </div>
      )}
      {!extract.error && scan?.status === "failed" && (
        <div role="alert" style={s.banner}>
          <strong>{t("page.extractionFailed")}</strong>
          {scan.error && <span>{scan.error}</span>}
        </div>
      )}

      {items.length > 0 && (
        <div style={s.toolbar}>
          <Button
            size="sm"
            icon="Check"
            onClick={() => bulk.mutate("accepted")}
            disabled={pending === 0 || bulk.isPending || running}
          >
            {t("page.acceptAll", { count: pending })}
          </Button>
          <Button
            size="sm"
            kind="ghost"
            icon="X"
            onClick={() => bulk.mutate("rejected")}
            disabled={pending === 0 || bulk.isPending || running}
          >
            {t("page.rejectAll")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div style={s.list}>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.loadError")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        running ? (
          <EmptyState icon="RefreshCw" title={t("page.scanning")} body={t("page.scanningBody")} />
        ) : scan?.status === "done" ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.noneFound.title")}
            body={t("page.noneFound.body")}
            cta={t("page.rescan")}
            onCta={runExtraction}
          />
        ) : (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        )
      ) : (
        <div style={s.list}>
          {items.map((c) => (
            <ConventionCard key={c.id} repoId={repoId} repo={repo} convention={c} disabled={running} />
          ))}
        </div>
      )}

      {accepted > 0 && <CreateSkillBar count={accepted} onCreate={() => setComposing(true)} />}

      {composing && (
        <CreateSkillFromConventionsModal
          repoName={repo?.name ?? t("page.repoFallback")}
          conventions={acceptedItems}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
