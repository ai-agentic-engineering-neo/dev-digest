import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PromptBlock token label (smoke)", () => {
  it("shows an estimated token count derived from the block text", () => {
    // 40 chars → 40/4 = 10 tokens.
    const text = "a".repeat(40);
    renderWithIntl(<PromptBlock label="System" text={text} color="#fff" />);
    expect(screen.getByText("≈10 tok")).toBeInTheDocument();
  });

  it("rounds to the nearest token for uneven lengths", () => {
    // 41 chars → 41/4 = 10.25 → rounds to 10.
    const text = "a".repeat(41);
    renderWithIntl(<PromptBlock label="System" text={text} color="#fff" />);
    expect(screen.getByText("≈10 tok")).toBeInTheDocument();
  });
});
