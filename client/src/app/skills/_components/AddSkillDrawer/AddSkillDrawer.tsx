/* AddSkillDrawer — the import path, in two deliberate steps:
   1. pick a file (or a catalog entry) → the server returns a PREVIEW and stores
      nothing;
   2. confirm → the skill is created, DISABLED, with its source recorded.
   The preview is also where the skipped executables are listed: an archive can
   carry scripts, and the product's answer is to name them and leave them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Chip,
  Drawer,
  EmptyState,
  ErrorState,
  FormField,
  Icon,
  Skeleton,
  Tabs,
  TextInput,
} from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCommunitySkills, useImportPreview, useImportSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { fileToBase64 } from "./helpers";
import { LANGUAGE_FILTERS, MAX_UPLOAD_BYTES } from "./constants";
import { ImportPreview } from "./_components/ImportPreview";
import { s } from "./styles";

export function AddSkillDrawer({
  initialTab = "file",
  onClose,
  onImported,
}: {
  initialTab?: "file" | "community";
  onClose: () => void;
  onImported?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const [tab, setTab] = React.useState<string>(initialTab);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const [query, setQuery] = React.useState("");
  const [lang, setLang] = React.useState("any");
  const community = useCommunitySkills(query, lang);
  const previewMutation = useImportPreview();
  const commit = useImportSkill();

  const show = (p: SkillImportPreview) => {
    setPreview(p);
    setName(p.name);
    setDescription(p.description);
    setError(null);
  };

  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : t("drawer.importFailed"));

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("file.tooBig"));
      return;
    }
    try {
      const content_base64 = await fileToBase64(file);
      previewMutation.mutate(
        { filename: file.name, content_base64 },
        { onSuccess: show, onError: fail },
      );
    } catch (err) {
      fail(err);
    }
  };

  const onPickCommunity = (id: string) =>
    previewMutation.mutate({ community_id: id }, { onSuccess: show, onError: fail });

  const confirm = () => {
    if (!preview) return;
    commit.mutate(
      {
        name,
        description,
        type: preview.type,
        source: preview.source === "community" ? "community" : "imported_url",
        body: preview.body,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("importPreview.saved", { name: skill.name }));
          onImported?.(skill);
          onClose();
        },
        onError: fail,
      },
    );
  };

  const footer = preview ? (
    <>
      <Button kind="secondary" size="sm" onClick={() => setPreview(null)}>
        {t("drawer.back")}
      </Button>
      <Button kind="primary" size="sm" icon="Check" disabled={commit.isPending} onClick={confirm}>
        {commit.isPending ? t("drawer.saving") : t("drawer.confirm")}
      </Button>
    </>
  ) : (
    <Button kind="secondary" size="sm" onClick={onClose}>
      {t("drawer.cancel")}
    </Button>
  );

  return (
    <Drawer
      width={760}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.body}>
        {error && <div style={s.error}>{error}</div>}

        {preview ? (
          <ImportPreview
            preview={preview}
            name={name}
            description={description}
            onName={setName}
            onDescription={setDescription}
          />
        ) : (
          <>
            <Tabs
              tabs={[
                { key: "file", label: t("drawer.tabs.file"), icon: "Upload" },
                { key: "community", label: t("drawer.tabs.community"), icon: "Globe" },
              ]}
              value={tab}
              onChange={setTab}
              pad="0"
            />

            {tab === "file" && (
              <div style={s.section}>
                <FormField label={t("file.label")} hint={t("file.hint")}>
                  <input
                    type="file"
                    accept=".md,.markdown,.zip"
                    aria-label={t("file.label")}
                    onChange={(e) => void onPickFile(e.target.files?.[0])}
                    style={s.fileInput}
                  />
                </FormField>
                {previewMutation.isPending && (
                  <p style={s.muted}>{t("file.analyzing")}</p>
                )}
                {fileName && !previewMutation.isPending && (
                  <p style={s.muted} className="mono">
                    {fileName}
                  </p>
                )}
              </div>
            )}

            {tab === "community" && (
              <div style={s.section}>
                <p style={s.notice}>{t("community.bundledNotice")}</p>
                <TextInput
                  value={query}
                  onChange={setQuery}
                  placeholder={t("community.searchPlaceholder")}
                />
                <div style={s.chips}>
                  {LANGUAGE_FILTERS.map((l) => (
                    <Chip key={l} active={lang === l} onClick={() => setLang(l)}>
                      {l === "any" ? t("community.allLanguages") : l}
                    </Chip>
                  ))}
                </div>

                {community.isLoading && <Skeleton height={90} />}
                {community.isError && (
                  <ErrorState body={t("community.loadError")} onRetry={() => community.refetch()} />
                )}
                {community.data?.length === 0 && (
                  <EmptyState
                    icon="Search"
                    title={t("community.noMatch.title")}
                    body={t("community.noMatch.body")}
                  />
                )}
                {(community.data ?? []).map((c) => (
                  <div key={c.id} style={s.catalogRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.catalogHead}>
                        <span className="mono" style={s.catalogName}>
                          {c.name}
                        </span>
                        <Badge color="var(--warn)" icon="Star">
                          {c.stars.toLocaleString()}
                        </Badge>
                      </div>
                      <div style={s.muted}>{c.desc}</div>
                      <div style={s.catalogMeta}>
                        <span className="mono">{c.repo}</span>
                        <Badge color="var(--text-muted)">{c.lang}</Badge>
                      </div>
                    </div>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="Plus"
                      disabled={previewMutation.isPending}
                      onClick={() => onPickCommunity(c.id)}
                    >
                      {t("community.import")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
