/* DiffModal — unified line diff of an earlier skill version against the current body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { diffLines, diffStats } from "./helpers";
import { s } from "./styles";

const SIGN = { add: "+", del: "−", ctx: " " } as const;

export function DiffModal({
  version,
  current,
  oldBody,
  newBody,
  onClose,
}: {
  version: number;
  current: number;
  oldBody: string;
  newBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(oldBody, newBody), [oldBody, newBody]);
  const stats = lines ? diffStats(lines) : null;
  const identical = !!stats && stats.added === 0 && stats.removed === 0;

  return (
    <Modal
      width={820}
      title={t("versions.diffTitle", { version, current })}
      subtitle={stats ? t("versions.diffSubtitle", stats) : undefined}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("versions.close")}
          </Button>
        </div>
      }
    >
      {lines === null ? (
        <div style={s.message}>{t("versions.tooLarge")}</div>
      ) : identical ? (
        <div style={s.message}>{t("versions.noDifferences")}</div>
      ) : (
        <div className="mono" style={s.body} data-testid="diff-lines">
          {lines.map((l, i) => (
            <div key={i} style={s.row(l.kind)} data-kind={l.kind}>
              <span style={s.no}>{l.oldNo ?? ""}</span>
              <span style={s.no}>{l.newNo ?? ""}</span>
              <span style={s.sign(l.kind)}>{SIGN[l.kind]}</span>
              <span style={s.text}>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
