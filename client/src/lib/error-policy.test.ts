import { describe, it, expect, vi } from "vitest";
import { createErrorPolicy } from "./error-policy";
import { ApiError } from "./api";

describe("createErrorPolicy", () => {
  it("toasts a mutation error unless the mutation shows it inline", () => {
    const toast = vi.fn();
    const policy = createErrorPolicy(toast);
    policy.onMutationError(new Error("save failed"), { meta: undefined });
    policy.onMutationError(new Error("bad url"), { meta: { errorUi: "inline" } });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("save failed");
  });

  it("toasts a failing poll once per failure streak and stays silent on 4xx", () => {
    const toast = vi.fn();
    const policy = createErrorPolicy(toast);
    const poll = { queryHash: '["pr-runs","pr1"]' };
    policy.onQueryError(new ApiError("down", 503), poll);
    policy.onQueryError(new ApiError("down", 503), poll);
    expect(toast).toHaveBeenCalledTimes(1);

    policy.onQuerySuccess(poll);
    policy.onQueryError(new ApiError("down", 503), poll);
    expect(toast).toHaveBeenCalledTimes(2);

    policy.onQueryError(new ApiError("no tour yet", 404), { queryHash: '["tour"]' });
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it("toasts again when a removed query is re-mounted and fails again", () => {
    const toast = vi.fn();
    const policy = createErrorPolicy(toast);
    const query = { queryHash: '["pulls","repo1"]' };
    policy.onQueryError(new ApiError("down", 503), query);
    policy.onQueryRemoved(query);
    policy.onQueryError(new ApiError("down", 503), query);
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it("a 4xx does not swallow the next system error of the same query", () => {
    const toast = vi.fn();
    const policy = createErrorPolicy(toast);
    const query = { queryHash: '["tour","repo1"]' };
    policy.onQueryError(new ApiError("no tour yet", 404), query);
    policy.onQueryError(new ApiError("down", 503), query);
    expect(toast).toHaveBeenCalledWith("down");
  });
});
