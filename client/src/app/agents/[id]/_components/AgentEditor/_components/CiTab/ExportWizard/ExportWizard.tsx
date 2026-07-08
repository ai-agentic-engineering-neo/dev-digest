"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import { useSecretsStatus } from "@/lib/hooks/settings";
import type { ApiError } from "@/lib/api";
import type { CiFile, CiTarget } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { DEFAULT_BASE, DEFAULT_TRIGGERS, MODAL_WIDTH, RECOMMENDED_TARGET } from "./constants";
import { categorizeFiles, triggersToList, withEditedWorkflow } from "./helpers";
import type { PostAs, TriggerState, WizardStep } from "./types";
import { TargetStep } from "./_components/TargetStep/TargetStep";
import { PreviewStep } from "./_components/PreviewStep/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep/ConfigureStep";
import { InstallStep } from "./_components/InstallStep/InstallStep";
import { buildZip, downloadBlob } from "./zip";

const STEP_KEYS = ["target", "preview", "configure", "install"] as const;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as ApiError).message);
  return "Something went wrong.";
}

/** 4-step Export-to-CI wizard: Target → Preview → Configure → Install. Reuses
 *  the shared `Modal` primitive (role="dialog"/aria-modal + close button). */
export function ExportWizard({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const exportCi = useExportCi(agentId);
  const secretsStatus = useSecretsStatus();

  const [step, setStep] = React.useState<WizardStep>(0);
  const [target, setTarget] = React.useState<CiTarget>(RECOMMENDED_TARGET);
  const [repo, setRepo] = React.useState("");
  const [triggers, setTriggers] = React.useState<TriggerState>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [files, setFiles] = React.useState<CiFile[] | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [prUrl, setPrUrl] = React.useState<string | null>(null);
  const [prError, setPrError] = React.useState<string | null>(null);

  // The shared `Modal` primitive provides role="dialog"/aria-modal + a visible
  // close button, but no Escape-key handler — add one so the wizard is fully
  // keyboard-dismissable.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loadPreview = React.useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await exportCi.mutateAsync({
        repo: repo.trim(),
        target,
        action: "files",
        post_as: postAs,
        triggers: triggersToList(triggers),
        base: DEFAULT_BASE,
      });
      setFiles(result.files);
    } catch (err) {
      setPreviewError(errorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, target]);

  const goNext = () => {
    if (step === 0) {
      setStep(1);
      void loadPreview();
      return;
    }
    setStep((s) => (Math.min(s + 1, 3) as WizardStep));
  };

  const goBack = () => setStep((s) => (Math.max(s - 1, 0) as WizardStep));

  const toggleTrigger = (key: keyof TriggerState) =>
    setTriggers((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleWorkflowChange = (contents: string) => {
    setFiles((prev) => {
      if (!prev) return prev;
      const { workflow } = categorizeFiles(prev);
      if (!workflow) return prev;
      return withEditedWorkflow(prev, workflow.path, contents);
    });
  };

  const handleOpenPr = async () => {
    setPrError(null);
    try {
      // Ship the user's Preview-step edits to the workflow file, not just the
      // freshly-generated YAML — only meaningful for the GHA target, which is
      // the only one with an editable workflow file (AC-3).
      const workflowOverride =
        target === "gha" && files ? (categorizeFiles(files).workflow?.contents ?? null) : null;
      const result = await exportCi.mutateAsync({
        repo: repo.trim(),
        target,
        action: "open_pr",
        post_as: postAs,
        triggers: triggersToList(triggers),
        base: DEFAULT_BASE,
        workflow_override: workflowOverride,
      });
      setPrUrl(result.pr_url);
    } catch (err) {
      setPrError(errorMessage(err));
    }
  };

  const handleDownloadZip = () => {
    if (!files) return;
    const blob = buildZip(files.map((f) => ({ path: f.path, contents: f.contents })));
    downloadBlob(blob, `devdigest-ci-${target}.zip`);
  };

  const canContinueFromTarget = repo.trim().length > 0;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agentName || t("exportWizard.thisAgent") })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button kind="ghost" onClick={step === 0 ? onClose : goBack}>
            {t("exportWizard.back")}
          </Button>
          {step < 3 && (
            <Button kind="primary" onClick={goNext} disabled={step === 0 && !canContinueFromTarget}>
              {t("exportWizard.continue")}
            </Button>
          )}
        </div>
      }
    >
      <div style={{ padding: "16px 24px 0" }}>
        <ExportWizardSteps step={step} labels={STEP_KEYS.map((key) => t(`exportWizard.steps.${key}`))} />
      </div>

      {step === 0 && <TargetStep target={target} onSelectTarget={setTarget} repo={repo} onRepoChange={setRepo} />}
      {step === 1 && (
        <PreviewStep
          loading={previewLoading}
          error={previewError}
          files={files}
          onWorkflowChange={handleWorkflowChange}
        />
      )}
      {step === 2 && (
        <ConfigureStep
          triggers={triggers}
          onToggleTrigger={toggleTrigger}
          postAs={postAs}
          onChangePostAs={setPostAs}
          openrouterReady={!!secretsStatus.data?.openrouter}
          secretsLoading={secretsStatus.isLoading}
        />
      )}
      {step === 3 && (
        <InstallStep
          target={target}
          repo={repo}
          files={files ?? []}
          isOpeningPr={exportCi.isPending}
          prUrl={prUrl}
          prError={prError}
          onOpenPr={handleOpenPr}
          onDownloadZip={handleDownloadZip}
        />
      )}
    </Modal>
  );
}
