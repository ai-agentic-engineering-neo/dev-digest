/** Test helpers for the Conventions page: providers with the `conventions`
    namespace + fixtures. The API is mocked at the network boundary with the
    Skills feature's route-table fetch stub. */
import React from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionsPage, Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

export { fetchCalls, mockFetch } from "@/app/skills/_components/test-utils";

export const REPO_ID = "11111111-1111-4111-8111-111111111111";

export function makeCandidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    rule: "Use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts",
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: false,
    status: "pending",
    category: "general",
    bad_example: "db.users.find(id).then((u) => u);",
    evidence: [
      { path: "src/api/users.ts", line_start: 23, line_end: 24, snippet: "const user = await db.users.find(id);" },
      { path: "src/api/orders.ts", line_start: 2, line_end: 2, snippet: "const order = await db.orders.find(id);" },
    ],
    skill_names: [],
    ...over,
  };
}

export function makePage(candidates: ConventionCandidate[], over: Partial<ConventionsPage> = {}): ConventionsPage {
  return {
    scan: { at: new Date().toISOString(), commit_sha: "abc1234", files_sampled: 14, model: "gpt-5.4" },
    candidates,
    ...over,
  };
}

export function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "payments-api-conventions",
    description: "",
    type: "convention",
    source: "extracted",
    body: "# payments-api-conventions",
    enabled: false,
    version: 1,
    evidence_files: [],
    created_at: "2026-11-26T10:00:00.000Z",
    updated_at: "2026-11-26T10:00:00.000Z",
    agent_count: 0,
    ...over,
  };
}

export function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
