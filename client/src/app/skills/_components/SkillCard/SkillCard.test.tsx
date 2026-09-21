import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Treat any credential-shaped literal as CRITICAL.",
  type: "security",
  source: "manual",
  body: "# Secret gate",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderCard(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders the name, type and source", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("marks an imported skill as needing vetting", () => {
    // The whole trust story hangs off this: an imported body is someone else's
    // instructions, and the card has to say so before anyone enables it.
    renderCard(<SkillCard skill={{ ...SKILL, source: "imported_url" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not mark a hand-written skill as needing vetting", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("toggling does not also select the card", () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onToggle={onToggle} onClick={onClick} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("falls back to a placeholder when there is no description", () => {
    renderCard(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("deleting does not also open the card", () => {
    const onDelete = vi.fn();
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onDelete={onDelete} onClick={onClick} />);

    fireEvent.click(screen.getByLabelText("Delete secret-leakage-gate"));
    expect(onDelete).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("omits the delete control where the card is only a navigation target", () => {
    renderCard(<SkillCard skill={SKILL} onClick={vi.fn()} />);
    expect(screen.queryByLabelText("Delete secret-leakage-gate")).not.toBeInTheDocument();
  });

  it("shows the current version and how many agents use it", () => {
    renderCard(<SkillCard skill={{ ...SKILL, version: 5, agent_count: 3 }} />);
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("says 'no agents' rather than '0 agents' for an unused skill", () => {
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: 0 }} />);
    expect(screen.getByText("no agents")).toBeInTheDocument();
  });

  it("treats a missing agent_count as none, so the row never renders blank", () => {
    // Skills embedded in an agent's link list come back without the count.
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: null }} />);
    expect(screen.getByText("no agents")).toBeInTheDocument();
  });
});
