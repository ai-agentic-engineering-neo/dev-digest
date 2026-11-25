import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en/common.json";
import { NotFoundView } from "./NotFoundView";

afterEach(cleanup);

describe("NotFoundView", () => {
  it("explains the missing page and offers a real link home", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <NotFoundView />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to DevDigest" })).toHaveAttribute("href", "/");
  });
});
