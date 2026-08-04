"use client";

import React from "react";
import { SectionLabel, Badge } from "@devdigest/ui";
import { s } from "./styles";
import type { IntentConfidence } from "@/lib/types";

interface OverviewTabProps {
  prBody: string | null | undefined;
  /** L03 — derived PR intent (summary text); null until a review run has
   *  computed one. */
  intent?: string | null;
  intentConfidence?: IntentConfidence | null;
  intentSignals?: string[] | null;
}

const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--stale)",
};

export function OverviewTab({ prBody, intent, intentConfidence, intentSignals }: OverviewTabProps) {
  return (
    <>
      <section>
        <SectionLabel
          icon="Target"
          right={
            intent && intentConfidence ? (
              <Badge dot bg="transparent" color={CONFIDENCE_COLOR[intentConfidence]}>
                {intentConfidence}
              </Badge>
            ) : undefined
          }
        >
          Intent
        </SectionLabel>
        {intent ? (
          <div style={s.descriptionBox}>
            <div>{intent}</div>
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
