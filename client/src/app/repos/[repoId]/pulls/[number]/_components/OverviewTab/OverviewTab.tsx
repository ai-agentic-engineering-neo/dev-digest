"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  /** L03 — derived PR intent (summary text); null until a review run has
   *  computed one. */
  intent?: string | null;
  /** Revision 2 (specs/05-intent-layer.md) — structured declared scope,
   *  alongside the free-text summary above. */
  intentInScope?: string[] | null;
  intentOutOfScope?: string[] | null;
  /** Deterministic (never model-judged) gaps in the signals available —
   *  rendered as a "Limited context" note when non-empty. */
  intentContextGaps?: string[] | null;
  intentSignals?: string[] | null;
}

export function OverviewTab({
  prBody,
  intent,
  intentInScope,
  intentOutOfScope,
  intentContextGaps,
  intentSignals,
}: OverviewTabProps) {
  return (
    <>
      <section>
        <SectionLabel icon="Target">Intent</SectionLabel>
        {intent ? (
          <div style={s.descriptionBox}>
            <div style={s.intentSummary}>“{intent}”</div>
            <div style={s.scopeColumns}>
              <div>
                <div style={s.scopeHeading}>✓ IN SCOPE</div>
                {intentInScope && intentInScope.length > 0 ? (
                  <ul style={s.scopeList}>
                    {intentInScope.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={s.scopeListEmpty}>Nothing stated</div>
                )}
              </div>
              <div>
                <div style={s.scopeHeading}>✗ OUT OF SCOPE</div>
                {intentOutOfScope && intentOutOfScope.length > 0 ? (
                  <ul style={s.scopeList}>
                    {intentOutOfScope.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={s.scopeListEmpty}>Nothing stated</div>
                )}
              </div>
            </div>
            {intentContextGaps && intentContextGaps.length > 0 && (
              <div style={s.contextGapsNote}>
                ⚠ Limited context: {intentContextGaps.join("; ")}
              </div>
            )}
            {intentSignals && intentSignals.length > 0 && (
              <div style={s.intentSignals}>Derived from: {intentSignals.join(", ")}</div>
            )}
          </div>
        ) : (
          <div style={s.intentEmpty}>
            Not yet analyzed — intent is computed on the next review run.
          </div>
        )}
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
