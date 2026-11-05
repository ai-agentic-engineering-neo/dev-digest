/* DiffModal — line diff of an older version's body against the current body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { lineDiff } from "../../../../helpers";
import { s } from "./styles";

const PREFIX = { add: "+ ", del: "- ", same: "  " } as const;

export function DiffModal({
  fromVersion,
  fromBody,
  toVersion,
  toBody,
  onClose,
}: {
  fromVersion: number;
  fromBody: string;
  toVersion: number;
  toBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const lines = lineDiff(fromBody, toBody);
  const changed = lines.some((l) => l.kind !== "same");
  return (
    <Modal
      width={820}
      title={t("versions.diffTitle", { from: fromVersion, to: toVersion })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button onClick={onClose}>{t("versions.close")}</Button>
        </div>
      }
    >
      {changed ? (
        <pre className="mono" style={s.pre} data-testid="skill-diff">
          {lines.map((l, i) => (
            <span key={i} style={s.line(l.kind)}>
              {PREFIX[l.kind]}
              {l.text}
            </span>
          ))}
        </pre>
      ) : (
        <p style={s.empty}>{t("versions.noChanges")}</p>
      )}
    </Modal>
  );
}
