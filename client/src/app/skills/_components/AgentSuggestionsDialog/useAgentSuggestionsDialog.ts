/* State of AgentSuggestionsDialog (UI-free). Each row acts on its own:
   - Accept links the skill to that agent at once (POST /agents/:id/skills);
     the row then shows "Linked". A failed link can be accepted again (its error
     toast is the global one).
   - Reject removes the row from the list; nothing is written.
   Once every row is decided (linked or rejected) the dialog closes itself, with
   a "Linked to N agents" toast when something was linked. Done / X / backdrop
   close it too, except while a link is in flight.
   Nothing to show (no agent fits, or the request failed) → `onClose` once, so
   `?suggest=1` leaves the URL and a reload / Back does not bring the dialog back. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useLinkAgentSkill } from "@/lib/hooks/agents";
import { useAgentSuggestions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { allDecided, countState, visibleSuggestions, type RowState } from "./helpers";

export function useAgentSuggestionsDialog(skillId: string, onClose: () => void) {
  const t = useTranslations("skills");
  const toast = useToast();
  const suggestions = useAgentSuggestions(skillId);
  const link = useLinkAgentSkill();
  const [rejected, setRejected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [states, setStates] = React.useState<Record<string, RowState>>({});

  const list = suggestions.data ?? [];
  const visible = visibleSuggestions(list, rejected);
  const busy = countState(states, "linking") > 0;
  const linkedCount = countState(states, "linked");
  const nothingToShow = suggestions.isError || (suggestions.isSuccess && list.length === 0);
  const finished = list.length > 0 && allDecided(list, rejected, states);

  // onClose is usually an inline arrow (new every render): keep the latest, call it once.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = React.useRef(false);
  const closeOnce = React.useCallback(
    (linked: number) => {
      if (closedRef.current) return;
      closedRef.current = true;
      if (linked > 0) toast.success(t("suggestions.linkedToast", { count: linked }));
      onCloseRef.current();
    },
    [t, toast],
  );

  React.useEffect(() => {
    if (nothingToShow) closeOnce(0);
  }, [nothingToShow, closeOnce]);
  // The last decision closes the dialog (all rejected, or the rest linked).
  React.useEffect(() => {
    if (finished) closeOnce(linkedCount);
  }, [finished, linkedCount, closeOnce]);

  const accept = async (agentId: string) => {
    const now = states[agentId];
    if (now === "linking" || now === "linked") return;
    setStates((prev) => ({ ...prev, [agentId]: "linking" }));
    try {
      await link.mutateAsync({ agentId, skillId });
      setStates((prev) => ({ ...prev, [agentId]: "linked" }));
    } catch {
      setStates((prev) => ({ ...prev, [agentId]: "failed" }));
    }
  };

  const reject = (agentId: string) => {
    if (states[agentId] === "linking" || states[agentId] === "linked") return;
    setRejected((prev) => new Set(prev).add(agentId));
  };

  /** Done / X / backdrop: ignored while a link is in flight (its outcome would be lost). */
  const dismiss = () => {
    if (!busy) closeOnce(linkedCount);
  };

  return { suggestions, visible, states, busy, accept, reject, dismiss };
}
