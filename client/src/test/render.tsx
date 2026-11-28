/* Test helpers: render with React Query, next-intl (every en namespace) and
   toasts; and a fetch mock that records each API call. */
import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import { ToastProvider } from "@/lib/toast";
import agents from "../../messages/en/agents.json";
import common from "../../messages/en/common.json";
import runs from "../../messages/en/runs.json";
import shell from "../../messages/en/shell.json";
import skills from "../../messages/en/skills.json";

const MESSAGES = { agents, common, runs, shell, skills };

/** Render inside the app's providers; `rerender(ui)` keeps them (and the query cache). */
export function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <ToastProvider>{children}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper }), qc };
}

/** A `mockApi` reply with an error status, e.g. `new ApiErrorReply(400, { error: "…" })`. */
export class ApiErrorReply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Stub `fetch`: `respond(method, path, body)` returns the JSON reply (or
 * `undefined` for `{ ok: true }`); return an `ApiErrorReply` to answer with
 * an error status. Every call is recorded in `calls`. The stub is removed after
 * each test (`unstubGlobals` in vitest.config.ts).
 */
export function mockApi(respond: (method: string, path: string, body: unknown) => unknown) {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      const reply = respond(method, path, body);
      if (reply instanceof ApiErrorReply) return Response.json(reply.body, { status: reply.status });
      return Response.json(reply ?? { ok: true });
    }),
  );
  return calls;
}
