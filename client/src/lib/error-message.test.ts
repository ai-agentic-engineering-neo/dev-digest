import { describe, it, expect } from "vitest";
import { errorMessage, hasOwnErrorToast, OWN_ERROR_TOAST } from "./error-message";

describe("errorMessage", () => {
  it("uses an Error's message, a thrown string, else a fallback (never 'undefined')", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage({ code: 1 })).toBe("Something went wrong");
    expect(errorMessage(undefined)).toBe("Something went wrong");
    expect(errorMessage(new Error(""))).toBe("Something went wrong");
  });
});

describe("hasOwnErrorToast", () => {
  it("is true only for mutations marked with OWN_ERROR_TOAST", () => {
    expect(hasOwnErrorToast(OWN_ERROR_TOAST)).toBe(true);
    expect(hasOwnErrorToast(undefined)).toBe(false);
    expect(hasOwnErrorToast({ other: 1 })).toBe(false);
  });
});
