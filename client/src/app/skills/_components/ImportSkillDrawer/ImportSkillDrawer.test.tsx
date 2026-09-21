import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import JSZip from "jszip";
import skillsMessages from "../../../../../messages/en/skills.json";
import importMessages from "../../../../../messages/en/skillsImport.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

const SAVED = { id: "sk1", name: "my-skill", description: "", type: "custom", source: "manual", body: "b", enabled: true, version: 1 };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(SAVED), { status: 200 }));
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDrawer(props: Partial<React.ComponentProps<typeof ImportSkillDrawer>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, skillsImport: importMessages }}>
        <ToastProvider>
          <ImportSkillDrawer {...props} onClose={onClose} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

const importButton = () => screen.getByRole("button", { name: "Import skill" });

/** FormField labels aren't associated with their controls, so locate inputs by position/placeholder. */
const nameInput = () => screen.getByPlaceholderText("pr-quality-rubric") as HTMLInputElement;
const bodyInput = () => screen.getByPlaceholderText(/Describe the rule/) as HTMLTextAreaElement;

function pick(file: File) {
  const input = screen.getByLabelText("Skill file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillDrawer", () => {
  it("renders the file picker and editable fields, with Import disabled while empty", () => {
    renderDrawer();
    expect(screen.getByText("Add a skill")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill file")).toHaveAttribute("accept", ".md,.markdown,.zip");
    expect(nameInput()).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });

  it("posts nothing until Import is clicked, then creates a manual skill", async () => {
    const onImported = vi.fn();
    const { onClose } = renderDrawer({ onImported });
    fireEvent.change(nameInput(), { target: { value: "my-skill" } });
    fireEvent.change(bodyInput(), { target: { value: "# Rule\nBe kind." } });
    fireEvent.change(screen.getByPlaceholderText("What this skill checks for"), { target: { value: "  Kindness  " } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rubric" } });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(importButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/skills$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "my-skill",
      description: "Kindness",
      type: "rubric",
      body: "# Rule\nBe kind.",
      source: "manual",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ id: "sk1" }));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("pre-fills from a .md file without posting, then posts source 'extracted'", async () => {
    renderDrawer();
    pick(new File(["---\nname: from-file\ndescription: Loaded desc\n---\n# Title\nBody text"], "rule.md"));
    await waitFor(() => expect(bodyInput().value).toBe("# Title\nBody text"));
    expect(nameInput().value).toBe("from-file");
    expect(screen.getByPlaceholderText("What this skill checks for")).toHaveValue("Loaded desc");
    expect(screen.getByText("Loaded rule.md")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(importButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      name: "from-file",
      type: "custom",
      source: "extracted",
      body: "# Title\nBody text",
    });
  });

  it("derives the name from the heading only when the field is still empty", async () => {
    renderDrawer();
    fireEvent.change(nameInput(), { target: { value: "keep-me" } });
    pick(new File(["# Some Title\nbody"], "a.md"));
    await waitFor(() => expect(bodyInput().value).toBe("# Some Title\nbody"));
    expect(nameInput().value).toBe("keep-me");
    fireEvent.change(nameInput(), { target: { value: "" } });
    pick(new File(["# Other Title\nbody"], "b.md"));
    await waitFor(() => expect(nameInput().value).toBe("other-title"));
  });

  it("lists ignored archive entries and only uses the core file", async () => {
    renderDrawer();
    const zip = new JSZip();
    zip.file("SKILL.md", "# Zip Skill\nrules");
    zip.file("scripts/run.sh", "echo hi");
    zip.file("tool.exe", "MZ");
    pick(new File([await zip.generateAsync({ type: "arraybuffer" })], "pack.zip"));
    await waitFor(() => expect(bodyInput().value).toBe("# Zip Skill\nrules"));
    expect(screen.getByText("2 other files in the archive were ignored (not processed)")).toBeInTheDocument();
    expect(screen.getByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText("tool.exe")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an inline error for an archive without text entries and leaves the form alone", async () => {
    renderDrawer();
    const zip = new JSZip();
    zip.file("run.sh", "echo");
    pick(new File([await zip.generateAsync({ type: "arraybuffer" })], "bad.zip"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No Markdown or text file was found in this archive.");
    expect(bodyInput().value).toBe("");
    expect(importButton()).toBeDisabled();
  });

  it("shows an inline error for unsupported extensions", async () => {
    renderDrawer();
    pick(new File(["echo"], "run.sh"));
    expect(await screen.findByRole("alert")).toHaveTextContent('"run.sh" is not supported');
  });

  it("keeps the drawer open when the create request fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }));
    const { onClose } = renderDrawer();
    fireEvent.change(nameInput(), { target: { value: "x" } });
    fireEvent.change(bodyInput(), { target: { value: "body" } });
    fireEvent.click(importButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(importButton()).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("Cancel closes without posting", () => {
    const { onClose } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
