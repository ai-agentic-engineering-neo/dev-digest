/* DroppedCandidates — collapsed report of the model's candidates the evidence
   check threw away (rule · path · reason), so the gate is visible, not silent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { DroppedConvention } from "@devdigest/shared";
import { s } from "./styles";

export function DroppedCandidates({ dropped }: { dropped: readonly DroppedConvention[] }) {
  const t = useTranslations("conventions");
  const [open, setOpen] = React.useState(false);
  if (dropped.length === 0) return null;
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <section style={s.wrap}>
      <button type="button" style={s.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Chevron size={14} />
        {t("dropped.toggle", { count: dropped.length })}
      </button>
      {open && (
        <ul style={s.list}>
          {/* Dropped rows have no id and may repeat; the list is static, so the index is a stable key. */}
          {dropped.map((d, i) => (
            <li key={i} style={s.row}>
              <span style={s.rule}>{d.rule}</span>
              <span className="mono" style={s.path}>
                {d.path}
              </span>
              <span style={s.reason}>{t(`dropped.reason.${d.reason}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
