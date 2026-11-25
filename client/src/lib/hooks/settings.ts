/* hooks/settings.ts — settings, provider-key status and connection tests
   (GET/PUT /settings, POST /settings/test-connection, GET /settings/secrets-status). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
} from "../types";
import { agentKeys, settingsKeys } from "./keys";

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(settingsKeys.all, data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: agentKeys.providerModelsAll });
        qc.invalidateQueries({ queryKey: settingsKeys.secretsStatus });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: settingsKeys.secretsStatus,
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}
