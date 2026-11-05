import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../messages/en/agents.json";
import { createQueryClient } from "../query-client";
import { ToastProvider } from "../toast";
import { DeleteAgentDialog } from "../../app/agents/_components/AgentCard/_components/DeleteAgentDialog";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { del: vi.fn(async () => Promise.reject(new Error("Agent is in use"))) },
}));

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

describe("useDeleteAgent in DeleteAgentDialog", () => {
  it("a failed delete shows its error once — in the modal, not also as a global toast", async () => {
    // The app's real QueryClient: its MutationCache.onError raises global toasts.
    const qc = createQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <ToastProvider>
            <DeleteAgentDialog agent={AGENT} onClose={() => {}} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    const alert = await within(screen.getByRole("dialog")).findByRole("alert");
    expect(alert).toHaveTextContent("Agent is in use");
    expect(screen.getAllByText("Agent is in use")).toHaveLength(1); // no second (toast) copy
  });
});
