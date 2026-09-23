"use client";

/**
 * specs/16-agent-performance-dashboard.md clarification #5 — 1/7/30/90
 * presets plus a custom from–to picker (supersedes specs/14-export-to-ci.md
 * D12's "fixed preset set, no custom picker"). Shared by the Agent
 * Performance dashboard AND the per-agent Stats tab so "same period
 * selector" (plan step 9) is literal, not just described.
 *
 * No existing `DateRangePicker` in `vendor/ui` to reuse (verified) — built
 * local to this component per the plan's own note, then placed here (rather
 * than inside one route's `_components/`) because BOTH consumers land in
 * this same implementation pass, not a hypothetical future one.
 *
 * `t` must be a `next-intl` translator scoped to a namespace shaped like
 * `{ label, 1, 7, 30, 90, custom, from, to, apply }` — each caller supplies
 * its own (`agentPerformance.range` / `agents.stats.range`) so this
 * component carries no i18n namespace of its own.
 */
import React from "react";
import type { useTranslations } from "next-intl";
import { isCustomPerfRange, type PerfRangeValue } from "@/lib/hooks/agent-performance";
import { s } from "./styles";

const PRESETS = [1, 7, 30, 90] as const;

export function PerfRangePicker({
  value,
  onChange,
  t,
}: {
  value: PerfRangeValue;
  onChange: (v: PerfRangeValue) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const valueIsCustom = isCustomPerfRange(value);
  const [customOpen, setCustomOpen] = React.useState(valueIsCustom);
  const [from, setFrom] = React.useState(valueIsCustom ? value.from.slice(0, 10) : "");
  const [to, setTo] = React.useState(valueIsCustom ? value.to.slice(0, 10) : "");

  const applyCustom = () => {
    if (!from || !to) return;
    onChange({
      from: new Date(`${from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.row} role="radiogroup" aria-label={t("label")}>
        {PRESETS.map((days) => {
          const active = !customOpen && !valueIsCustom && value.days === days;
          return (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setCustomOpen(false);
                onChange({ days });
              }}
              style={s.btn(active)}
            >
              {t(String(days))}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={customOpen || valueIsCustom}
          onClick={() => setCustomOpen(true)}
          style={s.btn(customOpen || valueIsCustom)}
        >
          {t("custom")}
        </button>
      </div>
      {customOpen && (
        <div style={s.customRow}>
          <label style={s.customLabel}>
            {t("from")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={s.dateInput}
            />
          </label>
          <label style={s.customLabel}>
            {t("to")}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
          </label>
          <button type="button" onClick={applyCustom} disabled={!from || !to} style={s.applyBtn}>
            {t("apply")}
          </button>
        </div>
      )}
    </div>
  );
}
