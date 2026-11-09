"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BriefMissingInput, BriefTruncation } from "@/lib/types";
import { truncationParts } from "../../helpers";
import { s } from "./styles";

/** Notes under the brief: inputs that were unavailable and what was cut from the model input. */
export function BriefNotes({ missing, truncated }: { missing: BriefMissingInput[]; truncated: BriefTruncation }) {
  const t = useTranslations("brief");
  const parts = truncationParts(truncated);
  if (missing.length === 0 && parts.length === 0) return null;

  return (
    <div style={s.root}>
      {missing.length > 0 && (
        <div style={s.box}>
          <Icon.AlertTriangle size={14} aria-hidden style={s.icon} />
          <div>
            <p style={s.title}>{t("missing.title")}</p>
            <ul style={s.list}>
              {missing.map((m) => (
                <li key={m.input}>
                  {m.input === "intent" && t(`missing.intent.${m.reason}`)}
                  {m.input === "blast" && t("missing.blast", { reason: t(`missing.blastReason.${m.reason}`) })}
                  {m.input === "smart_diff_roles" && t("missing.smart_diff_roles")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {parts.length > 0 && (
        <p style={s.truncated}>
          {t("truncated.label", {
            parts: parts.map((p) => t(`truncated.${p.key}`, { count: p.count })).join(", "),
          })}
        </p>
      )}
    </div>
  );
}
