"use client";

import { useId, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OpenDiffTarget } from "@/components/diff-viewer";
import type { BriefRisk } from "@/lib/types";
import { BriefFileLink, briefRefHref } from "../../../BriefFileLink";
import { RISK_SEVERITY_COLOR } from "../../constants";
import { riskKindIcon } from "../../helpers";
import { s } from "./styles";

type RiskRef = BriefRisk["refs"][number];

/** One risk: compact header (kind icon, title, severity, first ref) that expands to explanation + all refs. */
export function RiskCard({
  risk,
  repoFullName,
  linkSha,
  onOpenFile,
}: {
  risk: BriefRisk;
  repoFullName: string | null;
  linkSha: string | null;
  onOpenFile: OpenDiffTarget;
}) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const KindIcon = riskKindIcon(risk.kind);
  const color = RISK_SEVERITY_COLOR[risk.severity];
  const [first] = risk.refs;

  const renderRef = (r: RiskRef) => (
    <BriefFileLink
      key={r.ref}
      path={r.path}
      line={r.start_line}
      endLine={r.end_line}
      inDiff={r.in_diff}
      repoFullName={repoFullName}
      linkSha={linkSha}
      onOpenFile={onOpenFile}
      label={r.ref}
    />
  );

  const openFirstRef = (e: MouseEvent<HTMLLIElement>) => {
    if (e.target instanceof Element && e.target.closest("button, a")) return;
    if (!first) return;
    if (first.in_diff) {
      onOpenFile(first.path, first.start_line === null ? null : { start: first.start_line, end: first.end_line ?? first.start_line });
      return;
    }
    const href = briefRefHref(first.path, first.start_line, repoFullName, linkSha);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <li style={s.item} onClick={openFirstRef}>
      <div style={s.head}>
        <KindIcon size={14} aria-hidden style={{ ...s.kindIcon, color }} />
        <span style={s.title}>{risk.title}</span>
        <span style={{ ...s.severity, color }}>{t(`risk.severity.${risk.severity}`)}</span>
        {!expanded && first && renderRef(first)}
        {!expanded && risk.refs.length > 1 && (
          <span style={s.more}>{t("risk.moreRefs", { count: risk.refs.length - 1 })}</span>
        )}
        <span style={s.spacer} />
        <button
          type="button"
          style={s.toggle}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={t(expanded ? "risk.collapse" : "risk.expand", { title: risk.title })}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon.ChevronDown size={16} aria-hidden style={expanded ? { ...s.chevron, ...s.chevronOpen } : s.chevron} />
        </button>
      </div>
      {expanded && (
        <div id={detailsId} style={s.details}>
          {risk.explanation !== "" && <p style={s.explanation}>{risk.explanation}</p>}
          {risk.refs.length > 0 && <div style={s.refs}>{risk.refs.map(renderRef)}</div>}
        </div>
      )}
    </li>
  );
}
