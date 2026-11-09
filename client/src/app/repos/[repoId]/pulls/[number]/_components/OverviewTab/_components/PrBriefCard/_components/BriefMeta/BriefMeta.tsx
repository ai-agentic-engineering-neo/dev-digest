"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatCost } from "@/components/run-cost-badge";
import type { StoredBrief } from "@/lib/types";
import { shortSha } from "../../helpers";
import { s } from "./styles";

/** One meta line: model, tokens, cost, commit, generation time. */
export function BriefMeta({ brief }: { brief: StoredBrief }) {
  const t = useTranslations("brief");
  const format = useFormatter();
  const { usage } = brief;
  const cost = usage.cost_usd == null ? t("meta.costNa") : formatCost(usage.cost_usd);
  const tokens = t("meta.tokens", {
    tokensIn: usage.tokens_in.toLocaleString("en-US"),
    tokensOut: usage.tokens_out.toLocaleString("en-US"),
  });
  const when = format.dateTime(new Date(brief.generated_at), { dateStyle: "medium", timeStyle: "short" });

  return (
    <p style={s.root}>
      {[usage.model, tokens, cost, t("meta.generatedFor", { sha: shortSha(brief.head_sha) }), when].join(" · ")}
    </p>
  );
}
