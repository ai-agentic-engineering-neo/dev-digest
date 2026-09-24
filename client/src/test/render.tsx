/* test/render.tsx — render components the way the app mounts them:
   next-intl with EVERY messages/en namespace (as src/i18n/request.ts loads
   them) and a fresh QueryClient per call. Tests stub `fetch` (./fetch-mock),
   never the project's own hooks. */
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, renderHook, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { ToastProvider } from "@/lib/toast";

// vite-node provides __dirname (import.meta.url is not a file: URL under jsdom).
const MESSAGES_DIR = join(__dirname, "../../messages/en");

function loadMessages(): AbstractIntlMessages {
  const messages: Record<string, AbstractIntlMessages> = {};
  for (const file of readdirSync(MESSAGES_DIR)) {
    if (!file.endsWith(".json")) continue;
    messages[file.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf8"));
  }
  return messages;
}

/** All `messages/en/*.json` namespaces, keyed by namespace. */
export const messages = loadMessages();

/** No retries (errors surface at once); gcTime Infinity keeps unobserved data for the whole test. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function TestProviders({ client, children }: { client: QueryClient; children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToastProvider>{children}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

export interface ProvidersRenderResult extends RenderResult {
  queryClient: QueryClient;
  user: ReturnType<typeof userEvent.setup>;
}

/** Render `ui` inside the app providers. `rerender` keeps the same providers + QueryClient. */
export function renderWithProviders(
  ui: React.ReactElement,
  { queryClient = createTestQueryClient(), ...options }: { queryClient?: QueryClient } & Omit<RenderOptions, "wrapper"> = {},
): ProvidersRenderResult {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TestProviders client={queryClient}>{children}</TestProviders>
  );
  const user = userEvent.setup();
  return { ...render(ui, { wrapper, ...options }), queryClient, user };
}

/** renderHook inside the same providers; returns the QueryClient for cache assertions. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  { queryClient = createTestQueryClient() }: { queryClient?: QueryClient } = {},
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TestProviders client={queryClient}>{children}</TestProviders>
  );
  return { ...renderHook(hook, { wrapper }), queryClient };
}

export * from "@testing-library/react";
export { userEvent };
