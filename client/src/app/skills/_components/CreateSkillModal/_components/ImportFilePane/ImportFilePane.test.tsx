import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { ImportFilePane } from "./ImportFilePane";

afterEach(cleanup);

function renderPane() {
  const onLoaded = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportFilePane onLoaded={onLoaded} />
    </NextIntlClientProvider>,
  );
  return onLoaded;
}

const md = (name: string, text: string) => new File([text], name, { type: "text/markdown" });

describe("ImportFilePane", () => {
  it("a picked Markdown file is read in the browser and handed over as form values", async () => {
    const onLoaded = renderPane();
    fireEvent.change(screen.getByLabelText("Choose a Markdown file"), {
      target: { files: [md("rules.md", "# Semver discipline\nBump the major version.")] },
    });
    await waitFor(() =>
      expect(onLoaded).toHaveBeenCalledWith(
        { name: "semver-discipline", description: "Bump the major version.", type: "custom", body: "# Semver discipline\nBump the major version." },
        "rules.md",
      ),
    );
  });

  it("a dropped file works too; a wrong type is refused inline", async () => {
    const onLoaded = renderPane();
    fireEvent.drop(screen.getByTestId("skill-file-drop"), { dataTransfer: { files: [md("x.pdf", "# x")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only .md, .markdown or .txt files can be imported.");
    expect(onLoaded).not.toHaveBeenCalled();

    fireEvent.drop(screen.getByTestId("skill-file-drop"), { dataTransfer: { files: [md("x.txt", "# Ok\nbody")] } });
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
  });
});
