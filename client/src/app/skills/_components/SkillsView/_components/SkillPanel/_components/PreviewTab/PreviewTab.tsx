"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { SkillPreview } from "@/components/skill-preview";

export function PreviewTab({ skill, agentCount }: { skill: Skill; agentCount?: number }) {
  return <SkillPreview skill={skill} {...(agentCount !== undefined ? { agentCount } : {})} />;
}
