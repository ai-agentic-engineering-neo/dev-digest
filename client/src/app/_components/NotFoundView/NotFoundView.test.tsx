import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en/common.json";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NotFoundView } from "./NotFoundView";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("NotFoundView", () => {
  it("explains the missing page and links home", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <NotFoundView />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to DevDigest" }));
    expect(push).toHaveBeenCalledWith("/");
  });
});
