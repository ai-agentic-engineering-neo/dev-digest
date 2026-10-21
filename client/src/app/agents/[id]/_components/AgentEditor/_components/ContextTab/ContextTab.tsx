/* ContextTab — Project context for an agent (SPEC-01): the shared attach panel
   bound to this agent. A changed set creates a new agent version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-attach-panel";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  return <ContextAttachPanel owner={{ kind: "agent", id: agent.id, name: agent.name }} footerNote={t("context.footerNote")} />;
}
