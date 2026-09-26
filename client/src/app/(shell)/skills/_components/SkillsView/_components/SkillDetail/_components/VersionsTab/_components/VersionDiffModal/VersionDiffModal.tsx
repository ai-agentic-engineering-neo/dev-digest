"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillVersion } from "@/lib/hooks/skills";
import { lineDiff } from "@/lib/line-diff";
import { s } from "./styles";

/** Line-by-line diff of an older version's body against the CURRENT body. */
export function VersionDiffModal({
  skillId,
  version,
  currentBody,
  onClose,
}: {
  skillId: string;
  version: number;
  currentBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersion(skillId, version);
  const ops = data ? lineDiff(data.body, currentBody) : [];

  return (
    // Modal is not portaled (client/CLAUDE.md insight): stop clicks here from
    // reaching whatever renders this modal.
    <div onClick={(e) => e.stopPropagation()}>
      <Modal width={820} title={t("versions.diffModal.title", { version })} onClose={onClose}>
        {isLoading && <Skeleton height={220} />}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {data && (
          <div style={s.diffBody}>
            {ops.map((op, i) => (
              <div key={i} style={s.diffLine(op.type)}>
                <span style={s.diffMarker}>{op.type === "add" ? "+" : op.type === "remove" ? "−" : " "}</span>
                <span className="mono" style={s.diffText}>
                  {op.text.length > 0 ? op.text : " "}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
