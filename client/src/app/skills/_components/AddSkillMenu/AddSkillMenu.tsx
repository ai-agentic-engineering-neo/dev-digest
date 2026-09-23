/* AddSkillMenu — the "Add Skill" dropdown and the flows it opens: create from
   scratch, import from file (.md / .zip, read as base64 in the browser), import
   from URL, community search. Every import ends in ImportPreviewModal; nothing
   is saved until the user confirms there. The new skill's editor opens via
   onOpen when given (the skill editor passes its unsaved-draft-guarded open),
   else the modals navigate themselves. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useImportPreview } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { CommunitySkillsDrawer } from "../CommunitySkillsDrawer";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportPreviewModal } from "../ImportPreviewModal";
import { ImportUrlModal } from "../ImportUrlModal";
import { IMPORT_ACCEPT, MAX_IMPORT_BYTES } from "./constants";
import { readFileAsBase64 } from "./helpers";

type Mode = "create" | "url" | "community" | null;

export function AddSkillMenu({ onOpen }: { onOpen?: (id: string) => void } = {}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const filePreview = useImportPreview();
  const [mode, setMode] = React.useState<Mode>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);

  const showPreview = (p: SkillImportPreview) => {
    setMode(null);
    setPreview(p);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(t("menu.fileTooLarge", { mb: MAX_IMPORT_BYTES / 1_000_000 }));
      return;
    }
    let content_base64: string;
    try {
      content_base64 = await readFileAsBase64(file);
    } catch {
      toast.error(t("menu.fileReadError"));
      return;
    }
    filePreview.mutate(
      { kind: "file", filename: file.name, content_base64 },
      {
        onSuccess: showPreview,
        onError: (err) => toast.error(t("menu.previewFailed", { message: err.message })),
      },
    );
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        data-testid="skill-import-file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Dropdown
        width={260}
        align="right"
        trigger={
          <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown" loading={filePreview.isPending}>
            {t("menu.add")}
          </Button>
        }
        items={[
          { label: t("menu.create"), icon: "Edit", onClick: () => setMode("create") },
          { divider: true },
          { label: t("menu.file"), icon: "Upload", onClick: () => fileRef.current?.click() },
          { label: t("menu.url"), icon: "Globe", onClick: () => setMode("url") },
          { label: t("menu.community"), icon: "Users", onClick: () => setMode("community") },
        ]}
      />
      {mode === "create" && <CreateSkillModal onClose={() => setMode(null)} onCreated={onOpen} />}
      {mode === "url" && <ImportUrlModal onClose={() => setMode(null)} onPreview={showPreview} />}
      {mode === "community" && <CommunitySkillsDrawer onClose={() => setMode(null)} onPreview={showPreview} />}
      {preview && <ImportPreviewModal preview={preview} onClose={() => setPreview(null)} onCreated={onOpen} />}
    </>
  );
}
