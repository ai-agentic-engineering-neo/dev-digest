import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { ReviewRecord } from "@devdigest/shared";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Hardcoded secret.",
    score: 38,
    model: "gpt-4.1",
    created_at: "2026-06-13T20:52:51.000Z",
    findings: [],
    ...o,
  };
}

function renderAccordion(r: ReviewRecord) {
  // Mutations (delete, finding actions) need a client; nothing is fetched here.
  return renderWithProviders(<ReviewRunAccordion review={r} prId="pr1" />);
}

describe("ReviewRunAccordion — run cost", () => {
  it("shows the run cost in the header", () => {
    renderAccordion(review({ cost_usd: 0.0013, tokens_in: 9119, tokens_out: 1240 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows nothing in the header when the cost is unknown", () => {
    renderAccordion(review({ cost_usd: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("passes the run usage down to the verdict banner", async () => {
    const { user } = renderAccordion(review({ cost_usd: 0.0013, tokens_in: 9119, tokens_out: 1240 }));
    await user.click(screen.getByText("Security Reviewer"));
    expect(screen.getByText("9k→1.2k")).toBeInTheDocument();
    expect(screen.getAllByText("$0.0013")).toHaveLength(2); // header + banner
  });
});

describe("ReviewRunAccordion — keyboard-active panel", () => {
  it("opening a run makes its findings panel the active one", async () => {
    const onActivate = vi.fn();
    const { user } = renderWithProviders(
      <ReviewRunAccordion review={review()} prId="pr1" active={false} onActivate={onActivate} />,
    );
    const header = screen.getByText("Security Reviewer"); // the banner repeats the name once open
    await user.click(header); // open
    expect(onActivate).toHaveBeenCalledTimes(1);
    await user.click(header); // close
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewRunAccordion — accessible header", () => {
  it("the header is a button that reports and toggles its expanded state", async () => {
    const { user } = renderAccordion(review());
    const header = screen.getByRole("button", { name: /Security Reviewer/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    header.focus();
    await user.keyboard("{Enter}");
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(header.getAttribute("aria-controls")!)).toBeInTheDocument();
  });

  it("shows the verdict and a pluralized finding count", () => {
    renderAccordion(review({ findings: [] }));
    expect(screen.getByText("request changes")).toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });

  it("Enter on delete asks for confirmation and deletes without toggling the run", async () => {
    const api = mockFetch({ "DELETE /reviews/:id": { ok: true } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderAccordion(review());
    const header = screen.getByRole("button", { name: /Security Reviewer/ });
    screen.getByRole("button", { name: "Delete this review run" }).focus();
    await user.keyboard("{Enter}");
    expect(confirm).toHaveBeenCalledWith("Delete this “Security Reviewer” review run and its findings?");
    await waitFor(() => expect(api.requests("DELETE", "/reviews/rv1")).toHaveLength(1));
    expect(header).toHaveAttribute("aria-expanded", "false");
    confirm.mockRestore();
  });

  it("a declined confirmation deletes nothing", async () => {
    const api = mockFetch({ "DELETE /reviews/:id": { ok: true } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderAccordion(review());
    await user.click(screen.getByRole("button", { name: "Delete this review run" }));
    expect(api.requests("DELETE")).toHaveLength(0);
    confirm.mockRestore();
  });
});
