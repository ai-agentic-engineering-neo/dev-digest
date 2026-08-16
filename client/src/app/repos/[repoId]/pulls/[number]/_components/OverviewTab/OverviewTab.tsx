"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Review-focus click → switch to the Files tab and open/scroll that file
   *  (and line, when one survived) — plans/11-why-risk-brief.md §7 (Q7). */
  onFocusFile?: (file: string, line: number | null) => void;
}

export function OverviewTab({ prId, prBody, repoFullName, headSha, onFocusFile }: OverviewTabProps) {
  return (
    <>
      {/* specs/11-why-risk-brief.md Q8 — full-width, ABOVE the Intent/Blast
          grid, matching the design mockup's placement. No label is added to
          the verdict/score block within it (D1). */}
      <div style={s.briefSection}>
        <PrBriefCard prId={prId} repoFullName={repoFullName} onFocusFile={onFocusFile} />
      </div>

      <div style={s.overviewGrid}>
        <div style={s.overviewGridCell}>
          <IntentCard prId={prId} />
        </div>
        <div style={s.overviewGridCell}>
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
