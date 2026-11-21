import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, renderHook, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import graphMessages from "../../../messages/en/graph.json";
import { GraphCanvas } from "./GraphCanvas";
import { GraphBanner } from "./GraphBanner";
import { LiveRegion, useAnnouncer } from "./LiveRegion";
import { useElkLayout } from "./useElkLayout";
import { MAX_LAYOUT_NODES } from "./constants";
import { edgeLabel, edgeStrokeWidth, layoutExtent, searchNodes } from "./helpers";
import type { GraphEdgeInput, GraphNodeInput } from "./types";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ graph: graphMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const nodes: GraphNodeInput[] = [
  { id: "a", label: "<b>parse</b>", role: "changed", secondary: "src/a.ts" },
  { id: "b", label: "render", role: "impacted", deleted: true },
  { id: "c", label: "main", role: "entry" },
];
const edges: GraphEdgeInput[] = [
  { id: "e1", source: "a", target: "b", inferred: true },
  { id: "e2", source: "b", target: "c", typeOnly: true },
];

describe("GraphCanvas", () => {
  it("toolbar: search picks a node (keyboard and click); fit buttons are present", async () => {
    const onSelect = vi.fn();
    wrap(<GraphCanvas nodes={nodes} edges={edges} onSelect={onSelect} focusId="b" ariaLabel="Impact graph" />);
    await screen.findByRole("button", { name: /changed: <b>parse<\/b>/ });

    expect(screen.getByRole("button", { name: "Fit the whole graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom to the changed code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Center on the selected node" })).toBeEnabled();

    const box = screen.getByRole("combobox", { name: "Find a node…" });
    fireEvent.change(box, { target: { value: "ren" } });
    expect(screen.getByRole("option")).toHaveTextContent("render");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("b");
    expect(box).toHaveValue("");

    fireEvent.change(box, { target: { value: "src/a" } }); // matches the secondary (path) line
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("button", { name: /parse/ }));
    expect(onSelect).toHaveBeenLastCalledWith("a");

    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No matching nodes")).toBeInTheDocument();
  });

  it("searchNodes ranks exact > prefix > substring > path, shorter labels first", () => {
    const ns: GraphNodeInput[] = [
      { id: "1", label: "useBlogActions", role: "impacted" },
      { id: "2", label: "getBlog", role: "impacted" },
      { id: "3", label: "useBlog", role: "impacted" },
      { id: "4", label: "x", role: "impacted", secondary: "src/blog/x.ts" },
      { id: "5", label: "blog", role: "changed" },
    ];
    expect(searchNodes(ns, "blog").map((n) => n.id)).toEqual(["5", "2", "3", "1", "4"]);
    expect(searchNodes(ns, "  ")).toEqual([]);
  });

  it("layoutExtent pads the node bounding box and is undefined with no layout", () => {
    expect(layoutExtent({}, 190, 56)).toBeUndefined();
    const [[x0, y0], [x1, y1]] = layoutExtent({ a: { x: 0, y: 0 }, b: { x: 1000, y: 200 } }, 190, 56)!;
    expect(x0).toBeLessThan(0);
    expect(y0).toBeLessThan(0);
    expect(x1).toBeGreaterThan(1190);
    expect(y1).toBeGreaterThan(256);
  });

  it("renders nodes as plain text, legend for encodings in use, banners, and selects via click and keyboard", async () => {
    const onSelect = vi.fn();
    wrap(
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        onSelect={onSelect}
        ariaLabel="Impact graph"
        announcement="3 nodes"
        banners={[{ id: "trunc", text: "Truncated at 3 nodes", tone: "warning", stats: [{ label: "hidden", value: 12 }] }]}
      />,
    );

    const first = await screen.findByRole("button", { name: /changed: <b>parse<\/b>/ });
    expect(screen.getByText("<b>parse</b>")).toBeInTheDocument(); // plain text, not HTML
    expect(screen.getByRole("button", { name: /impacted: render \(deleted\)/ })).toBeInTheDocument();

    const legend = screen.getByRole("region", { name: "Legend" });
    expect(legend).toHaveTextContent("inferred edge (dashed)");
    expect(legend).toHaveTextContent("type-only import (thin)");
    expect(legend).toHaveTextContent("deleted symbol");
    expect(legend).toHaveTextContent("entry point");

    expect(screen.getByRole("region", { name: "Graph notices" })).toHaveTextContent("Truncated at 3 nodes");
    expect(screen.getByText("hidden: 12")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 nodes")); // "Laying out…" first, then the announcement

    fireEvent.click(first);
    fireEvent.keyDown(screen.getByRole("button", { name: /entry point: main/ }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: /impacted: render/ }), { key: " " });
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["a", "c", "b"]);
  });

  // AC-47: a grouped (directory) edge shows how many file imports it stands for.
  it("labels weighted edges ×N and explains the encoding in the legend", async () => {
    wrap(
      <GraphCanvas
        nodes={[
          { id: "d1", label: "src/a", role: "directory" },
          { id: "d2", label: "src/b", role: "directory" },
        ]}
        edges={[{ id: "w", source: "d1", target: "d2", weight: 12 }]}
        ariaLabel="Project graph"
      />,
    );
    await screen.findByRole("button", { name: /src\/a/ });
    expect(screen.getByRole("region", { name: "Legend" })).toHaveTextContent("number of file imports behind a grouped edge");
    // jsdom can't measure handles, so React Flow draws no edges: assert the
    // label/stroke mapping directly.
    const tr = (key: string, v?: Record<string, number>) => (key === "tag.weight" ? `×${v?.count}` : "type");
    expect(edgeLabel({ id: "w", source: "a", target: "b", weight: 12 }, tr)).toBe("×12");
    expect(edgeLabel({ id: "w", source: "a", target: "b", weight: 1 }, tr)).toBeUndefined();
    expect(edgeLabel({ id: "w", source: "a", target: "b", weight: 3, typeOnly: true }, tr)).toBe("type · ×3");
    expect(edgeStrokeWidth({ id: "w", source: "a", target: "b" })).toBe(2);
    expect(edgeStrokeWidth({ id: "w", source: "a", target: "b", weight: 64 })).toBe(5); // log2 capped at +3
    expect(edgeStrokeWidth({ id: "w", source: "a", target: "b", weight: 64, typeOnly: true })).toBe(1);
  });
});

