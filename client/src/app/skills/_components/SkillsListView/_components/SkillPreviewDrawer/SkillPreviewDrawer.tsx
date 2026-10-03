/* SkillPreviewDrawer — side preview opened by clicking a SkillCard. Read-only:
   name, type, source/trust badge, rendered markdown body, and an Edit button
   that navigates to the full editor (/skills/:id, built by a parallel task).
   Wiring mirrors RunHistory -> RunTraceDrawer: a selected-id state on the list
   view conditionally mounts this drawer. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Badge, Drawer, Markdown, Skeleton, ErrorState } from "@devdigest/ui";
import { useSkill } from "../../../../../../lib/hooks/skills";
import { skillTypeMeta } from "../../../../helpers";
import { s } from "./styles";

export function SkillPreviewDrawer({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: sk, isLoading, isError, refetch } = useSkill(skillId);

  return (
    <Drawer
      title={sk?.name ?? t("detail.crumbSkill")}
      subtitle={sk ? t("preview.version", { version: sk.version }) : undefined}
      onClose={onClose}
      footer={
        sk && (
          <div style={s.footer}>
            <Button kind="primary" size="sm" icon="Edit" onClick={() => router.push(`/skills/${sk.id}`)}>
              {t("preview.edit")}
            </Button>
          </div>
        )
      }
    >
      {isLoading && <Skeleton height={160} />}
      {isError && <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />}
      {sk && (
        <>
          <div style={s.badgeRow}>
            <Badge color={skillTypeMeta(sk.type).color} icon={skillTypeMeta(sk.type).icon}>
              {t(`listItem.type.${sk.type}`)}
            </Badge>
            <Badge color="var(--text-secondary)" icon={sk.source === "manual" ? "Check" : "AlertTriangle"}>
              {t(`listItem.source.${sk.source}`)}
            </Badge>
            <Badge color="var(--text-secondary)">{sk.enabled ? t("preview.enabled") : t("preview.disabled")}</Badge>
          </div>
          <Markdown>{sk.body}</Markdown>
        </>
      )}
    </Drawer>
  );
}
