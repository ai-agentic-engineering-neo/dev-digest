import { describe, it, expect } from "vitest";
import { featureModelFor } from "./feature-models";

describe("featureModelFor", () => {
  it("prefers the settings override and falls back to the registry default", () => {
    expect(featureModelFor({ feature_models: { onboarding: { provider: "openai", model: "gpt-x" } } }, "onboarding")).toEqual({
      provider: "openai",
      model: "gpt-x",
    });
    expect(featureModelFor({ feature_models: {} }, "onboarding")).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
    expect(featureModelFor(undefined, "onboarding")?.model).toBe("deepseek/deepseek-v4-flash");
    expect(featureModelFor(null, "unknown")).toBeNull();
  });
});
