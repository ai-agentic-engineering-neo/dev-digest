"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, ExportWizardSteps } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import type { CiExport, CiExportInputBody, CiTarget } from "@devdigest/shared/contracts/eval-ci";
import { useCiPreview, useExportCi } from "@/lib/hooks/ci";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep, type PostAsMode } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { STEP_KEYS, DEFAULT_TRIGGERS, type CiTriggerEvent } from "./constants";
import { s } from "./styles";

/** `owner/name` shape, checked locally — clarification 6: no per-keystroke
 *  provider call; the Configure step's secret lookup is the first one. */
const REPO_SHAPE_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * specs/14-export-to-ci.md — Target → Preview → Configure → Install (D4/AC-1).
 * Owns the shared wizard state; each step is a thin, mostly-presentational
 * child. Regenerating the preview on every Configure change (AC-4c) falls
 * out of `useCiPreview` being keyed on the whole input object — no explicit
 * "regenerate" call needed.
 */
export function ExportWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const toast = useToast();
  const [step, setStep] = React.useState(0);
  const [target, setTarget] = React.useState<CiTarget>("gha");
  const [repo, setRepo] = React.useState("");
  const [triggers, setTriggers] = React.useState<CiTriggerEvent[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAsMode>("github_review");
  const [result, setResult] = React.useState<CiExport | null>(null);

  const repoValid = REPO_SHAPE_RE.test(repo.trim());

  const input: CiExportInputBody = {
    repo: repo.trim(),
    target,
    action: "open_pr",
    post_as: postAs,
    triggers,
    base: "main",
  };

  const { data: preview, isLoading: previewLoading } = useCiPreview(agent.id, input, repoValid && step >= 1);
  const exportCi = useExportCi(agent.id);

  const stepLabels = STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`));

  const canContinue = step === 0 ? repoValid : true;

  const handleOpenPr = () => {
    exportCi.mutate(input, {
      // AC-7 — the HTTP status is the ONLY honest signal for "opened a new
      // PR" (201, first install) vs "pushed a new commit to the existing PR"
      // (200, a republish reusing the same installation) — the `CiExport`
      // body is otherwise identical either way (finding 5).
      onSuccess: ({ data, status }) => {
        setResult(data);
        if (data.refused_reason) {
          toast.error(data.refused_reason);
        } else {
          toast.success(
            status === 201 ? t("exportWizard.installSuccessNew") : t("exportWizard.installSuccessReused")
          );
        }
      },
      // AC-10a — "no credential" / "cannot write" now come back as a 422
      // (`ApiError`), not a 200 body field; surface the server's stated
      // reason directly rather than the generic export-error copy. The
      // archive/zip option (rendered unconditionally by InstallStep) stays
      // available regardless — this mutation only ever drives the PR path.
      onError: (err) => {
        toast.error(err instanceof ApiError && err.status === 422 ? err.message : t("exportWizard.exportError"));
      },
    });
  };

  return (
    <Modal width={760} title={t("exportWizard.title")} subtitle={t("exportWizard.subtitle", { agentName: agent.name })} onClose={onClose}>
      <div style={s.stepsBar}>
        <ExportWizardSteps step={step} labels={stepLabels} />
      </div>
      <div style={s.body}>
        {step === 0 && <TargetStep target={target} onTarget={setTarget} repo={repo} onRepo={setRepo} />}
        {step === 1 && (
          <PreviewStep agentId={agent.id} input={input} files={preview?.files} isLoading={previewLoading} />
        )}
        {step === 2 && (
          <ConfigureStep
            secrets={preview?.secrets}
            triggers={triggers}
            onTriggers={setTriggers}
            postAs={postAs}
            onPostAs={setPostAs}
          />
        )}
        {step === 3 && (
          <InstallStep
            agentId={agent.id}
            input={input}
            onOpenPr={handleOpenPr}
            isExporting={exportCi.isPending}
            result={result}
            fileCount={preview?.files.length}
          />
        )}
      </div>
      <div style={s.footer}>
        <div>
          {step > 0 && (
            <Button kind="secondary" onClick={() => setStep((n) => n - 1)}>
              {t("exportWizard.back")}
            </Button>
          )}
        </div>
        <div style={s.footerRight}>
          {step < 3 ? (
            <Button kind="primary" onClick={() => setStep((n) => n + 1)} disabled={!canContinue}>
              {t("exportWizard.continue")}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
