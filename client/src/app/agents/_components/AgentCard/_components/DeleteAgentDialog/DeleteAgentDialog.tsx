/* DeleteAgentDialog — "Delete agent" confirmation modal opened by the
   AgentCard trash icon. Owns the DELETE request: locked while it runs, toast +
   onDeleted on success, error kept in the dialog for a retry. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/lib/error-message";

export function DeleteAgentDialog({
  agent,
  onClose,
  onDeleted,
}: {
  agent: Agent;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();
  const [error, setError] = React.useState<string | null>(null);

  const confirm = () => {
    if (del.isPending) return;
    setError(null);
    del.mutate(agent.id, {
      onSuccess: () => {
        toast.success(t("deleteDialog.deleted"));
        onClose();
        onDeleted?.(agent.id);
      },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  return (
    <ConfirmDialog
      title={t("deleteDialog.title")}
      body={t("deleteDialog.body", { name: agent.name })}
      confirmLabel={t("deleteDialog.confirm")}
      pendingLabel={t("deleteDialog.pending")}
      cancelLabel={t("deleteDialog.cancel")}
      pending={del.isPending}
      error={error}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
