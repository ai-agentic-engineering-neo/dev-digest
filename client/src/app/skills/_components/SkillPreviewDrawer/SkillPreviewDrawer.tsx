/* SkillPreviewDrawer — side drawer on /skills?preview=<id>: meta, the rendered
   body, "Used by", and Edit / Delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Icon, Markdown, SectionLabel, Skeleton } from "@devdigest/ui";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill, useSkillAgents } from "@/lib/hooks";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { ImportedBanner } from "../ImportedBanner";
import { s } from "./styles";

export function SkillPreviewDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError } = useSkill(id);
  const { data: agents } = useSkillAgents(id);
  const [deleting, setDeleting] = React.useState(false);

  return (
    <Drawer
      width={620}
      title={<span className="mono">{skill ? `${skill.name}.md` : "…"}</span>}
      subtitle={skill?.description || undefined}
      onClose={onClose}
      footer={
        skill && (
          <div style={s.footer}>
            <Button kind="danger" icon="Trash" onClick={() => setDeleting(true)}>
              {t("drawer.delete")}
            </Button>
            <Button kind="primary" icon="Edit" onClick={() => onEdit(skill.id)}>
              {t("drawer.edit")}
            </Button>
          </div>
        )
      }
    >
      {isLoading && <Skeleton height={200} />}
      {isError && <ErrorState title={t("drawer.loadError")} />}
      {skill && (
        <>
          <div style={s.meta}>
            <SkillTypeBadge type={skill.type} />
            <Badge color="var(--text-secondary)">{t(`source.${skill.source}`)}</Badge>
            <Badge color="var(--text-secondary)" mono>
              {t("drawer.version", { version: skill.version })}
            </Badge>
            <Badge color={skill.enabled ? "var(--ok)" : "var(--text-muted)"} dot>
              {skill.enabled ? t("drawer.enabled") : t("drawer.disabled")}
            </Badge>
          </div>
          <ImportedBanner skill={skill} />
          <div style={s.body}>
            <Markdown>{skill.body}</Markdown>
          </div>
          <SectionLabel icon="Cpu">{t("drawer.usedBy")}</SectionLabel>
          {agents && agents.length === 0 && <p style={s.muted}>{t("drawer.notUsed")}</p>}
          {agents && agents.length > 0 && (
            <ul style={s.agents}>
              {agents.map((a) => (
                <li key={a.id} style={s.agent(a.enabled)}>
                  <Icon.Cpu size={13} />
                  {a.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {deleting && skill && (
        <DeleteSkillModal
          skill={skill}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
