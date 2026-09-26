"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Skeleton, EmptyState, ErrorState } from "@devdigest/ui";
import { useCrumb } from "@/components/app-shell";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
  useDeselectAllConventions,
} from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { relativeTime } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const deselectAll = useDeselectAllConventions(repoId);

  const [errorDismissed, setErrorDismissed] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<{ id: string; action: "accept" | "reject" } | null>(null);

  const repoName = activeRepo?.full_name ?? data?.repo.full_name ?? repoId;
  useCrumb([{ label: t("page.crumbLab") }, { label: repoName, mono: true }, { label: t("page.crumbConventions") }]);

  const runScan = () => {
    setErrorDismissed(false);
    extract.mutate();
  };

  if (isLoading) {
    return (
      <div style={s.body}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={48} style={{ marginBottom: 12, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState title={t("page.loadError")} body={(error as Error)?.message} onRetry={() => refetch()} />;
  }
  if (!data) return null;

  const candidates = data.candidates;
  const acceptedCount = candidates.filter((c) => c.status === "accepted").length;
  const acceptedIds = candidates.filter((c) => c.status === "accepted").map((c) => c.id);
  const sha = data.scan?.sha ?? null;

  const notReady = extract.isError && extract.error instanceof ApiError && extract.error.status === 409;
  const mutationFailed = extract.isError && !notReady;
  const scanFailed = data.scan?.status === "failed";
  const showErrorBanner = !errorDismissed && (mutationFailed || scanFailed);

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.headingPrefix") + repoName}</h1>
          <p style={s.pageSubtitle}>
            {data.scan
              ? t("page.lastScan", { files: data.scan.sample_files.length, when: relativeTime(data.scan.created_at) })
              : t("page.subtitle")}
          </p>
        </div>
        <div style={s.headerActions}>
          <Button
            kind={data.scan ? "secondary" : "primary"}
            icon={data.scan ? "RefreshCw" : "Play"}
            onClick={runScan}
            disabled={extract.isPending}
            loading={extract.isPending}
          >
            {extract.isPending ? t("page.scanning") : data.scan ? t("page.rescan") : t("page.runExtraction")}
          </Button>
        </div>
      </div>

      {notReady && !errorDismissed && (
        <div style={s.notReady}>
          <div style={s.notReadyTitle}>{t("page.notReady.title")}</div>
          <div>{t("page.notReady.body")}</div>
        </div>
      )}
      {showErrorBanner && !notReady && (
        <div style={s.errorBanner}>
          <span style={s.errorBannerText}>
            {t("page.extractionFailed")}
            {scanFailed && data.scan?.error ? `: ${data.scan.error}` : ""}
          </span>
          <Button kind="ghost" size="sm" onClick={() => setErrorDismissed(true)}>
            {t("page.dismissError")}
          </Button>
        </div>
      )}
      {data.scan && data.scan.candidates_dropped > 0 && (
        <p style={s.droppedNote}>{t("page.droppedCount", { count: data.scan.candidates_dropped })}</p>
      )}

      {candidates.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={runScan}
          ctaLoading={extract.isPending}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            <span style={s.toolbarCount}>
              {t("toolbar.acceptedCount", { accepted: acceptedCount, total: candidates.length })}
            </span>
            {acceptedCount > 0 && (
              <>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => deselectAll.mutate(acceptedIds)}
                  disabled={deselectAll.isPending}
                >
                  {t("toolbar.deselectAll")}
                </Button>
                <span style={s.toolbarSpacer}>
                  <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setModalOpen(true)}>
                    {t("toolbar.createSkill")}
                  </Button>
                </span>
              </>
            )}
          </div>
          <div style={s.cardList}>
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                repoFullName={data.repo.full_name}
                sha={sha}
                accepting={pendingId?.id === c.id && pendingId.action === "accept" && patch.isPending}
                rejecting={pendingId?.id === c.id && pendingId.action === "reject" && patch.isPending}
                onAccept={() => {
                  setPendingId({ id: c.id, action: "accept" });
                  patch.mutate({ id: c.id, patch: { status: "accepted" } });
                }}
                onReject={() => {
                  setPendingId({ id: c.id, action: "reject" });
                  patch.mutate({ id: c.id, patch: { status: "rejected" } });
                }}
                onEdit={(fields) => patch.mutate({ id: c.id, patch: fields })}
              />
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          acceptedCount={acceptedCount}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
