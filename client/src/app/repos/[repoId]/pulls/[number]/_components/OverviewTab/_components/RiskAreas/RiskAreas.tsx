"use client";

import { useTranslations } from "next-intl";
import type { BriefRisk } from "@/lib/types";
import { BriefFileLink } from "../BriefFileLink";
import { RISK_KIND_ICON, RISK_KIND_ICON_FALLBACK, SEVERITY_ICON } from "./constants";
import { s } from "./styles";

/** "Risk areas" block of the brief: each risk with severity (icon + text), plain-text explanation and grounded file refs. */
export function RiskAreas({
  risks,
  repoFullName,
  linkSha,
  onOpenFile,
}: {
  risks: BriefRisk[];
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: (path: string) => void;
}) {
  const t = useTranslations("brief");

  return (
    <section style={s.root}>
      <h3 style={s.heading}>{t("block.risks")}</h3>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => {
            const KindIcon = RISK_KIND_ICON[risk.kind] ?? RISK_KIND_ICON_FALLBACK;
            const sev = SEVERITY_ICON[risk.severity];
            const SevIcon = sev.icon;
            return (
              <li key={`${i}:${risk.title}`} style={s.item}>
                <div style={s.head}>
                  <KindIcon size={14} aria-hidden style={s.kindIcon} />
                  <span style={s.title}>{risk.title}</span>
                  <span style={{ ...s.severity, color: sev.color }}>
                    <SevIcon size={13} aria-hidden />
                    {t(`risk.severity.${risk.severity}`)}
                  </span>
                </div>
                <p style={s.explanation}>{risk.explanation}</p>
                {risk.refs.length > 0 && (
                  <div style={s.refs}>
                    {risk.refs.map((r) => (
                      <BriefFileLink
                        key={r.ref}
                        path={r.path}
                        line={r.start_line}
                        inDiff={r.in_diff}
                        repoFullName={repoFullName}
                        linkSha={linkSha}
                        onOpenFile={onOpenFile}
                        label={r.ref}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
