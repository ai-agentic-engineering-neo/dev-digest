/* ContextTab — "Project context to use" for a skill (SPEC-01): the shared attach
   panel bound to this skill. Agents using the skill inherit the documents; a
   change does not create a skill version. */
"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-attach-panel";

export function ContextTab({ skill }: { skill: Skill }) {
  return <ContextAttachPanel owner={{ kind: "skill", id: skill.id, name: skill.name }} />;
}
