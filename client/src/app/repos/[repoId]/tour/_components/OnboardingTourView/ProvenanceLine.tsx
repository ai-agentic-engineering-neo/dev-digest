"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingProvenance } from "@devdigest/shared";
import { relativeTime } from "./helpers";
import { s } from "./styles";

/**
 * AC-30: present with every tour AND every skeleton — how many files were
 * indexed, how many excluded by the index bound, the index's status and
 * freshness, how many PRs informed the churn weighting, and (once generated)
 * when and by which model. Never the repository's raw total file count
 * (D1) — only what was actually indexed/excluded.
 */
export function ProvenanceLine({ provenance }: { provenance: OnboardingProvenance }) {
  const t = useTranslations("onboarding");
  const parts = [
    t("provenance.filesIndexed", { count: provenance.files_indexed }),
    t("provenance.filesExcluded", { count: provenance.files_excluded }),
    provenance.index_reason
      ? t("provenance.indexWithReason", { status: provenance.index_status, reason: provenance.index_reason })
      : t("provenance.index", { status: provenance.index_status }),
    t("provenance.updated", { when: relativeTime(provenance.index_updated_at) }),
    t("provenance.prsWeighted", { count: provenance.prs_weighted }),
  ];
  if (provenance.generated_at && provenance.model) {
    parts.push(
      t("provenance.generatedBy", { when: relativeTime(provenance.generated_at), model: provenance.model }),
    );
  }
  return <p style={s.provenance}>{parts.join(" · ")}</p>;
}
