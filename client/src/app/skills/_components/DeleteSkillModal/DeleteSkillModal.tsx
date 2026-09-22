/* DeleteSkillModal — confirm deleting a skill, listing the agents that link it
   (they lose the link). Used by the preview drawer and the editor danger zone. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useSkillAgents } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: Pick<Skill, "id" | "name">;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: agents, isLoading } = useSkillAgents(skill.id);
  const del = useDeleteSkill();

  const confirm = () =>
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("delete.deleted", { name: skill.name }));
        onDeleted();
      },
    });

  return (
    <Modal
      width={480}
      title={t("delete.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("delete.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? t("delete.deleting") : t("delete.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <p>{t("delete.body", { name: skill.name })}</p>
        {isLoading && <Skeleton height={40} />}
        {agents && agents.length === 0 && <p style={s.muted}>{t("delete.notLinked")}</p>}
        {agents && agents.length > 0 && (
          <>
            <p style={s.warn}>{t("delete.linked")}</p>
            <ul style={s.list}>
              {agents.map((a) => (
                <li key={a.id} style={s.item}>
                  <Icon.Cpu size={13} />
                  {a.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
