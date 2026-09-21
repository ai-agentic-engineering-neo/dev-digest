"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingStatus } from "@devdigest/shared";
import { STATUS_META } from "./constants";
import { s } from "./styles";

/**
 * AC-45: announces every status change (generating, generated, stale,
 * degraded, failed, …) to assistive technology. This banner stays mounted for
 * the whole "loaded" lifetime of the page, so a status TRANSITION (not just
 * initial mount) updates this live region's text and gets announced.
 */
export function StatusBanner({
  status,
  reason,
}: {
  status: OnboardingStatus;
  reason?: string | null;
}) {
  const t = useTranslations("onboarding");
  const meta = STATUS_META[status];
  const I = Icon[meta.icon];
  return (
    <div style={s.banner(meta.color, meta.bg)} role="status" aria-live="polite">
      <I size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        {t(`status.${status}`)}
        {reason ? ` — ${reason}` : ""}
      </span>
    </div>
  );
}
