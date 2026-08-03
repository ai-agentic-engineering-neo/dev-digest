/* ImportSkillDrawer — read a .md/.zip or fetch a URL, show the PARSED
   PREVIEW, and only on explicit confirm does anything reach the database.
   Both `POST /skills/import` and `POST /skills/import-url` are parse-only:
   neither touches the DB, which is the whole point of the two-endpoint split
   (see specs/02-review-agent-skills.md, "Trust model").

   An imported skill always lands `enabled: false` (server-side default) with a
   "needs vetting" badge on the rail — this drawer does not offer to skip that. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, FormField, SelectInput, TextInput } from "@devdigest/ui";
import { SKILL_NAME_RE, type SkillType } from "@devdigest/shared/contracts/knowledge";
import {
  useCreateSkill,
  useImportSkillFromUrlPreview,
  useImportSkillPreview,
} from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SKILL_TYPES } from "../../constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

const DEFAULT_TYPE: SkillType = "custom";

export function ImportSkillDrawer({
  initialMode = "file",
  onClose,
  onImported,
}: {
  initialMode?: "file" | "url";
  onClose: () => void;
  onImported: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const [mode, setMode] = React.useState<"file" | "url">(initialMode);
  const parseFile = useImportSkillPreview();
  const parseUrl = useImportSkillFromUrlPreview();
  const create = useCreateSkill();

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");
  const [readError, setReadError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [nameError, setNameError] = React.useState<string | null>(null);

  const parse = mode === "file" ? parseFile : parseUrl;
  const preview = parse.data;

  const switchMode = (next: "file" | "url") => {
    setMode(next);
    setReadError(null);
  };

  const pickFile = async (file: File) => {
    setReadError(null);
    setFileName(file.name);
    try {
      const content_b64 = await readFileAsBase64(file);
      const result = await parseFile.mutateAsync({ filename: file.name, content_b64 });
      setName(result.name);
      setNameError(null);
    } catch (e) {
      setReadError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  const fetchUrl = async () => {
    setReadError(null);
    try {
      const result = await parseUrl.mutateAsync(url);
      setName(result.name);
      setNameError(null);
    } catch (e) {
      setReadError(e instanceof ApiError ? e.message : t("url.fetchFailed"));
    }
  };

  const confirm = () => {
    if (!preview) return;
    if (!SKILL_NAME_RE.test(name) || name.length > 64) {
      setNameError(t("config.nameInvalid"));
      return;
    }
    setNameError(null);
    create.mutate(
      {
        name,
        description: preview.description,
        type,
        body: preview.body,
        source: "imported_url",
        enabled: false,
      },
      {
        onSuccess: (skill) => onImported(skill.id),
        onError: (e) => {
          if (e instanceof ApiError && (e.status === 409 || e.status === 422)) {
            setNameError(t("config.nameTaken", { name }));
          }
        },
      },
    );
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <Drawer
      width={560}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Upload"
            onClick={confirm}
            disabled={!preview || create.isPending}
          >
            {create.isPending ? t("import.importing") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "file"}
          style={s.tab(mode === "file")}
          onClick={() => switchMode("file")}
        >
          {t("drawer.tabs.file")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "url"}
          style={s.tab(mode === "url")}
          onClick={() => switchMode("url")}
        >
          {t("drawer.tabs.url")}
        </button>
      </div>

      {mode === "file" ? (
        <FormField label={t("import.fileLabel")} hint={t("import.fileHint")}>
          <div style={s.dropzone}>
            <input
              type="file"
              accept=".md,.markdown,.zip"
              aria-label={t("import.fileLabel")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
              }}
            />
            {parseFile.isPending && <div style={s.fileName}>{t("import.reading")}</div>}
            {fileName && !parseFile.isPending && <div style={s.fileName}>{fileName}</div>}
          </div>
        </FormField>
      ) : (
        <FormField label={t("url.label")} hint={t("url.hint")}>
          <TextInput
            value={url}
            onChange={setUrl}
            placeholder={t("url.placeholder")}
            suffix={
              <Button kind="secondary" size="sm" loading={parseUrl.isPending} onClick={fetchUrl} disabled={!url.trim()}>
                {parseUrl.isPending ? t("url.fetching") : t("url.fetch")}
              </Button>
            }
          />
        </FormField>
      )}

      {readError && (
        <div role="alert" style={s.error}>
          {readError}
        </div>
      )}

      {preview && (
        <>
          <div style={s.previewCard}>
            <div style={s.previewHead}>
              <span className="mono" style={s.previewName}>
                {preview.name}
              </span>
            </div>
            <div style={s.previewMeta}>
              {preview.source_path && t("import.sourcePath", { path: preview.source_path })}
              {preview.source_path && " · "}
              {t("import.ignoredEntries", { count: preview.ignored_entries })}
            </div>
            {preview.candidates && preview.candidates.length > 1 && (
              <div style={s.previewMeta}>
                {t("import.candidates", { paths: preview.candidates.join(", ") })}
              </div>
            )}
            <pre className="mono" style={s.previewBody}>
              {preview.body}
            </pre>
          </div>

          {preview.collides_with && (
            <div style={s.collides}>{t("import.collides", { name: preview.collides_with })}</div>
          )}

          <FormField label={t("config.name")} hint={t("config.nameHint")} required>
            <TextInput value={name} onChange={setName} mono />
            {nameError && (
              <div role="alert" style={s.error}>
                {nameError}
              </div>
            )}
          </FormField>

          <FormField label={t("config.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>

          <p style={s.notice}>{t("import.arrivesDisabled")}</p>
        </>
      )}
    </Drawer>
  );
}
