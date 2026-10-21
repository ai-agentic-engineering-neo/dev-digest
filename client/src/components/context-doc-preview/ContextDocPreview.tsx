/* ContextDocPreview — modal with the Markdown text of one document, read at the
   default-branch head. Markdown is rendered without raw HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Markdown, Modal, Skeleton } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/project-context";
import { ModifiedLocallyBadge } from "@/components/modified-locally-badge";
import { s } from "./styles";

export function ContextDocPreview({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const file = useContextFile(repoId, path);
  return (
    <Modal
      width={760}
      title={t("panel.previewTitle")}
      subtitle={
        <span style={s.subtitle}>
          <span className="mono">{path}</span>
          {file.data?.modified && <ModifiedLocallyBadge updatedAt={file.data.updated_at} />}
        </span>
      }
      onClose={onClose}
      footer={
        <Button kind="ghost" onClick={onClose}>
          {t("preview.close")}
        </Button>
      }
    >
      <div style={s.body} data-testid="context-doc-preview">
        {file.isLoading && <Skeleton height={160} />}
        {file.isError && <ErrorState body={t("page.previewError")} onRetry={() => void file.refetch()} />}
        {file.data && <Markdown>{file.data.text}</Markdown>}
      </div>
    </Modal>
  );
}