describe("GraphBanner / LiveRegion", () => {
  it("lists every condition and announces via aria-live polite; empty banner renders nothing", () => {
    const { rerender } = wrap(
      <GraphBanner
        conditions={[
          { id: "1", text: "Partial index" },
          { id: "2", text: "Reindexing", tone: "warning" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ graph: graphMessages }}>
        <GraphBanner conditions={[]} />
        <LiveRegion message="Graph loaded" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Graph loaded");

    const { result } = renderHook(() => useAnnouncer());
    expect(result.current.message).toBe("");
  });
});

describe("useElkLayout", () => {
  it("lays out deterministically and skips ELK above the node cap", async () => {
    const ids = ["x", "y", "z"];
    const es = [
      { id: "1", source: "x", target: "y" },
      { id: "2", source: "y", target: "z" },
    ];
    const run = async (order: string[]) => {
      const { result } = renderHook(() => useElkLayout(order, es));
      await waitFor(() => expect(result.current.status).toBe("ready"));
      return result.current.positions;
    };
    const p1 = await run(ids);
    const p2 = await run([...ids].reverse());
    expect(p1).toEqual(p2);
    expect(p1.y!.x).toBeGreaterThan(p1.x!.x);

    const many = Array.from({ length: MAX_LAYOUT_NODES + 1 }, (_, i) => `n${i}`);
    const { result } = renderHook(() => useElkLayout(many, []));
    await waitFor(() => expect(result.current.status).toBe("skipped"));
    expect(Object.keys(result.current.positions)).toHaveLength(many.length);
  });
});
