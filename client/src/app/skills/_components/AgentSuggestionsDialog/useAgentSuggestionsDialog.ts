/* State + confirm logic of AgentSuggestionsDialog (UI-free). Nothing is written
   before confirm; confirm links every accepted agent in parallel (allSettled).
   All ok → success toast + close. Some failed → the dialog stays: linked rows are
   locked, the failed ones can be retried (their error toast is the global one).
   Nothing to show (no agent fits, or the request failed) → `onClose` once, so
   `?suggest=1` leaves the URL and a reload / Back does not bring the dialog back. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useLinkAgentSkill } from "@/lib/hooks/agents";
import { useAgentSuggestions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { agentsToLink, countOutcome, mergeOutcomes, type Decision, type LinkOutcome } from "./helpers";

export function useAgentSuggestionsDialog(skillId: string, onClose: () => void) {
  const t = useTranslations("skills");
  const toast = useToast();
  const suggestions = useAgentSuggestions(skillId);
  const link = useLinkAgentSkill();
  const [overrides, setOverrides] = React.useState<Record<string, Decision>>({});
  const [outcomes, setOutcomes] = React.useState<Record<string, LinkOutcome>>({});
  const [busy, setBusy] = React.useState(false);

  const list = suggestions.data ?? [];
  const nothingToShow = suggestions.isError || (suggestions.isSuccess && list.length === 0);
  // onClose is usually an inline arrow (new every render): keep the latest, call it once.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = React.useRef(false);
  React.useEffect(() => {
    if (nothingToShow && !closedRef.current) {
      closedRef.current = true;
      onCloseRef.current();
    }
  }, [nothingToShow]);
  const toLink = agentsToLink(list, overrides, outcomes);
  const hasFailures = countOutcome(outcomes, "failed") > 0;

  const decide = (agentId: string, decision: Decision) =>
    setOverrides((prev) => ({ ...prev, [agentId]: decision }));

  /** X / backdrop: ignored while links are in flight (their outcomes would be lost). */
  const dismiss = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    if (busy || toLink.length === 0) return;
    setBusy(true);
    const ids = toLink;
    const results = await Promise.allSettled(ids.map((agentId) => link.mutateAsync({ agentId, skillId })));
    const next = mergeOutcomes(outcomes, ids, results);
    // Also on full success: the rows lock (nothing left to link) until the URL drops suggest.
    setOutcomes(next);
    setBusy(false);
    if (results.every((r) => r.status === "fulfilled")) {
      toast.success(t("suggestions.linkedToast", { count: countOutcome(next, "linked") }));
      onClose();
    }
  };

  return { suggestions, list, overrides, outcomes, toLink, hasFailures, busy, decide, confirm, dismiss };
}
