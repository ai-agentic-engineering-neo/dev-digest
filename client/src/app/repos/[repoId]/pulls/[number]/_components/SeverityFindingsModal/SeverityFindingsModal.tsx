/* SeverityFindingsModal — brief list (title · file:line · confidence) of one
   severity's findings within a single review run, opened from the ⓘ button on
   a SeverityCounters pill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ConfidenceNum, Icon, Modal, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { s } from "./styles";

function location(f: FindingRecord): string {
  return f.end_line && f.end_line !== f.start_line
    ? `${f.file}:${f.start_line}–${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

export function SeverityFindingsModal({
  severity,
  findings,
  agentName,
  onClose,
  onShowOnly,
}: {
  severity: Severity;
  /** All findings of the run — filtered to `severity` here. */
  findings: FindingRecord[];
  agentName?: string | null;
  onClose: () => void;
  onShowOnly: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const items = React.useMemo(() => findings.filter((f) => f.severity === severity), [findings, severity]);
  const sev = SEV[severity];
  const SevIcon = Icon[sev.icon];

  // The kit Modal has no Escape handling — add it here.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <Modal
      width={640}
      title={t("panel.severityModalTitle", { count: items.length, severity })}
      subtitle={agentName ?? undefined}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("panel.close")}
          </Button>
          <Button kind="primary" size="sm" icon="Filter" onClick={() => onShowOnly(severity)}>
            {t("panel.showOnlyThese")}
          </Button>
        </div>
      }
    >
      <ul style={s.list}>
        {items.map((f) => (
          <li key={f.id} style={s.row}>
            <SevIcon size={15} style={{ color: sev.c, marginTop: 2, flexShrink: 0 }} aria-hidden />
            <div style={s.body}>
              <span style={s.title}>{f.title}</span>
              <span style={s.meta}>
                <span className="mono" style={s.location}>
                  {location(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
