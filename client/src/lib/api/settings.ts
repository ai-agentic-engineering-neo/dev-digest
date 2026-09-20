/* api/settings.ts — Settings, secrets status, and provider connection tests
   (F1: GET/PUT /settings, POST /settings/test-connection, GET /settings/secrets-status). */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { Settings, ConnTestResult, SecretsStatus } from "@devdigest/shared";
import type { SettingsUpdate, ConnTestProvider } from "@devdigest/shared";
import { agentKeys } from "./agents";

export const settingsKeys = {
  detail: ["settings"] as const,
};

export const secretsKeys = {
  status: ["secrets-status"] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.detail,
    queryFn: () => api.get("/settings", Settings),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put("/settings", patch, Settings),
    onSuccess: (data) => qc.setQueryData(settingsKeys.detail, data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post("/settings/test-connection", body, ConnTestResult);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: agentKeys.providerModels.all });
        qc.invalidateQueries({ queryKey: secretsKeys.status });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: secretsKeys.status,
    queryFn: () => api.get("/settings/secrets-status", SecretsStatus),
    staleTime: 30_000,
  });
}
