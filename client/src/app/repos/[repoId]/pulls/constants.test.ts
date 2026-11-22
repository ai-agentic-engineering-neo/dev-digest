/**
 * Guards the PR list table layout: header cells and row cells share ONE grid
 * template, so a column added to COLUMN_KEYS without a grid track (or without
 * its i18n label) silently misaligns the whole table.
 */
import { describe, it, expect } from "vitest";
import messages from "../../../../../messages/en/prReview.json";
import { COLUMN_KEYS, GRID } from "./constants";

describe("PR list columns", () => {
  it("has exactly one grid track per column", () => {
    expect(GRID.trim().split(/\s+/)).toHaveLength(COLUMN_KEYS.length);
  });

  it("puts Cost right after Status and before Updated (design order)", () => {
    const i = COLUMN_KEYS.indexOf("cost");
    expect(i).toBeGreaterThan(-1);
    expect(COLUMN_KEYS[i - 1]).toBe("status");
    expect(COLUMN_KEYS[i + 1]).toBe("updated");
  });

  it("has an i18n label for every column", () => {
    const labels = messages.list.columns as Record<string, string>;
    for (const key of COLUMN_KEYS) expect(labels[key], key).toBeTruthy();
    expect(labels.cost).toBe("Cost");
  });
});
