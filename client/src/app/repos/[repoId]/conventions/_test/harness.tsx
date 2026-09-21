/* Shared test harness for the Conventions UI: intl + query client + toast providers and a
   `fetch` mock keyed by "METHOD /path". Not a route (underscore folder). */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate } from "@devdigest/shared";
import conventionsMessages from "../../../../../../messages/en/conventions.json";
import { API_BASE } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";

export const REPO_ID = "repo-1";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

type Route = unknown | ((body: unknown) => unknown);

/** Stub global `fetch`; unknown routes respond 404. A route value may be a function of the request body. */
export function mockFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(API_BASE, "")}`;
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    }
    const value = routes[key];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const payload = typeof value === "function" ? (value as (b: unknown) => unknown)(body) : value;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Parsed JSON body of the first fetch call matching `method` + `path`. */
export function bodyOf(fn: ReturnType<typeof mockFetch>, method: string, path: string): unknown {
  const call = fn.mock.calls.find(([u, init]) => u === `${API_BASE}${path}` && (init?.method ?? "GET") === method);
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}

export function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    repo_id: REPO_ID,
    category: "errors",
    rule: "Throw NotFoundError for a missing row instead of returning null",
    rationale: "Callers rely on the throw, never on a null check.",
    evidence_path: "src/api/users.ts",
    evidence_line: 5,
    evidence_snippet: 'if (!user) throw new NotFoundError("User not found");',
    evidence_files: ["src/api/users.ts", "src/api/orders.ts"],
    occurrences: 2,
    confidence: 0.9,
    status: "pending",
    created_at: "2026-09-20T00:00:00.000Z",
    ...over,
  };
}
