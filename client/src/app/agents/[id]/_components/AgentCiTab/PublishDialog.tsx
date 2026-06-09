/* PublishDialog — one-click "Publish to CI". Replaces the old 4-step
   ExportWizard for the common path: target is always GitHub Actions, the repo
   is the active workspace repo, and the agent config lives in the agent itself.
   Publishing commits the workflow + .devdigest/ files and opens (or updates) a PR. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Modal, MonoLink } from "@devdigest/ui";
import type { CiExport } from "@devdigest/shared/contracts/eval-ci";
import { useExportToCi } from "../../../../../lib/hooks/ci";
import { useToast } from "../../../../../lib/toast";
import { s } from "./styles";

const OPENROUTER_KEY = "OPENROUTER_API_KEY";

export function PublishDialog({
  agentId,
  agentName,
  repo,
  base,
  onClose,
}: {
  agentId: string;
  agentName?: string;
  /** owner/name of the target repo (the active workspace repo). */
  repo: string;
  /** Base branch to open the PR against (the repo's default branch). */
  base: string;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const toast = useToast();
  const exportCi = useExportToCi();
  const [prUrl, setPrUrl] = React.useState<string | null>(null);
  const done = exportCi.isSuccess;

  const publish = async () => {
    const res: CiExport = await exportCi.mutateAsync({
      agentId,
      input: { repo, base, target: "gha", action: "open_pr", post_as: "github_review" },
    });
    setPrUrl(res.pr_url);
    toast.success(t("publishDialog.doneTitle"));
  };

  const footer = (
    <div style={s.dialogFooter}>
      {!done ? (
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("publishDialog.cancel")}
          </Button>
          <Button kind="primary" icon="GitPullRequest" onClick={publish} disabled={exportCi.isPending}>
            {exportCi.isPending ? t("publishDialog.publishing") : t("publishDialog.publish")}
          </Button>
        </>
      ) : (
        <>
          {prUrl && (
            <Button kind="ghost" iconRight="ExternalLink" onClick={() => window.open(prUrl, "_blank")}>
              {t("publishDialog.openPr")}
            </Button>
          )}
          <Button kind="primary" icon="Check" onClick={onClose}>
            {t("publishDialog.close")}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      width={520}
      title={t("publishDialog.title")}
      subtitle={t("publishDialog.subtitle", { agentName: agentName ?? t("exportWizard.thisAgent"), repo })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.dialogBody}>
        {done ? (
          <p style={s.dialogIntro}>{t("publishDialog.doneBody", { repo })}</p>
        ) : (
          <p style={s.dialogIntro}>{t("publishDialog.intro", { repo })}</p>
        )}
        <div style={s.secretNote}>
          <Icon.Lock size={14} />
          <span>{t("publishDialog.secretNote", { key: OPENROUTER_KEY })}</span>
        </div>
      </div>
    </Modal>
  );
}

export default PublishDialog;
