import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { validateSkillForm, type SkillFormValues } from "../helpers";
import { SkillFormFields } from "./SkillFormFields";

afterEach(cleanup);

function renderFields(values: SkillFormValues) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillFormFields values={values} errors={validateSkillForm(values)} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("SkillFormFields", () => {
  it("reports edits per field and counts body characters", () => {
    const onChange = renderFields({ name: "rubric", description: "", type: "custom", body: "abc" });
    expect(screen.getByText("3 / 20,000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "rubric-v2" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    fireEvent.change(screen.getByDisplayValue("abc"), { target: { value: "abcd" } });
    expect(onChange.mock.calls).toEqual([
      ["name", "rubric-v2"],
      ["type", "security"],
      ["body", "abcd"],
    ]);
  });

  it("shows inline errors next to invalid fields", () => {
    renderFields({ name: "Bad Name", description: "", type: "custom", body: "x".repeat(20_001) });
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Use kebab-case/)).toBeInTheDocument();
    expect(screen.getByText("The body is limited to 20,000 characters.")).toBeInTheDocument();
    expect(screen.getByText("20,001 / 20,000")).toBeInTheDocument();
  });
});
