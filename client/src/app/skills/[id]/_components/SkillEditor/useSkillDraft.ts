"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { buildSavePatch, changedFields, isVersionedChange, type SkillDraft } from "./helpers";

/** Draft-over-cache form state of the skill editor (copied from the agent
 *  ConfigTab pattern): the draft holds only touched fields, everything else
 *  reads the live skill, so a change made elsewhere (e.g. the card's enabled
 *  switch) is never reverted. Lives in SkillEditor so every tab sees it. */
export function useSkillDraft(skill: Skill) {
  const [draft, setDraft] = React.useState<SkillDraft>({});
  const changes = changedFields(draft, skill);
  const dirty = Object.keys(changes).length > 0;

  const edit = React.useCallback(
    <K extends keyof SkillDraft>(key: K, value: NonNullable<SkillDraft[K]>) =>
      setDraft((d) => ({ ...d, [key]: value })),
    [],
  );
  const reset = React.useCallback(() => setDraft({}), []);

  return {
    /** The form values: live skill overlaid with the draft. */
    form: { ...skill, ...draft },
    dirty,
    /** Body or description changed → saving snapshots a new version. */
    versioned: isVersionedChange(changes),
    patch: buildSavePatch(changes, skill),
    edit,
    reset,
  };
}

export type SkillDraftState = ReturnType<typeof useSkillDraft>;
