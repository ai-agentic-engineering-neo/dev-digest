/* DocPreviewDrawer — read-only preview of one repo document: path, type,
   usage, token count, an Attached/Attach toggle (when the caller can attach)
   and the rendered markdown. Markdown renders without raw HTML, so a repo
   document can't run script in the studio. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Icon, Markdown, Skeleton, ErrorState } from "@devdigest/ui";
import { useContextDocument } from "@/lib/hooks/context";
import { formatTokenCount } from "@/lib/format";
import { DocTypeBadge } from "./DocTypeBadge";

export function DocPreviewDrawer({
  repoId,
  path,
  attached,
  inheritedFrom,
  onToggle,
  onClose,
}: {
  repoId: string;
  path: string;
  attached?: boolean;
  inheritedFrom?: string | null;
  onToggle?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data: doc, isLoading, isError, refetch } = useContextDocument(repoId, path);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Drawer
      width={640}
      onClose={onClose}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Icon.FileText size={16} style={{ color: "var(--accent)" }} />
          <span className="mono" style={{ fontSize: 15 }}>
            {path}
          </span>
        </span>
      }
      subtitle={
        doc ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            <DocTypeBadge type={doc.type} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <Icon.Cpu size={13} />
              {t("usedBy", { agents: doc.used_by.agents, skills: doc.used_by.skills })}
            </span>
            <span className="mono" style={{ fontSize: 12.5 }}>
              {t("tokens", { tokens: formatTokenCount(doc.tokens) })}
            </span>
          </span>
        ) : undefined
      }
    >
      {(onToggle || inheritedFrom) && (
        <div style={{ marginBottom: 16 }}>
          {inheritedFrom ? (
            <Button kind="secondary" size="sm" icon="Check" disabled>
              {t("drawer.inherited", { skill: inheritedFrom })}
            </Button>
          ) : (
            <Button kind={attached ? "secondary" : "primary"} size="sm" icon={attached ? "Check" : "Plus"} onClick={onToggle}>
              {attached ? t("drawer.attached") : t("drawer.attach")}
            </Button>
          )}
        </div>
      )}
      {isLoading ? (
        <Skeleton height={240} />
      ) : isError || !doc ? (
        <ErrorState title={t("previewError")} onRetry={() => void refetch()} />
      ) : (
        <div
          className="pc-doc"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            padding: "20px 24px",
            fontSize: 14,
          }}
        >
          <Markdown>{doc.content}</Markdown>
        </div>
      )}
    </Drawer>
  );
}
