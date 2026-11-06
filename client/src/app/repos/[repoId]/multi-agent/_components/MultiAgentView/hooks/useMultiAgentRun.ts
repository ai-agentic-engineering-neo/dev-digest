import React from "react";
import { errorMessage } from "@/lib/error-message";
import { useRunReviewsParallel } from "@/lib/hooks/reviews";
import type { StartState, StartStates } from "../../../types";

interface Stored {
  prId: string | null;
  states: StartStates;
}

const EMPTY: StartStates = {};

/** Starts one review per agent in parallel and tracks each start per PR. */
export function useMultiAgentRun(prId: string | null): {
  startStates: StartStates;
  start: (agentIds: string[]) => Promise<void>;
  isStarting: boolean;
} {
  const [stored, setStored] = React.useState<Stored>({ prId, states: EMPTY });
  const mutation = useRunReviewsParallel(prId);
  const { mutateAsync } = mutation;

  /**
   * Applies `patch` to the states of `forPr`. `reset` (the synchronous "pending" write) replaces states
   * stored for another PR; the post-await write must NOT — if the user switched PR and started there
   * meanwhile, a late result for the old PR would otherwise wipe the new PR's start states.
   */
  const merge = (forPr: string, patch: Record<string, StartState>, reset: boolean) =>
    setStored((prev) => {
      if (prev.prId === forPr) return { prId: forPr, states: { ...prev.states, ...patch } };
      return reset ? { prId: forPr, states: patch } : prev;
    });

  const start = async (agentIds: string[]): Promise<void> => {
    if (!prId || agentIds.length === 0) return;
    const forPr = prId;
    merge(
      forPr,
      Object.fromEntries(agentIds.map((id): [string, StartState] => [id, { status: "pending" }])),
      true,
    );
    let patch: Record<string, StartState>;
    try {
      const results = await mutateAsync(agentIds);
      patch = Object.fromEntries(
        results.map((r): [string, StartState] => [
          r.agent_id,
          r.ok ? { status: "started", run_id: r.run_id } : { status: "failed", error: r.error },
        ]),
      );
    } catch (err) {
      // Per-agent failures resolve (allSettled); a rejection here is unexpected. Callers fire-and-forget
      // (`void start(...)`), so swallow it and mark every agent failed — otherwise they stay "pending"
      // and Run stays disabled forever. The global MutationCache toast still reports it.
      const failed: StartState = { status: "failed", error: errorMessage(err) };
      patch = Object.fromEntries(agentIds.map((id): [string, StartState] => [id, failed]));
    }
    merge(forPr, patch, false);
  };

  const startStates = stored.prId === prId ? stored.states : EMPTY;
  const isStarting = Object.values(startStates).some((st) => st.status === "pending");
  return { startStates, start, isStarting };
}
