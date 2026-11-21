/* "At a glance" strip on the Overview tab: one card per analysis (risk brief,
   intent, blast radius, description) with its headline numbers. The cards are
   also the section switcher — a tablist; the selected card's section renders
   below. Every hook here shares its query cache with the section components,
   so the strip costs no extra requests. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { HelpTip } from "@/components/help-tip";
import { useBrief } from "@/lib/hooks/brief";
import { useIntent } from "@/lib/hooks/intent";
import { useBlastRadius } from "@/lib/hooks/blast-radius";
import { activeReindexing, blastStats } from "../BlastRadiusCard";
import { descriptionPreview, wordCount, type OverviewSection } from "./helpers";
import { RISK_TONE } from "./constants";
import { s } from "./styles";

interface CardContent {
  value: React.ReactNode;
  sub: string;
  tone?: string;
  muted?: boolean;
}

export function AtAGlance({
  prId,
  prBody,
  section,
  onSelect,
}: {
  prId: string | null;
  prBody: string | null | undefined;
  section: OverviewSection;
  onSelect: (s: OverviewSection) => void;
}) {
  const t = useTranslations("overview");
  const tBrief = useTranslations("brief");
  const { data: brief } = useBrief(prId);
  const { data: intent } = useIntent(prId);
  const { data: blast, isLoading: blastLoading } = useBlastRadius(prId);

  const briefCard: CardContent = (() => {
    if (!brief || brief.status === "generating") {
      return { value: brief ? t("brief.generating") : "…", sub: "", muted: true };
    }
    if (!brief.brief) {
      return brief.status === "failed"
        ? { value: t("brief.failed"), sub: t("brief.failedSub"), tone: "var(--crit)" }
        : { value: t("brief.none"), sub: t("brief.noneSub"), muted: true };
    }
    const lvl = brief.brief.risk_level;
    const stale = brief.status === "earlier_state" || brief.status === "possibly_stale";
    return {
      value: tBrief(`risk.level.${lvl}`),
      tone: RISK_TONE[lvl],
      sub: stale
        ? t("brief.stale")
        : t("brief.risks", { risks: brief.brief.risks.length, focus: brief.brief.review_focus.length }),
    };
  })();

  const intentCard: CardContent = intent?.summary
    ? {
        value: <span style={s.clamp2}>{intent.summary}</span>,
        sub: t("intent.scope", { inScope: intent.inScope?.length ?? 0, outOfScope: intent.outOfScope?.length ?? 0 }),
      }
    : { value: t("intent.none"), sub: t("intent.noneSub"), muted: true };

  const blastCard: CardContent = (() => {
    if (!blast) return { value: blastLoading ? t("blast.loading") : "—", sub: "", muted: true };
    if (activeReindexing(blast)) return { value: t("blast.reindexing"), sub: "", muted: true };
    const st = blastStats(blast);
    if (st.symbols === 0 && st.callers === 0) return { value: t("blast.none"), sub: "", muted: true };
    return {
      value: t("blast.value", { count: st.callers }),
      sub: t("blast.sub", { symbols: st.symbols, files: st.callerFiles, tests: st.tests }),
    };
  })();

  const preview = descriptionPreview(prBody);
  const descCard: CardContent = preview
    ? { value: <span style={s.clamp2}>{preview}</span>, sub: t("desc.words", { count: wordCount(prBody) }) }
    : { value: t("desc.none"), sub: "", muted: true };

  const cards: { key: OverviewSection; icon: IconName; content: CardContent }[] = [
    { key: "brief", icon: "Sparkles", content: briefCard },
    { key: "intent", icon: "Target", content: intentCard },
    { key: "blast", icon: "Workflow", content: blastCard },
    { key: "description", icon: "MessageSquare", content: descCard },
  ];

  return (
    <div style={s.glanceWrap}>
      <div style={s.glanceHead}>
        <span style={s.glanceTitle}>{t("glance")}</span>
        <HelpTip topic="glance" />
      </div>
      <div role="tablist" aria-label={t("sections")} style={s.glance}>
        {cards.map(({ key, icon, content }) => {
          const I = Icon[icon];
          const active = section === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`overview-tab-${key}`}
              aria-selected={active}
              aria-controls={`overview-panel-${key}`}
              onClick={() => onSelect(key)}
              style={s.glanceCard(active)}
            >
              <span style={s.glanceLabel}>
                <I size={13} aria-hidden style={{ color: active ? "var(--accent-text)" : "var(--text-muted)" }} />
                {t(`card.${key}`)}
              </span>
              <span
                style={{
                  ...s.glanceValue,
                  color: content.tone ?? (content.muted ? "var(--text-muted)" : "var(--text-primary)"),
                  fontSize: typeof content.value === "string" && !content.muted ? 17 : 13.5,
                }}
              >
                {content.value}
              </span>
              {content.sub && <span style={s.glanceSub}>{content.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
