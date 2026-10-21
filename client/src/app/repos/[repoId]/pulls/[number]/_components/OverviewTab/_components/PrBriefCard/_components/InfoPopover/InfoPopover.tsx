/* InfoPopover — the (i) next to the brief title: agent, review time and the brief model.
   Opens on hover and on keyboard focus. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrBriefReview } from "@devdigest/shared";
import { infoParts } from "../../helpers";
import { s } from "./styles";

export function InfoPopover({ review, model }: { review: PrBriefReview | null; model: string }) {
  const t = useTranslations("brief.card");
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const parts = infoParts(review, model);
  return (
    <span style={s.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        style={s.btn}
        aria-label={t("infoLabel")}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Icon.Info size={14} />
      </button>
      {open && (
        <div role="tooltip" id={id} style={s.popover}>
          {parts.agent && <div>{t("info.agent", { agent: parts.agent })}</div>}
          {parts.reviewedAt && <div>{t("info.reviewedAt", { when: parts.reviewedAt })}</div>}
          <div>{t("info.writtenBy", { model: parts.model })}</div>
        </div>
      )}
    </span>
  );
}
