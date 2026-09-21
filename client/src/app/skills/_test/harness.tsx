/* Shared test harness for the Skills UI: intl + query client + toast providers
   and a `fetch` mock keyed by "METHOD /path". Not a route (underscore folder). */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillListItem } from "@devdigest/shared";
import messages from "../../../../messages/en/skills.json";
import { API_BASE } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Stub global `fetch`; unknown routes respond 404. Returns the mock for call assertions. */
export function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(API_BASE, "")}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Parsed JSON body of the first fetch call matching `method` + `path`. */
export function bodyOf(fn: ReturnType<typeof mockFetch>, method: string, path: string): unknown {
  const call = fn.mock.calls.find(([u, init]) => u === `${API_BASE}${path}` && (init?.method ?? "GET") === method);
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}

export const SKILL_ITEM: SkillListItem = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\nEvaluate the pull request.",
  enabled: true,
  version: 2,
  used_by: 3,
  pull_rate: 71,
  accept_rate: 74,
};
