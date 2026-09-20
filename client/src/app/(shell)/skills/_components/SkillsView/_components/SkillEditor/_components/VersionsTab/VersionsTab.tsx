/* VersionsTab — immutable body snapshots, newest first, current one badged. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillVersions } from "@/lib/api/skills";
import { s } from "./styles";

export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skillId);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;

  const sorted = [...(versions ?? [])].sort((a, b) => b.version - a.version);

  return (
    <div style={s.wrap}>
      {sorted.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}
      {sorted.map((v) => (
        <div key={v.version} style={s.row}>
          <Badge mono>{t("preview.version", { version: v.version })}</Badge>
          <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
          {v.version === currentVersion && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
        </div>
      ))}
    </div>
  );
}
