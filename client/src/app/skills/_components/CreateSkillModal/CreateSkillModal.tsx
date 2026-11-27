/* CreateSkillModal — the "Add skill" dialog with three tabs:
   - Create: type a skill in (source `manual`).
   - From file: read a .md / .txt file in the browser → the same form.
   - Import from URL: the server fetches the file → a scanned draft → the same form.
   Whatever the source, the body is scanned for prompt injection while it is
   edited and Create / Import waits for that scan. Imports are saved switched
   off. On success → the new skill's Config tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, Tabs } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { hasErrors, skillHref, validateSkillForm, type SkillFormValues } from "../helpers";
import { SkillFormFields } from "../SkillFormFields";
import { DraftSafetyNotes, isFlagged, useDraftSafety } from "../SkillSafety";
import { ImportFilePane } from "./_components/ImportFilePane";
import { ImportUrlPane } from "./_components/ImportUrlPane";
import { ADD_SKILL_TABS, EMPTY_FORM, MODAL_WIDTH, TAB_SOURCE, type AddSkillTab } from "./constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  onClose: () => void;
  /** Tab to open on (the Add Skill menu item that was picked). */
  initialTab?: AddSkillTab;
}

/** Where the form's content came from on an import tab (shown above the form). */
interface Loaded {
  label: string;
}

export function CreateSkillModal({ onClose, initialTab = "create" }: CreateSkillModalProps) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [tab, setTab] = React.useState<AddSkillTab>(initialTab);
  const [form, setForm] = React.useState<SkillFormValues>(EMPTY_FORM);
  // null on an import tab = nothing loaded yet: only the picker / URL field shows.
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  // Errors show only after the first submit attempt; a 409 marks the name that clashed.
  const [attempted, setAttempted] = React.useState(false);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const isImport = tab !== "create";
  const showForm = !isImport || loaded !== null;
  const errors = validateSkillForm(form);
  if (!errors.name && takenName === form.name) errors.name = { key: "nameTaken" };
  const shownErrors = attempted ? errors : {};
  // The body is scanned while typing; Create waits for the scan of the exact text.
  const draft = useDraftSafety(form.body);

  const setField = <K extends keyof SkillFormValues>(field: K, value: SkillFormValues[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Switching tab starts over: each tab is its own way in.
  const switchTab = (next: string) => {
    setTab(next as AddSkillTab);
    setForm(EMPTY_FORM);
    setLoaded(null);
    setAttempted(false);
    setTakenName(null);
  };

  const fill = (values: SkillFormValues, label: string) => {
    setForm(values);
    setLoaded({ label });
    setAttempted(false);
  };

  const submit = async () => {
    setAttempted(true);
    if (hasErrors(errors)) return;
    const source = TAB_SOURCE[tab];
    let skill;
    try {
      skill = await create.mutateAsync({
        name: form.name,
        description: form.description,
        type: form.type,
        body: form.body,
        ...(source ? { source } : {}),
      });
    } catch (err) {
      // Other failures are toasted by the global MutationCache (lib/providers.tsx).
      if (err instanceof ApiError && err.status === 409) setTakenName(form.name);
      return;
    }
    toast.success(t(isImport ? "add.importedToast" : "create.createdToast", { name: skill.name }));
    onClose();
    // A flagged skill cannot be linked, so there is nothing to suggest.
    router.push(skillHref(skill.id, "config", { suggestAgents: !isFlagged(skill) }));
  };

  const tabs = ADD_SKILL_TABS.map((key) => ({ key, label: t(`add.tabs.${key}`) }));
  const idle = isImport ? t("add.import") : t("create.create");
  const busy = isImport ? t("add.importing") : t("create.creating");

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("add.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon={isImport ? "Upload" : "Plus"}
            onClick={submit}
            disabled={!showForm || create.isPending || draft.checking}
          >
            {create.isPending ? busy : draft.checking && showForm ? t("safety.checking") : idle}
          </Button>
        </div>
      }
    >
      <Tabs tabs={tabs} value={tab} onChange={switchTab} pad="0 24px" />
      <div style={s.body}>
        {isImport && !loaded && tab === "file" && (
          <ImportFilePane onLoaded={(values, file) => fill(values, t("add.file.loaded", { file }))} />
        )}
        {isImport && !loaded && tab === "url" && (
          <ImportUrlPane onLoaded={(values, url) => fill(values, t("add.url.loaded", { url }))} />
        )}
        {isImport && loaded && (
          <div style={s.loaded}>
            <span className="mono" style={s.loadedLabel}>
              {loaded.label}
            </span>
            <Button kind="ghost" size="sm" onClick={() => setLoaded(null)}>
              {t(tab === "file" ? "add.file.another" : "add.url.another")}
            </Button>
          </div>
        )}
        {showForm && (
          <>
            <SkillFormFields
              values={form}
              errors={shownErrors}
              onChange={setField}
              bodyRows={10}
              bodyFlagged={draft.safety?.status === "flagged"}
            />
            <DraftSafetyNotes draft={draft} body={form.body} edited />
            {isImport && <p style={s.importNote}>{t("add.importNote")}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
