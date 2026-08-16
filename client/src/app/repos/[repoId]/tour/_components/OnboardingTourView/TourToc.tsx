"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { sectionAnchorId } from "./helpers";
import { s } from "./styles";

/**
 * AC-40: a real navigation list of exactly the tour's five sections, each
 * linking to its section — `sections` is always the fixed five, in order
 * (AC-16), so this never paginates or filters.
 */
export function TourToc({ sections }: { sections: OnboardingSection[] }) {
  const t = useTranslations("onboarding");
  return (
    <nav style={s.toc} aria-label={t("toc.label")}>
      <div style={s.tocLabel}>{t("toc.label")}</div>
      <ol style={s.tocList}>
        {sections.map((section) => (
          <li key={section.kind}>
            <a href={`#${sectionAnchorId(section.kind)}`} style={s.tocLink}>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
