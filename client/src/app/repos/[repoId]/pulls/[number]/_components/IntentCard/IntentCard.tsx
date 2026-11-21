/* IntentCard — L03 Intent layer (specs/05-intent-layer.md revision 2). Own
   section on the Overview tab: the summary as a lead paragraph, IN SCOPE /
   OUT OF SCOPE side by side (long lists collapse), a "Limited context"
   callout when context_gaps is non-empty, the signals it was derived from as
   chips, and a manual Recalculate action (POST /pulls/:id/intent/recalculate)
   for a fresh read without running a full review. Self-fetching (useIntent
   shares usePullDetail's cache entry, so this costs no extra request) rather
   than prop-drilled from PrDetailView. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon, type IconName } from "@devdigest/ui";
import { useIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { HelpTip } from "@/components/help-tip";
import { s } from "./styles";

/** Items shown per scope list before "Show all". */
const SCOPE_PREVIEW = 6;

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("intent");
  const { data: intent } = useIntent(prId);
  const recalculate = useRecalculateIntent(prId);

  return (
    <section>
      <SectionLabel
        icon="Target"
        info={<HelpTip topic="intent" />}
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={recalculate.isPending}
            disabled={!prId}
            onClick={() => recalculate.mutate()}
          >
            {t("recalculate")}
          </Button>
        }
      >
        {t("title")}
      </SectionLabel>
      {intent?.summary ? (
        <div style={s.card}>
          <p style={s.summary}>{intent.summary}</p>

          <div style={s.scopeColumns}>
            <ScopeList
              title={t("inScope")}
              icon="CheckCircle"
              tone="var(--ok)"
              bg="var(--ok-bg)"
              items={intent.inScope ?? []}
            />
            <ScopeList
              title={t("outOfScope")}
              icon="Slash"
              tone="var(--text-muted)"
              bg="var(--bg-hover)"
              items={intent.outOfScope ?? []}
            />
          </div>

          {intent.contextGaps && intent.contextGaps.length > 0 && (
            <div style={s.gaps} role="note">
              <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} aria-hidden />
              <div>
                <div style={s.gapsTitle}>{t("limitedContext")}</div>
                <div style={s.gapsBody}>{t("limitedContextBody")}</div>
                <ul style={s.gapsList}>
                  {intent.contextGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {intent.signals && intent.signals.length > 0 && (
            <div style={s.signals}>
              <span style={s.signalsLabel}>{t("derivedFrom")}</span>
              {intent.signals.map((sig) => (
                <span key={sig} style={s.signalChip}>
                  {sig}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={s.intentEmpty}>{t("empty")}</div>
      )}
    </section>
  );
}

function ScopeList({
  title,
  icon,
  tone,
  bg,
  items,
}: {
  title: string;
  icon: IconName;
  tone: string;
  bg: string;
  items: string[];
}) {
  const t = useTranslations("intent");
  const [all, setAll] = useState(false);
  const I = Icon[icon];
  const shown = all ? items : items.slice(0, SCOPE_PREVIEW);
  return (
    <div style={s.scopePanel}>
      <div style={s.scopeHeading}>
        <span style={s.scopeIcon(tone, bg)} aria-hidden>
          <I size={12} />
        </span>
        <span>{title}</span>
        <span style={s.scopeCount}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={s.scopeListEmpty}>{t("nothingStated")}</div>
      ) : (
        <ul style={s.scopeList}>
          {shown.map((item, i) => (
            <li key={i} style={s.scopeItem}>
              <span style={s.bullet(tone)} aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length > SCOPE_PREVIEW && (
        <button type="button" style={s.moreBtn} onClick={() => setAll((v) => !v)}>
          {all ? t("showLess") : t("showAll", { count: items.length })}
        </button>
      )}
    </div>
  );
}
