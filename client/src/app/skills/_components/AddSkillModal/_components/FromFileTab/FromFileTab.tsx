/* From file tab — pick a .md / .zip, see the core-file preview, then import it.
   Extraction is client-side; nothing is sent until "Import skill". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { DEFAULT_SKILL_TYPE } from "../../constants";
import type { AddSkillTabProps } from "../../types";
import { SkillTypeField } from "../SkillTypeField";
import { CorePreview } from "./CorePreview";
import { extractSkillFile, type ExtractedSkill } from "./extract";
import { FilePicker } from "./FilePicker";
import { buildImportPayload, resolveName } from "./helpers";

export function FromFileTab({ onAdded }: AddSkillTabProps) {
  const t = useTranslations("skillsImport");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [extracted, setExtracted] = React.useState<ExtractedSkill | null>(null);
  const [extractError, setExtractError] = React.useState<unknown>(null);
  const [reading, setReading] = React.useState(false);
  // Only the latest pick may write state (a slow archive must not clobber a newer file).
  const pickSeq = React.useRef(0);

  const handlePick = async (file: File) => {
    const seq = ++pickSeq.current;
    setReading(true);
    setExtractError(null);
    try {
      const result = await extractSkillFile(file);
      if (seq === pickSeq.current) setExtracted(result);
    } catch (e) {
      if (seq !== pickSeq.current) return;
      setExtracted(null);
      setExtractError(e);
    } finally {
      if (seq === pickSeq.current) setReading(false);
    }
  };

  const effectiveName = resolveName(name, extracted);
  const ready = !!extracted && effectiveName !== "" && !create.isPending && !reading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !extracted) return;
    try {
      onAdded(await create.mutateAsync(buildImportPayload(effectiveName, type, extracted)), "imported");
    } catch {
      // Surfaced by the global mutation error toast; keep the modal open to retry.
    }
  };

  return (
    <form onSubmit={submit} aria-label={t("tabs.file")}>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput
          value={name}
          onChange={setName}
          placeholder={t("file.namePlaceholder")}
          mono
          aria-label={t("file.nameLabel")}
        />
      </FormField>
      <SkillTypeField value={type} onChange={setType} />
      <FilePicker
        loadedFile={extracted?.sourceFile ?? null}
        ignored={extracted?.ignored ?? []}
        error={extractError}
        busy={reading}
        onPick={handlePick}
      />
      {extracted && <CorePreview extracted={extracted} name={effectiveName} />}
      <Button type="submit" kind="primary" full disabled={!ready} loading={create.isPending}>
        {create.isPending ? t("file.submitting") : t("file.submit")}
      </Button>
    </form>
  );
}
