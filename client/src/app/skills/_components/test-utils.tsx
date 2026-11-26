/** Test helpers for the Skills feature: real QueryClient + intl + toasts, and a
    route-table `fetch` stub (the API is mocked at the network boundary). */
import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

export type RouteHandler = (body: unknown) => { status?: number; body?: unknown };
/** Keys are `"METHOD /path"` relative to the API base, e.g. `"GET /skills/sk1"`. */
export type Routes = Record<string, RouteHandler | object>;

/** Stubs global fetch; unknown routes answer 404. Returns the spy to assert calls. */
export function mockFetch(routes: Routes) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const key = `${init?.method ?? "GET"} ${decodeURIComponent(path)}`;
    const route = routes[key];
    const result =
      typeof route === "function"
        ? (route as RouteHandler)(init?.body ? JSON.parse(String(init.body)) : undefined)
        : route === undefined
          ? { status: 404, body: { error: { code: "not_found", message: `no route ${key}` } } }
          : { body: route };
    const status = result.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: String(status),
      json: async () => result.body,
    } as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** The `[method, path, body]` of every fetch the spy saw. */
export function fetchCalls(spy: ReturnType<typeof mockFetch>) {
  return spy.mock.calls.map(([url, init]) => [
    init?.method ?? "GET",
    new URL(url).pathname,
    init?.body ? JSON.parse(String(init.body)) : undefined,
  ]);
}

export function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
