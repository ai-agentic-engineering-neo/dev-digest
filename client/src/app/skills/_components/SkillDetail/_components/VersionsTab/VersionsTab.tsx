/* VersionsTab — body snapshots newest first; per-row Diff vs the previous version and Restore as a
   new version (SPEC §3.1, §5.6). */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { RestoreConfirmModal } from "./_components/RestoreConfirmModal";
import { VersionRow } from "./_components/VersionRow";
import { SKELETON_ROWS } from "./constants";
import { sortNewestFirst } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.versions");
  const toast = useToast();
  const versions = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  // The version awaiting a restore confirmation (Diff is inline, per row).
  const [restoring, setRestoring] = useState<SkillVersion | null>(null);

  const closeDialog = () => setRestoring(null);

  async function handleRestoreConfirm(version: SkillVersion) {
    try {
      const restored = await restore.mutateAsync({ id: skill.id, version: version.version });
      toast.success(t("restored", { from: version.version, to: restored.version }));
    } catch {
      // The global MutationCache toast reports the failure (lib/providers.tsx).
    } finally {
      closeDialog();
    }
  }

  if (versions.isPending) return <VersionsSkeleton />;
  if (versions.isError || !versions.data) {
    return <ErrorState title={t("loadError")} onRetry={() => void versions.refetch()} />;
  }

  const rows = sortNewestFirst(versions.data);
  return (
    <section style={s.panel} aria-labelledby="skill-versions-title">
      <header style={s.header}>
        <div style={s.titleRow}>
          <h3 id="skill-versions-title" style={s.title}>
            {t("title")}
          </h3>
          <Badge>{t("count", { count: rows.length })}</Badge>
        </div>
        <p style={s.subtitle}>{t("subtitle")}</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState icon="History" title={t("empty")} />
      ) : (
        <ul style={s.list}>
          {rows.map((version, index) => (
            <VersionRow
              key={version.version}
              version={version}
              // Newest first, so the next row is the version this one was made from.
              previous={rows[index + 1]}
              isCurrent={version.version === skill.version}
              onRestore={(v) => setRestoring(v)}
            />
          ))}
        </ul>
      )}
      {restoring && (
        <RestoreConfirmModal
          version={restoring.version}
          nextVersion={skill.version + 1}
          isPending={restore.isPending}
          onConfirm={() => void handleRestoreConfirm(restoring)}
          onCancel={closeDialog}
        />
      )}
    </section>
  );
}

function VersionsSkeleton() {
  const t = useTranslations("skills.versions");
  return (
    <div style={s.panel} aria-busy="true" aria-label={t("loading")}>
      {SKELETON_ROWS.map((key) => (
        <div key={key} style={s.skeletonRow}>
          <Skeleton height={18} />
        </div>
      ))}
    </div>
  );
}
