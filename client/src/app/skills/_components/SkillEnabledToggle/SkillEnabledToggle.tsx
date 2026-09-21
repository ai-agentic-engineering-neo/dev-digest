/* SkillEnabledToggle — the enable switch for a skill. The design-system Toggle has no
   `disabled` state, so a blocked (injection-flagged) skill gets an inert, dimmed switch
   that always reads "off" and explains why via its tooltip. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import { s } from "./styles";

export interface SkillEnabledToggleProps {
  on: boolean;
  onChange: (enabled: boolean) => void;
  /** Injection-flagged: cannot be enabled. */
  blocked?: boolean;
  size?: number;
  /** Tooltip while the switch is usable. */
  title?: string;
}

export function SkillEnabledToggle({ on, onChange, blocked = false, size = 14, title }: SkillEnabledToggleProps) {
  const t = useTranslations("skills");
  if (blocked) {
    return (
      <span aria-disabled="true" title={t("injection.toggleBlocked")} style={s.blocked} inert>
        <Toggle on={false} onChange={() => undefined} size={size} />
      </span>
    );
  }
  return (
    <span title={title}>
      <Toggle on={on} onChange={onChange} size={size} />
    </span>
  );
}
