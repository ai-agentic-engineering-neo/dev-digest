/* useImportFlow — the import modal's step. The preview and the editable draft
   only exist together, on step 2, so they are one value. */
import React from "react";
import type { SkillImportPreview } from "@devdigest/shared";
import { toDraft, type SkillDraft } from "../../helpers";

export type ImportStep = { step: "pick" } | { step: "preview"; preview: SkillImportPreview; draft: SkillDraft };

export function useImportFlow() {
  const [state, setState] = React.useState<ImportStep>({ step: "pick" });
  return {
    state,
    /** Step 2: the server's preview, with the draft seeded from it. */
    showPreview: (preview: SkillImportPreview) => setState({ step: "preview", preview, draft: toDraft(preview) }),
    /** Edit the step-2 draft; ignored on step 1. */
    edit: (patch: Partial<SkillDraft>) =>
      setState((s) => (s.step === "preview" ? { ...s, draft: { ...s.draft, ...patch } } : s)),
    /** Back to step 1. */
    back: () => setState({ step: "pick" }),
  };
}
