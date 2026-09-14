/* IntentCard — L03 Intent layer (specs/05-intent-layer.md revision 2). Own
   section on the Overview tab: summary quote, ✓ IN SCOPE / ✗ OUT OF SCOPE
   lists, a "Limited context" note when context_gaps is non-empty, and a
   manual Recalculate action (POST /pulls/:id/intent/recalculate) for a fresh
   read without running a full review. Self-fetching (useIntent shares
   usePullDetail's cache entry, so this costs no extra request) rather than
   prop-drilled from PrDetailView. */
"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { useIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const { data: intent } = useIntent(prId);
  const recalculate = useRecalculateIntent(prId);

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={recalculate.isPending}
            disabled={!prId}
            onClick={() => recalculate.mutate()}
          >
            Recalculate
          </Button>
        }
      >
        Intent
      </SectionLabel>
      {intent?.summary ? (
        <div style={s.descriptionBox}>
          <div style={s.intentSummary}>“{intent.summary}”</div>
          <div style={s.scopeColumns}>
            <div>
              <div style={s.scopeHeading}>✓ IN SCOPE</div>
              {intent.inScope && intent.inScope.length > 0 ? (
                <ul style={s.scopeList}>
                  {intent.inScope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div style={s.scopeListEmpty}>Nothing stated</div>
              )}
            </div>
            <div>
              <div style={s.scopeHeading}>✗ OUT OF SCOPE</div>
              {intent.outOfScope && intent.outOfScope.length > 0 ? (
                <ul style={s.scopeList}>
                  {intent.outOfScope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div style={s.scopeListEmpty}>Nothing stated</div>
              )}
            </div>
          </div>
          {intent.contextGaps && intent.contextGaps.length > 0 && (
            <div style={s.contextGapsNote}>⚠ Limited context: {intent.contextGaps.join("; ")}</div>
          )}
          {intent.signals && intent.signals.length > 0 && (
            <div style={s.intentSignals}>Derived from: {intent.signals.join(", ")}</div>
          )}
        </div>
      ) : (
        <div style={s.intentEmpty}>
          Not yet analyzed — intent is computed on the next review run.
        </div>
      )}
    </section>
  );
}
