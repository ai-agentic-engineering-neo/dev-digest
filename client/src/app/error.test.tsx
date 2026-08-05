/**
 * The app-level error boundary (`app/error.tsx`).
 *
 * The gap this closes: `providers.tsx` toasts every failed query and mutation,
 * so the studio looked defended — but a THROW DURING RENDER is not a query
 * error, and with no boundary the whole tree unmounted to a blank page. The
 * last test here is the one that matters: it renders a component that throws
 * and asserts something is still on screen.
 */
import React from "react";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en/common.json";

import AppError from "./error";

afterEach(cleanup);

beforeEach(() => {
  // Both the boundary and React itself log the caught error; keep the run quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("app error boundary", () => {
  it("shows the failure copy instead of a blank screen", () => {
    renderWithIntl(<AppError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText(messages.errorBoundary.title)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("surfaces the thrown message", () => {
    renderWithIntl(<AppError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("falls back to the digest when the message was stripped (production build)", () => {
    const err = Object.assign(new Error(""), { digest: "abc123" });
    renderWithIntl(<AppError error={err} reset={vi.fn()} />);
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("calls reset() from the retry button", () => {
    const reset = vi.fn();
    renderWithIntl(<AppError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: messages.errorBoundary.cta }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("catches a render-time throw rather than unmounting the tree", () => {
    // Stands in for what Next.js does with error.tsx: the same component, wired
    // as the fallback of a real React error boundary around a throwing child.
    class Boundary extends React.Component<
      { children: React.ReactNode },
      { error: Error | null }
    > {
      state: { error: Error | null } = { error: null };
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          return <AppError error={this.state.error} reset={() => this.setState({ error: null })} />;
        }
        return this.props.children;
      }
    }

    function Explodes(): React.ReactElement {
      throw new Error("render exploded");
    }

    renderWithIntl(
      <Boundary>
        <Explodes />
      </Boundary>,
    );

    expect(screen.getByText(messages.errorBoundary.title)).toBeInTheDocument();
    expect(screen.getByText("render exploded")).toBeInTheDocument();
  });
});
