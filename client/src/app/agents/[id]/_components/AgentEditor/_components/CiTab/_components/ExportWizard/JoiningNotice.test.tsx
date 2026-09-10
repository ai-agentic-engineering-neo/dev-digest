import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ciMessages from "../../../../../../../../../../messages/en/ci.json";
import { JoiningNotice } from "./JoiningNotice";

/**
 * The notice exists so that joining an existing CI deployment is stated
 * BEFORE the user installs — the old behaviour refused this export outright,
 * so silence here would read as "this agent is the only reviewer".
 */

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("JoiningNotice", () => {
  it("names the repo, the reviewers already installed, and this agent", () => {
    renderWithIntl(
      <JoiningNotice
        repo="acme/payments-api"
        agentName="Security Reviewer"
        existingAgents={["Performance Reviewer", "UI Reviewer"]}
      />,
    );

    const body = screen.getByRole("status").textContent ?? "";
    expect(body).toContain("acme/payments-api");
    expect(body).toContain("Performance Reviewer");
    expect(body).toContain("UI Reviewer");
    expect(body).toContain("Security Reviewer");
  });

  it("renders nothing for a first install, rather than an empty banner", () => {
    const { container } = renderWithIntl(
      <JoiningNotice repo="acme/payments-api" agentName="Security Reviewer" existingAgents={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the preview has not loaded yet", () => {
    const { container } = renderWithIntl(
      <JoiningNotice repo="acme/payments-api" agentName="Security Reviewer" existingAgents={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
