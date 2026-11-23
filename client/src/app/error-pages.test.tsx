import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import RouteError from "./error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
  push.mockClear();
});

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("app/error.tsx", () => {
  it("announces the failure and retries via reset()", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    wrap(<RouteError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("app/not-found.tsx", () => {
  it("offers a way back to the app root", () => {
    wrap(<NotFound />);
    expect(screen.getByText("Page not found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to DevDigest" }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
