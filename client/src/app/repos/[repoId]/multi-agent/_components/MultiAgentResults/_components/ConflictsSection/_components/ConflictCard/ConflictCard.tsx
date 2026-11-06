"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Conflict, ConflictTake } from "@devdigest/shared";
import { AgentBadge } from "@/components/agent-badge";
import type { SelectedAgent } from "../../../../../../types";
import { SEVERITY_KEY } from "./constants";
import { s } from "./styles";

export interface ConflictCardProps {
  conflict: Conflict;
  agents: readonly SelectedAgent[];
}

function Verdict({ take }: { take: ConflictTake }) {
  const t = useTranslations("runs");
  if (take.verdict === "ignored") {
    return <span style={s.note}>{t("conflicts.didNotFlag")}</span>;
  }
  return (
    <span style={s.verdict}>
      <span style={s.dot(take.verdict)} aria-hidden />
      {t(`severity.${SEVERITY_KEY[take.verdict]}`)}
    </span>
  );
}

export function ConflictCard({ conflict, agents }: ConflictCardProps) {
  const t = useTranslations("runs");

  return (
    <li style={s.card}>
      <div style={s.cardHead}>
        <span style={s.location}>
          {conflict.file}:{conflict.line}
        </span>
        <span style={s.cardTitle}>{conflict.title}</span>
      </div>
      <ul style={s.takes}>
        {conflict.takes.map((take) => {
          const colorIndex = agents.find((a) => a.id === take.agent_id)?.colorIndex ?? 1;
          return (
            <li key={take.agent_id} style={s.take}>
              <span style={s.takeHead}>
                <AgentBadge colorIndex={colorIndex} size={20} />
                <span style={s.persona}>{take.persona}</span>
              </span>
              <Verdict take={take} />
              <span style={s.note}>{take.note || t("conflicts.noNote")}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export default ConflictCard;
