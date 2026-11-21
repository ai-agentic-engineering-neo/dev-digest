/* The PR body rendered as GitHub-flavoured Markdown. Long bodies start
   collapsed behind a fade with a "Show full description" toggle; the toggle
   only appears when the content actually overflows. */
"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, SectionLabel } from "@devdigest/ui";
import { HelpTip } from "@/components/help-tip";
import { DESCRIPTION_COLLAPSED_HEIGHT } from "./constants";
import { s } from "./styles";

export function DescriptionCard({ body }: { body: string }) {
  const t = useTranslations("overview");
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > DESCRIPTION_COLLAPSED_HEIGHT + 40);
  }, [body]);

  const collapsed = overflows && !expanded;
  if (!body.trim()) {
    return (
      <section>
        <SectionLabel icon="MessageSquare" info={<HelpTip topic="description" />}>
          {t("description")}
        </SectionLabel>
        <div style={s.emptyBox}>{t("desc.none")}</div>
      </section>
    );
  }
  return (
    <section>
      <SectionLabel icon="MessageSquare" info={<HelpTip topic="description" />}>{t("description")}</SectionLabel>
      <div style={s.descriptionBox}>
        <div ref={ref} style={collapsed ? s.descriptionCollapsed : undefined}>
          <Markdown skipHtml breaks>
            {body}
          </Markdown>
        </div>
        {collapsed && <div style={s.fade} aria-hidden />}
        {overflows && (
          <button type="button" style={s.expandBtn} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Icon.ArrowUp size={13} aria-hidden /> : <Icon.ArrowDown size={13} aria-hidden />}
            {expanded ? t("showLess") : t("showMore")}
          </button>
        )}
      </div>
    </section>
  );
}
