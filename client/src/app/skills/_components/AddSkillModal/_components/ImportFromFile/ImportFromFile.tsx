/* ImportFromFile — upload a .md / .zip, show the parsed skill core, and save it
   (disabled) only after the user confirms. The server parses the upload; only
   SKILL.md is read from an archive and nothing is ever executed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SkillFields, isSkillValid, type SkillFieldValues } from "../../../SkillFields";
import { ACCEPT, MAX_IMPORT_BYTES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportFromFile({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const parse = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillFieldValues | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t("import.tooLarge", { name: file.name }));
      return;
    }
    let content_base64: string;
    try {
      content_base64 = await readFileAsBase64(file);
    } catch (e) {
      setError(String(e));
      return;
    }
    parse.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setPreview(p);
          setDraft({ name: p.name, description: p.description, type: p.type, body: p.body });
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const reset = () => {
    setPreview(null);
    setDraft(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const save = () => {
    if (!draft) return;
    create.mutate(
      { ...draft, name: draft.name.trim(), source: "imported_file", enabled: false },
      {
        onSuccess: (skill) => {
          toast.success(t("import.success", { name: skill.name }));
          onCreated(skill);
        },
      },
    );
  };

  if (!preview || !draft) {
    return (
      <div style={s.drop}>
        <Icon.Upload size={22} style={s.uploadIcon} />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          data-testid="skill-file-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button kind="secondary" icon="FileText" loading={parse.isPending} onClick={() => inputRef.current?.click()}>
          {parse.isPending ? t("import.parsing") : t("import.pick")}
        </Button>
        <div style={s.hint}>{t("import.hint")}</div>
        {error && <div style={s.error}>{error}</div>}
      </div>
    );
  }

  return (
    <>
      <div style={s.trust} role="alert">
        <Icon.AlertTriangle size={16} style={s.trustIcon} />
        <div>
          <div style={s.trustTitle}>{t("import.trustTitle")}</div>
          {t("import.trustBody")}
        </div>
      </div>

      <div style={s.filesLabel}>{t("import.files")}</div>
      <div style={s.files}>
        {preview.files.map((f) => (
          <div key={f.path} style={s.fileRow} title={f.reason ?? undefined}>
            <span className="mono" style={s.filePath(f.status === "skipped")}>
              {f.path}
            </span>
            {f.status === "used" ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)">{t("import.used")}</Badge>
            ) : (
              <Badge color="var(--text-muted)">{t("import.skipped")}</Badge>
            )}
          </div>
        ))}
      </div>

      <SkillFields value={draft} onChange={setDraft} bodyRows={12} bodyReadOnly showBodyHint={false} />

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!isSkillValid(draft) || create.isPending}>
          {create.isPending ? t("import.saving") : t("import.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={create.isPending}>
          {t("import.another")}
        </Button>
      </div>
    </>
  );
}
