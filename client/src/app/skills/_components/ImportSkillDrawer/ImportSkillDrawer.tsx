/* ImportSkillDrawer — file/archive import that doubles as manual "create".
   Picking a .md/.zip pre-fills the (still editable) fields client-side; nothing
   is sent to the server until "Import skill" is clicked. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { BODY_ROWS, DEFAULT_SKILL_TYPE, DRAWER_WIDTH, SKILL_TYPES } from "./constants";
import { deriveNameFromBody, extractSkillFile } from "./extract";
import { FilePicker } from "./FilePicker";
import { s } from "./styles";

export interface ImportSkillDrawerProps {
  onClose: () => void;
  /** Called with the saved skill after a successful import/create. */
  onImported?: (skill: Skill) => void;
}

interface PickedFile {
  sourceFile: string;
  ignored: string[];
}

export function ImportSkillDrawer({ onClose, onImported }: ImportSkillDrawerProps) {
  const t = useTranslations("skills");
  const ti = useTranslations("skillsImport");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [picked, setPicked] = React.useState<PickedFile | null>(null);
  const [extractError, setExtractError] = React.useState<unknown>(null);
  const [reading, setReading] = React.useState(false);
  // Only the latest pick may write to the form (a slow archive must not clobber a newer file).
  const pickSeq = React.useRef(0);

  const handlePick = async (file: File) => {
    const seq = ++pickSeq.current;
    setReading(true);
    setExtractError(null);
    try {
      const extracted = await extractSkillFile(file);
      if (seq !== pickSeq.current) return;
      // Front-matter name wins; a heading-derived name only fills a still-empty field.
      setName((current) => extracted.name || (current.trim() ? current : extracted.headingName));
      setDescription((current) => extracted.description || current);
      setBody(extracted.body);
      setPicked({ sourceFile: extracted.sourceFile, ignored: extracted.ignored });
    } catch (e) {
      if (seq !== pickSeq.current) return;
      setPicked(null);
      setExtractError(e);
    } finally {
      if (seq === pickSeq.current) setReading(false);
    }
  };

  const effectiveName = name.trim() || deriveNameFromBody(body);
  const canSubmit = effectiveName !== "" && body.trim() !== "" && !create.isPending && !reading;

  const submit = async () => {
    if (!canSubmit) return;
    const source = picked ? "extracted" : "manual";
    try {
      const skill = await create.mutateAsync({
        name: effectiveName,
        ...(description.trim() ? { description: description.trim() } : {}),
        type,
        body,
        source,
      });
      toast.success(ti(source === "extracted" ? "toast.imported" : "toast.created", { name: skill.name }));
      onImported?.(skill);
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      // Failure is surfaced by the global mutation error toast; keep the drawer open to retry.
    }
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={ti("subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {ti("cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={!canSubmit} loading={create.isPending}>
            {create.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      <FilePicker
        loadedFile={picked?.sourceFile ?? null}
        ignored={picked?.ignored ?? []}
        error={extractError}
        busy={reading}
        onPick={handlePick}
      />
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")} required>
        <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} mono />
      </FormField>
      <FormField label={ti("fields.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={ti("fields.description")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={ti("fields.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")} required>
        <Textarea value={body} onChange={setBody} placeholder={t("file.bodyPlaceholder")} rows={BODY_ROWS} mono />
      </FormField>
    </Drawer>
  );
}
