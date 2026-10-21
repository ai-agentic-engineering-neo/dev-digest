import { describe, it, expect, afterEach, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("writes exactly the text and reports success; false when the API is missing or rejects", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("pnpm dev")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("pnpm dev");

    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    expect(await copyText("x")).toBe(false);

    vi.stubGlobal("navigator", {});
    expect(await copyText("x")).toBe(false);
  });
});
