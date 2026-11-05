/* providers.tsx — client provider stack: React Query + Theme + active Repo. */
"use client";

import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./theme";
import { RepoProvider } from "./repo-context";
import { ToastProvider } from "./toast";
import { createQueryClient } from "./query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(createQueryClient);
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <RepoProvider>{children}</RepoProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
