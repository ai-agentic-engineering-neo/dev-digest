import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import { VersionDiff } from "./VersionDiff";

afterEach(cleanup);

function renderDiff(fromBody: string, toBody: string) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionDiff id="d1" fromVersion={1} fromBody={fromBody} toVersion={2} toBody={toBody} />
    </NextIntlClientProvider>,
  );
}

describe("VersionDiff", () => {
  it("renders added, removed and unchanged lines in a region labelled v{from} → v{to}", () => {
    renderDiff("keep\nold", "keep\nnew");
    expect(screen.getByRole("region", { name: "v1 → v2" })).toHaveAttribute("id", "d1");
    expect(screen.getByText("keep").closest("[data-kind]")).toHaveAttribute("data-kind", "same");
    expect(screen.getByText("old").closest("[data-kind]")).toHaveAttribute("data-kind", "del");
    expect(screen.getByText("new").closest("[data-kind]")).toHaveAttribute("data-kind", "add");
  });

  it("says so when the bodies are identical", () => {
    renderDiff("same", "same");
    expect(screen.getByText("No differences from the previous version.")).toBeInTheDocument();
  });
});
