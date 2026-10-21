import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agents from "../../../../../messages/en/agents.json";
import shell from "../../../../../messages/en/shell.json";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/agents",
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../CreateAgentModal", () => ({ CreateAgentModal: () => <div role="dialog">create</div> }));

const AGENT = { id: "a1", name: "Security Reviewer", enabled: true } as unknown as Agent;
const data: { list: Agent[]; isLoading: boolean; isError: boolean } = { list: [AGENT], isLoading: false, isError: false };
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: data.list, isLoading: data.isLoading, isError: data.isError, refetch: vi.fn() }),
}));

import { AgentsListView } from "./AgentsListView";

beforeEach(() => {
  data.list = [AGENT];
  data.isLoading = false;
  data.isError = false;
});
afterEach(() => {
  cleanup();
  replace.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents, shell }}>
      <AgentsListView />
    </NextIntlClientProvider>,
  );
}

describe("AgentsListView", () => {
  it("opens the first agent's editor as soon as the list is known", () => {
    renderView();
    expect(replace).toHaveBeenCalledWith("/agents/a1?tab=config");
  });

  it("with no agents shows the empty state with a create CTA and does not navigate", () => {
    data.list = [];
    renderView();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first agent" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
