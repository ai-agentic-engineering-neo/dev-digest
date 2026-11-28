import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RouteError, RouteNotFound } from "./RouteStates";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={{ common }}>
    {ui}
  </NextIntlClientProvider>
);

describe("route states", () => {
  it("RouteError shows the message and retries", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRetry = vi.fn();
    render(wrap(<RouteError error={new Error("boom")} onRetry={onRetry} />));

    expect(screen.getByText(common.errorPage.title)).toBeTruthy();
    expect(screen.getByText(common.errorPage.home)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });

  it("RouteNotFound shows the not-found copy", () => {
    render(wrap(<RouteNotFound />));
    expect(screen.getByText(common.notFound.title)).toBeTruthy();
    expect(screen.getByText(common.notFound.cta)).toBeTruthy();
  });
});
