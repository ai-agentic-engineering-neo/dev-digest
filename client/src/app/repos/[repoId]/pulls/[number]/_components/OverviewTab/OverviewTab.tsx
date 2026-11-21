"use client";

import React from "react";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
import { AtAGlance } from "./AtAGlance";
import { DescriptionCard } from "./DescriptionCard";
import { toSection, type OverviewSection } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Review-focus / "Show in diff" click → switch to the Files tab and
   *  open/scroll that file (and line, when one survived) —
   *  plans/11-why-risk-brief.md §7 (Q7). */
  onFocusFile?: (file: string, line: number | null) => void;
  /** Selected section (URL `?section=`); unknown/missing → the brief. */
  section?: string | null;
  onSectionChange?: (section: OverviewSection) => void;
}

/**
 * Overview tab: an "at a glance" strip — one card per analysis, which is also
 * the section switcher — and below it ONLY the selected section (Why + Risk
 * Brief, Intent, Blast Radius or Description), so the page no longer stacks
 * four long sections into one scroll. Without `onSectionChange` the selection
 * is local state (tests, embeds).
 */
export function OverviewTab({
  prId,
  prBody,
  repoFullName,
  headSha,
  onFocusFile,
  section: sectionProp,
  onSectionChange,
}: OverviewTabProps) {
  const [local, setLocal] = React.useState<OverviewSection>(toSection(sectionProp));
  const section = onSectionChange ? toSection(sectionProp) : local;
  const select = onSectionChange ?? setLocal;

  return (
    <>
      <AtAGlance prId={prId} prBody={prBody} section={section} onSelect={select} />

      <div role="tabpanel" id={`overview-panel-${section}`} aria-labelledby={`overview-tab-${section}`} style={s.panel}>
        {section === "brief" && <PrBriefCard prId={prId} repoFullName={repoFullName} onFocusFile={onFocusFile} />}
        {section === "intent" && <IntentCard prId={prId} />}
        {section === "blast" && (
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} onFocusFile={onFocusFile} />
        )}
        {section === "description" && <DescriptionCard body={prBody ?? ""} />}
      </div>
    </>
  );
}
