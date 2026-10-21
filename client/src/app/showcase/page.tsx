/* /showcase — the design-system gallery, rendered in the app's current theme.
   Dev-only page: every `@devdigest/ui` component plus cross-page pieces such
   as RunCostBadge. The smoke test mounts the same Gallery in both themes. */
"use client";

import React from "react";
import { Gallery } from "@/components/showcase";

export default function ShowcasePage() {
  return (
    <main style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Component showcase</h1>
      <Gallery />
    </main>
  );
}
