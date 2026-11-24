/* ConventionsView — candidates of a repo with accept / reject / edit, re-scan,
   and "Create skill" from the accepted ones. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { SkillEditorModal } from "@/components/skill-editor-modal";
import {
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useSetAllConventionsAccepted,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { SKELETON_CARDS } from "./constants";
import { buildConventionSkillDraft, repoShortName } from "./helpers";
import { ConventionCard } from "./_components/ConventionCard";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const setAll = useSetAllConventionsAccepted(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [created, setCreated] = React.useState<Skill | null>(null);

  const fullName = activeRepo?.full_name ?? repoId;
  const repoName = repoShortName(fullName);
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const list = data ?? [];
  const accepted = list.filter((c) => c.accepted);
  const allAccepted = list.length > 0 && accepted.length === list.length;
  const dropped = extract.data?.dropped ?? 0;

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const run = () => {
    setCreated(null);
    extract.mutate();
  };
  const extractError =
    extract.error instanceof ApiError ? extract.error.message : extract.error ? String(extract.error) : null;
  const draft = modalOpen ? buildConventionSkillDraft(fullName, accepted) : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          {list.length > 0 && (
            <Button kind="secondary" icon="RefreshCw" loading={extract.isPending} onClick={run}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {extractError && (
          <div role="alert" style={{ ...s.error, marginTop: 16 }}>
            {t("page.extractionFailed")}: {extractError}
          </div>
        )}
        {created && (
          <div role="status" style={{ ...s.note, marginTop: 16 }}>
            {t("page.skillSaved", { name: created.name })}{" "}
            <Link href="/skills">{t("page.openSkills")}</Link>
          </div>
        )}
        {dropped > 0 && !extract.isPending && (
          <div style={{ ...s.note, marginTop: 16 }}>{t("page.dropped", { count: dropped })}</div>
        )}

        {isLoading ? (
          <div style={{ ...s.list, marginTop: 24 }}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={run}
            ctaLoading={extract.isPending}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="ghost"
                icon={allAccepted ? "X" : "Check"}
                onClick={() => setAll.mutate(!allAccepted)}
                disabled={setAll.isPending}
              >
                {allAccepted ? t("page.deselectAll") : t("page.selectAll")}
              </Button>
              <span style={s.count}>
                {t("page.acceptedCount", { accepted: accepted.length, total: list.length })}
              </span>
              <Button
                kind="primary"
                icon="Sparkles"
                disabled={accepted.length === 0}
                onClick={() => setModalOpen(true)}
              >
                {t("page.createSkill")}
              </Button>
            </div>
            <div style={s.list}>
              {list.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  onAccept={(v) => update.mutate({ id: c.id, patch: { accepted: v } })}
                  onReject={() => reject.mutate(c.id)}
                  onEditRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {draft && (
        <SkillEditorModal
          initial={draft.draft}
          source="extracted"
          evidenceFiles={draft.evidenceFiles}
          title={t("modal.title")}
          subtitle={draft.draft.name}
          submitLabel={t("page.createSkill")}
          banner={t("modal.banner", { count: accepted.length, repo: repoName })}
          onClose={() => setModalOpen(false)}
          onSaved={setCreated}
        />
      )}
    </AppShell>
  );
}
