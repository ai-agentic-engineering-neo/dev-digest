import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../../messages/en/context.json";
import { DocEditor } from "./DocEditor";

afterEach(cleanup);

function Harness({ effective, onSave, saving = false }: { effective: string; onSave: () => void; saving?: boolean }) {
  const [value, setValue] = React.useState(effective);
  return <DocEditor value={value} effective={effective} saving={saving} onChange={setValue} onSave={onSave} />;
}

const renderEditor = (props: Parameters<typeof Harness>[0]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <Harness {...props} />
    </NextIntlClientProvider>,
  );

describe("DocEditor (AC-59, AC-60, AC-61)", () => {
  it("holds the effective text in a labelled textarea; Save is enabled only for a changed text within the cap", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderEditor({ effective: "# Rules", onSave });
    const box = screen.getByRole("textbox", { name: "Document text" });
    expect(box).toHaveValue("# Rules");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.type(box, " edited");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);

    // back to the effective text: nothing to save
    await user.clear(box);
    await user.type(box, "# Rules");
    expect(save).toBeDisabled();
  });

  it("over the cap shows the count against the limit and keeps Save disabled", async () => {
    const user = userEvent.setup();
    renderEditor({ effective: "x", onSave: vi.fn() });
    const box = screen.getByRole("textbox", { name: "Document text" });
    await user.clear(box);
    await user.click(box);
    await user.paste("y".repeat(200_001));
    expect(screen.getByRole("status")).toHaveTextContent("200,001 / 200,000 characters");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.keyboard("{Backspace}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows a pending save as disabled", () => {
    renderEditor({ effective: "x", onSave: vi.fn(), saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
