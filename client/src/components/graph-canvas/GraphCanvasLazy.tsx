"use client";

import dynamic from "next/dynamic";

/** Use this in pages/views: keeps @xyflow/react (and, transitively, elkjs) out of the main bundle. */
export const GraphCanvasLazy = dynamic(() => import("./GraphCanvas").then((m) => m.GraphCanvas), {
  ssr: false,
});
