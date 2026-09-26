import type React from "react";
import { RepoGuard } from "./_components/RepoGuard";

/* Every /repos/:repoId/** page is guarded once here. */
export default function RepoLayout({ children }: { children: React.ReactNode }) {
  return <RepoGuard>{children}</RepoGuard>;
}
