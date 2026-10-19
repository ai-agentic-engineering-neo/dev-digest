/* SkillsBreakdown — which skills went into the prompt, in order, with the
   tokens each one added (L02). Rendered under the Skills prompt block. */
"use client";

import { useTranslations } from "next-intl";
import type { PromptAssembly } from "@devdigest/shared";
import { formatTokenCount } from "@/lib/format-cost";
import { s } from "./styles";

type SkillDetail = NonNullable<PromptAssembly["skills_detail"]>[number];

export function SkillsBreakdown({ skills }: { skills: SkillDetail[] }) {
  const t = useTranslations("runs");
  return (
    <ol style={s.list} aria-label={t("trace.prompt.skillsDetail")}>
      {skills.map((sk) => (
        <li key={sk.id} style={s.item}>
          <span className="mono">{sk.name}</span>
          <span className="mono" style={s.muted}>
            {t("trace.prompt.skillVersion", { version: sk.version })}
          </span>
          <span className="mono" style={s.tokens}>
            {t("trace.prompt.tokens", { count: formatTokenCount(sk.tokens) })}
          </span>
        </li>
      ))}
    </ol>
  );
}
