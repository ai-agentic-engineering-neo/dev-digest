import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../messages/en/common.json";
import RouteError from "./error";
import NotFound from "./not-found";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("root boundaries", () => {
  it("error.tsx shows the translated error and retries via reset", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    wrap(<RouteError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(common.errorPage.title);
    fireEvent.click(screen.getByRole("button"));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("not-found.tsx links back to the dashboard", () => {
    wrap(<NotFound />);
    expect(screen.getByText(common.notFound.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: common.notFound.cta }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
