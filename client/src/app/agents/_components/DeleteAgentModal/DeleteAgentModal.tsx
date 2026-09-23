/* DeleteAgentModal — confirm deleting an agent (its versions and skill links go
   with it). Mirrors the skills DeleteSkillModal; used by the agent card. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function DeleteAgentModal({
  agent,
  onClose,
  onDeleted,
}: {
  agent: Pick<Agent, "id" | "name">;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();

  const confirm = () =>
    del.mutate(agent.id, {
      onSuccess: () => {
        toast.success(t("delete.deleted", { name: agent.name }));
        onDeleted?.();
      },
    });

  return (
    <Modal
      width={460}
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
        <p>{t("delete.body", { name: agent.name })}</p>
      </div>
    </Modal>
  );
}
