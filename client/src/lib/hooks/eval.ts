/* hooks/eval.ts — React Query hooks for the Eval pipeline
   (specs/12-eval-pipeline.md, plans/12-eval-pipeline.md §8).

   Q3 (background run + client polling, no SSE): `useEvalRun`'s
   `refetchInterval` returns a poll interval ONLY while `status === 'running'`
   — copied from `hooks/onboarding.ts` / `hooks/brief.ts`'s identical
   `status === 'generating'` shape. AC-28 (opening a surface spends nothing):
   every GET here reads stored rows; nothing on a read path starts a
   provider call. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentDetail,
  EvalCaseInput,
  EvalCompare,
  EvalDashboard,
  EvalRunAllResult,
  EvalRunRecord,
  EvalRunResult,
} from "@devdigest/shared/contracts/eval-ci";
import type { EvalCase } from "@devdigest/shared/contracts/knowledge";

export const evalKeys = {
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  case: (caseId: string | null | undefined) => ["eval-case", caseId] as const,
  runs: (agentId: string | null | undefined) => ["eval-runs", agentId] as const,
  run: (runId: string | null | undefined) => ["eval-run", runId] as const,
  dashboard: () => ["eval-dashboard"] as const,
  agentDetail: (agentId: string | null | undefined) => ["eval-agent-detail", agentId] as const,
  compare: (a: string | null | undefined, b: string | null | undefined) =>
    ["eval-compare", a, b] as const,
};

// ---- Cases (AC-37 … AC-39, AC-46) -----------------------------------------

/** GET /agents/:id/eval/cases — the Evals tab's case list. */
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval/cases`),
    enabled: !!agentId,
  });
}

/** GET /eval/cases/:id — one case's full frozen input + expectation (AC-39). */
export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.case(caseId),
    queryFn: () => api.get<EvalCase>(`/eval/cases/${caseId}`),
    enabled: !!caseId,
  });
}

/**
 * POST /findings/:id/eval-case (AC-1 … AC-7). Returns `created: false` on the
 * D17 idempotent path (server responded 200, not 201) — the FindingCard toast
 * needs this to say "already exists" rather than "created", per §10.
 */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string) => {
      const { data, status } = await api.postWithStatus<EvalCase>(`/findings/${findingId}/eval-case`);
      return { case: data, created: status === 201 };
    },
    onSuccess: ({ case: evalCase }) => {
      qc.invalidateQueries({ queryKey: evalKeys.cases(evalCase.owner_id) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard() });
      qc.invalidateQueries({ queryKey: evalKeys.agentDetail(evalCase.owner_id) });
    },
  });
}

/** PATCH /eval/cases/:id (AC-12, AC-13) — re-validated server-side; never
 *  touches stored runs (AC-14). */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EvalCaseInput> }) =>
      api.patch<EvalCase>(`/eval/cases/${id}`, patch),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: evalKeys.case(id) });
    },
    onSuccess: (data) => {
      qc.setQueryData(evalKeys.case(data.id), data);
      qc.invalidateQueries({ queryKey: evalKeys.cases(data.owner_id) });
    },
  });
}

/** DELETE /eval/cases/:id (AC-12, AC-14). `ownerId` is passed alongside the
 *  case id so the right cases list gets invalidated — the 204 response
 *  carries nothing to derive it from. */
export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; ownerId: string }) => api.del<void>(`/eval/cases/${id}`),
    onSuccess: (_data, { id, ownerId }) => {
      qc.removeQueries({ queryKey: evalKeys.case(id) });
      qc.invalidateQueries({ queryKey: evalKeys.cases(ownerId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard() });
    },
  });
}

// ---- Runs (AC-8, AC-15, AC-24 … AC-28, AC-49) ------------------------------

/** GET /agents/:id/eval/runs — this agent's run history (RunHistory table). */
export function useEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.runs(agentId),
    queryFn: () => api.get<EvalRunRecord[]>(`/agents/${agentId}/eval/runs`),
    enabled: !!agentId,
  });
}

/** GET /eval/runs/:id — the poll target (Q3). Polls every 3s ONLY while
 *  `status === 'running'`, so a viewer who didn't start the run still sees it
 *  finish, and a settled run polls never. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.get<EvalRunRecord>(`/eval/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });
}

/** POST /agents/:id/eval/runs (AC-8, AC-15, AC-24, AC-49) — starts a
 *  background run and returns immediately with the run id + estimate; the
 *  caller polls `useEvalRun(run_id)` for completion. */
export function useStartEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalRunResult>(`/agents/${agentId}/eval/runs`),
    onSuccess: (_data, agentId) => {
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard() });
      qc.invalidateQueries({ queryKey: evalKeys.agentDetail(agentId) });
    },
  });
}

/** POST /eval/runs/all (AC-25, AC-42) — `confirm: true` is a contract
 *  requirement (the route 422s without it), not a client convention; the
 *  confirmation dialog itself is what gates this call being made at all. */
export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunAllResult>(`/eval/runs/all`, { confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.dashboard() });
    },
  });
}

// ---- Dashboard + agent detail + compare (AC-32 … AC-34, AC-40 … AC-48) ----

/** GET /eval/dashboard — workspace-level, NOT repo-scoped (AC-40). */
export function useEvalDashboard() {
  return useQuery({
    queryKey: evalKeys.dashboard(),
    queryFn: () => api.get<EvalDashboard>("/eval/dashboard"),
  });
}

/** GET /eval/agents/:id (AC-44, AC-45, AC-48). */
export function useEvalAgentDetail(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.agentDetail(agentId),
    queryFn: () => api.get<EvalAgentDetail>(`/eval/agents/${agentId}`),
    enabled: !!agentId,
  });
}

/** GET /eval/compare?a=&b= (AC-32 … AC-34) — exactly two distinct run ids. */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.compare(a, b),
    queryFn: () => api.get<EvalCompare>(`/eval/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b && a !== b,
  });
}
