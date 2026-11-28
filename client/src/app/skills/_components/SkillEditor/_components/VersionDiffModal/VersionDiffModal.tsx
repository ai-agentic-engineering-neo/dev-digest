/* VersionDiffModal — line diff of an older skill version against the current
   body (red = only in the old version, green = only in current). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersion } from "@/lib/hooks/skills";
import { diffLines } from "./helpers";

const ROW: Record<"same" | "add" | "del", React.CSSProperties> = {
  same: { color: "var(--text-secondary)" },
  add: { background: "var(--code-add)", color: "var(--code-add-text)" },
  del: { background: "var(--code-del)", color: "var(--code-del-text)" },
};
const SIGN = { same: " ", add: "+", del: "-" } as const;

export function VersionDiffModal({ skill, version, onClose }: { skill: Skill; version: number; onClose: () => void }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersion(skill.id, version);
  const ops = data?.body != null ? diffLines(data.body, skill.body) : [];
  const changed = ops.some((o) => o.kind !== "same");

  return (
    <Modal
      width={900}
      title={t("versions.diffTitle", { from: version, to: skill.version })}
      onClose={onClose}
      footer={
        <Button kind="secondary" onClick={onClose}>
          {t("versions.close")}
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton height={200} />
      ) : isError || !data ? (
        <ErrorState title={t("versions.loadError")} onRetry={() => refetch()} />
      ) : !changed ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("versions.diffSame")}</div>
      ) : (
        <pre
          className="mono"
          data-testid="skill-version-diff"
          style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, maxHeight: "60vh", overflow: "auto" }}
        >
          {ops.map((o, i) => (
            <div key={i} data-kind={o.kind} style={{ ...ROW[o.kind], padding: "0 8px", whiteSpace: "pre-wrap" }}>
              {SIGN[o.kind]} {o.text}
            </div>
          ))}
        </pre>
      )}
    </Modal>
  );
}
