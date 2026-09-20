import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import skills from "../../messages/en/skills.json";
import agents from "../../messages/en/agents.json";
import skillStats from "../../messages/en/skillStats.json";
import { ToastProvider } from "../lib/toast";

/** Render with React Query + next-intl (skills, agents) + toasts. */
export function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills, agents, skillStats }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: Call) => unknown;

/** Mocks global fetch. Keys are "METHOD /path" (API base stripped). Unmatched -> 404. */
export function mockFetch(routes: Record<string, unknown | Handler>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    const call: Call = { method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const route = routes[`${method} ${path}`];
    if (route === undefined) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "nope" } }), { status: 404 });
    }
    const data = typeof route === "function" ? (route as Handler)(call) : route;
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

/** Minimal stand-in for user-event (not a dependency): synchronous fireEvent wrappers. */
export const userEvent = {
  click: async (el: Element) => void fireEvent.click(el),
  type: async (el: Element, value: string) => void fireEvent.change(el, { target: { value } }),
  clear: async (el: Element) => void fireEvent.change(el, { target: { value: "" } }),
  upload: async (el: Element, file: File) => void fireEvent.change(el, { target: { files: [file] } }),
};
