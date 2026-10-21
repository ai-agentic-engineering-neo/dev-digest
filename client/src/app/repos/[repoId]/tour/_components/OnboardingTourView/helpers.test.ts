import { describe, it, expect } from "vitest";
import type { OnboardingView } from "@devdigest/shared";
import { refreshedWhen, sectionFromHash, viewState } from "./helpers";

const base = { repoNotFound: false, isLoading: false, isError: false, cloned: true };
const tour = {} as NonNullable<OnboardingView["tour"]>;
const run = (status: "running" | "done" | "failed") => ({ status }) as NonNullable<OnboardingView["run"]>;

describe("viewState", () => {
  it("orders the states: not found, loading, error, tour, generating, not cloned, empty", () => {
    expect(viewState({ ...base, repoNotFound: true, isLoading: true, view: undefined })).toBe("notFound");
    expect(viewState({ ...base, isLoading: true, view: undefined })).toBe("loading");
    expect(viewState({ ...base, isError: true, view: undefined })).toBe("error");
    expect(viewState({ ...base, view: { tour: null, run: null, stale: false } })).toBe("empty");
    expect(viewState({ ...base, view: { tour: null, run: run("running"), stale: false } })).toBe("generating");
    expect(viewState({ ...base, view: { tour: null, run: run("failed"), stale: false } })).toBe("empty");
  });

  it("D1: a stored tour wins over a missing clone; without a tour the not-cloned state shows", () => {
    expect(viewState({ ...base, cloned: false, view: { tour, run: null, stale: false } })).toBe("tour");
    expect(viewState({ ...base, cloned: false, view: { tour: null, run: null, stale: false } })).toBe("notCloned");
  });
});

describe("sectionFromHash / refreshedWhen", () => {
  it("accepts only the five section ids (EC-20)", () => {
    expect(sectionFromHash("#run-locally")).toBe("run-locally");
    expect(sectionFromHash("#nope")).toBeNull();
    expect(sectionFromHash("")).toBeNull();
  });
  it("maps now to just now", () => {
    const labels = { justNow: "just now", ago: (w: string) => `${w} ago` };
    expect(refreshedWhen("now", labels)).toBe("just now");
    expect(refreshedWhen("2h", labels)).toBe("2h ago");
  });
});
