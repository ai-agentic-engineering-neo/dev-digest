# Examples — frontend-architecture

Good and bad patterns for [SKILL.md](SKILL.md). Sources: [references.md](references.md).

## 1. Thin route → colocated view

```tsx
// ❌ app/agents/page.tsx — fetching, filtering, constants and JSX in the route
"use client";
export default function Page() {
  const [q, setQ] = useState("");
  const { data } = useQuery({ queryKey: ["agents"], queryFn: () => fetch("/api/agents").then(r => r.json()) });
  const list = data?.filter((a: any) => a.name.includes(q)).slice(0, 20);
  return <div>{/* 300 lines of JSX */}</div>;
}
```

```tsx
// ✅ app/agents/page.tsx — routing only
import { AgentsListView } from "./_components/AgentsListView";

export default function AgentsPage() {
  return <AgentsListView />;
}
```

## 2. Logic in a hook, rules in pure helpers, view only renders

```ts
// ✅ _components/AgentsListView/constants.ts — data only
export const PAGE_SIZE = 20;
```

```ts
// ✅ _components/AgentsListView/helpers.ts — pure, testable without React
import type { Agent } from "@devdigest/shared";

export function filterAgentsByName(agents: Agent[], query: string): Agent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return agents;
  return agents.filter((agent) => agent.name.toLowerCase().includes(normalized));
}
```

```ts
// ✅ _components/AgentsListView/useAgentsList.ts — state + orchestration
import { useState } from "react";
import { useAgents } from "@/lib/hooks/agents";
import { PAGE_SIZE } from "./constants";
import { filterAgentsByName } from "./helpers";

export function useAgentsList() {
  const [query, setQuery] = useState("");
  const { data: agents = [], isLoading } = useAgents();
  const visibleAgents = filterAgentsByName(agents, query).slice(0, PAGE_SIZE); // derived, not stored
  return { query, setQuery, visibleAgents, isLoading };
}
```

```tsx
// ✅ _components/AgentsListView/AgentsListView.tsx — reads as intent
export function AgentsListView() {
  const { query, setQuery, visibleAgents, isLoading } = useAgentsList();
  if (isLoading) return <Spinner />;
  return (
    <>
      <SearchInput value={query} onChange={setQuery} />
      {visibleAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
    </>
  );
}
```

## 3. Functions: one job, no flags, ≤2 params

```ts
// ❌ does three things, boolean flag, positional soup
function process(run, save, notify, retries, verbose) {
  const findings = run.findings.filter(f => f.severity !== "info");
  if (save) db.save(findings);
  if (notify) slack.send(findings.length + " findings");
  return findings;
}
```

```ts
// ✅ each function does one thing; the caller composes them
function selectActionableFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity !== "info");
}

function formatFindingsSummary(findings: Finding[]): string {
  return `${findings.length} findings`;
}

// more than 2 params → one options object
function scheduleRetry({ runId, attempt, delayMs }: RetryOptions) { /* … */ }
```

## 4. Early returns instead of nesting

```ts
// ❌
function severityLabel(finding?: Finding) {
  if (finding) {
    if (finding.severity) {
      return finding.severity === "critical" ? "Critical" : finding.severity === "major" ? "Major" : "Minor";
    }
  }
  return "Unknown";
}
```

```ts
// ✅ guard clauses + a lookup map in constants.ts
import { SEVERITY_LABEL } from "./constants";

function severityLabel(finding?: Finding): string {
  if (!finding?.severity) return "Unknown";
  return SEVERITY_LABEL[finding.severity] ?? "Unknown";
}
```

## 5. Naming

```ts
// ❌                                  // ✅
const d = useAgents();                 const { data: agents } = useAgents();
const flag = run.status === "done";    const isRunFinished = run.status === "done";
function handle(x) {}                  function handleSeverityChange(severity: Severity) {}
function data2url(d) {}                function buildPullRequestUrl(pull: PullRequest) {}
<Card ag={ag} />                       <AgentCard agent={agent} />
```

## 6. Imports

```ts
// ❌ deep relative chain, deep-import into another feature, mixed order
import { modelColor } from "../../../agents/_components/AgentCard/helpers";
import { s } from "./styles";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import React from "react";
import { Badge } from "@devdigest/ui/layers/badge";
```

```ts
// ✅ framework → third-party → aliases → relative; types separate; public APIs only
import { useTranslations } from "next-intl";

import { Badge } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";

import { modelColor } from "./helpers";
import { s } from "./styles";
```

If two features need `modelColor`, **promote** it to `src/lib/model-colors.ts`.
Don't import it from inside another feature's folder.

## 7. Barrels

```ts
// ✅ AgentCard/index.ts — one-line public API of a folder
export { AgentCard } from "./AgentCard";

// ❌ src/components/index.ts — aggregate barrel: cycles, slow tests, poor tree-shaking
export * from "./app-shell";
export * from "./diff-viewer";
export * from "./mermaid-diagram";
```

## 8. Next.js server/client boundary

```tsx
// ❌ whole page becomes client JS just for one toggle
"use client";
export default function SettingsPage() { /* … big tree … */ }
```

```tsx
// ✅ server page, tiny client leaf; server UI passed through children
// app/settings/page.tsx (Server Component)
import { ThemeToggle } from "./_components/ThemeToggle"; // 'use client' inside
import { Collapsible } from "./_components/Collapsible"; // 'use client' inside

export default function SettingsPage() {
  return (
    <Collapsible title="Appearance">
      <ServerRenderedDescription />  {/* stays a Server Component */}
      <ThemeToggle />
    </Collapsible>
  );
}
```

```ts
// ✅ lib/secrets.ts — build fails if a client component imports it
import "server-only";
```

## 9. Constants: what to extract

```ts
// ❌ magic values with meaning, inline
if (file.size > 5 * 1024 * 1024) toast.error("Too big");
setTimeout(poll, 3000);

// ✅ constants.ts
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RUN_POLL_INTERVAL_MS = 3_000;

// ✅ fine to leave inline: no domain meaning
const s = { row: { display: "flex", gap: 8 } };
```

## 10. Feature module (target layout) and its enforcement

```ts
// ✅ features/agents/index.ts — the module's public API (like Angular NgModule exports)
export { AgentsListView } from "./views/AgentsListView";
export { AgentEditorView } from "./views/AgentEditorView";
export { useAgents } from "./api/useAgents";
export { agentPath, AGENTS_PATH } from "./routes";
export type { AgentFilters } from "./types";
// AgentCard, helpers, constants stay private to the feature
```

```ts
// ✅ features/agents/routes.ts — paths live with the feature, URLs live in app/
export const AGENTS_PATH = "/agents";
export const agentPath = (agentId: string) => `${AGENTS_PATH}/${agentId}`;
```

```ts
// ✅ features/agents/api/useAgents.ts — data access over the shared client
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";

export const agentKeys = {
  all: ["agents"] as const,
  detail: (agentId: string) => [...agentKeys.all, agentId] as const,
};

export function useAgents() {
  return useQuery({ queryKey: agentKeys.all, queryFn: apiClient.listAgents, staleTime: 5 * 60_000 });
}
```

```tsx
// ✅ app/agents/[id]/page.tsx — pages layer: thin, imports only public APIs
import type { Metadata } from "next";
import { AgentEditorView } from "@/features/agents";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentEditorView agentId={id} />;
}
```

```tsx
// ✅ a page combining two features: composition happens in app/, not inside a feature
import { RunSummary } from "@/features/reviews";
import { PullHeader } from "@/features/pulls";

export default async function PullPage({ params }: PageProps) {
  const { repoId, number } = await params;
  return (
    <>
      <PullHeader repoId={repoId} pullNumber={Number(number)} />
      <RunSummary repoId={repoId} pullNumber={Number(number)} />
    </>
  );
}
```

```ts
// ❌ feature → feature import, and a deep import
// features/reviews/components/RunSummary.tsx
import { AgentCard } from "@/features/agents/components/AgentCard";
// ✅ if reviews needs it too, promote a domain-free version to shared/components/,
//    or pass the rendered agent UI in from app/ as children
```

```js
// ✅ eslint.config.mjs — enforce app → features → shared (eslint-plugin-import)
import importPlugin from "eslint-plugin-import";

export default [
  {
    plugins: { import: importPlugin },
    settings: { "import/resolver": { typescript: true } },
    rules: {
      "import/no-restricted-paths": ["error", {
        zones: [
          // shared knows nothing about features or app
          { target: "./src/shared", from: ["./src/features", "./src/app"] },
          // features never import app
          { target: "./src/features", from: "./src/app" },
          // no feature → feature (one zone per feature, or generate them)
          { target: "./src/features/agents", from: "./src/features", except: ["./agents"] },
          { target: "./src/features/reviews", from: "./src/features", except: ["./reviews"] },
        ],
      }],
      "import/no-cycle": "error",
    },
  },
];
```

## 11. State and effects: derive, don't sync

```tsx
// ❌ mirrored server data + derived state + effect chain = 3 extra renders
const { data } = useFindings(runId);
const [findings, setFindings] = useState<Finding[]>([]);
const [criticalCount, setCriticalCount] = useState(0);
useEffect(() => { if (data) setFindings(data); }, [data]);
useEffect(() => { setCriticalCount(findings.filter(isCritical).length); }, [findings]);
```

```tsx
// ✅ query result is the state; derived values are computed in render
const { data: findings = [] } = useFindings(runId);
const criticalCount = findings.filter(isCritical).length;
```

```tsx
// ❌ effect reacting to a user action
useEffect(() => { if (submitted) toast.success(t("saved")); }, [submitted]);

// ✅ do it where the action happens
function handleSave() {
  save.mutate(form, { onSuccess: () => toast.success(t("saved")) });
}
```

```tsx
// ❌ resetting state on prop change with an effect
useEffect(() => { setDraft(""); }, [agentId]);

// ✅ let React reset it
<AgentEditor key={agentId} agentId={agentId} />
```

```tsx
// ✅ a legitimate effect: external system, one concern, cleanup
useEffect(() => {
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [onClose]);
```

## 12. Move state down instead of memoizing

```tsx
// ❌ every keystroke re-renders the heavy DiffViewer
function PullView({ diff }: Props) {
  const [comment, setComment] = useState("");
  return (
    <>
      <DiffViewer diff={diff} />
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
    </>
  );
}

// ✅ the state lives in the leaf that needs it; no memo required
function PullView({ diff }: Props) {
  return (
    <>
      <DiffViewer diff={diff} />
      <CommentBox />
    </>
  );
}
```

## 13. Memoization: when yes, when no

```tsx
// ❌ pointless: cheap work, plain DOM consumer
const title = useMemo(() => `${repo.owner}/${repo.name}`, [repo]);
const handleClick = useCallback(() => setOpen(true), []);
return <button onClick={handleClick}>{title}</button>;

// ✅ plain code
const title = `${repo.owner}/${repo.name}`;
return <button onClick={() => setOpen(true)}>{title}</button>;
```

```tsx
// ✅ justified: measured ~8 ms on 5k diff lines, and the result feeds a memoized child
const hunks = useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff]);
return <MemoizedDiffTable hunks={hunks} />;
```

```ts
// ✅ better still: heavy work on the server, cached on the client
// server returns already-parsed hunks; client just caches them
export function usePullHunks(repoId: string, pullNumber: number) {
  return useQuery({
    queryKey: ["pulls", repoId, pullNumber, "hunks"],
    queryFn: () => api.getPullHunks(repoId, pullNumber),
    staleTime: 5 * 60_000, // a PR diff rarely changes within a session
  });
}

// after a mutation: invalidate only what changed
queryClient.invalidateQueries({ queryKey: ["pulls", repoId, pullNumber] });
```

## 14. SEO: metadata, crawling, structured data

```tsx
// ✅ app/layout.tsx — root defaults
export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: { default: "DevDigest", template: "%s · DevDigest" },
  description: "Local-first AI pull-request review.",
};
```

```tsx
// ✅ app/blog/[slug]/page.tsx — unique, dynamic metadata per page
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}
```

```tsx
// ✅ private app screen: keep it out of the index
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};
```

```ts
// ✅ app/robots.ts and app/sitemap.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/settings", "/repos"] },
    sitemap: "https://example.com/sitemap.xml",
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  return posts.map((post) => ({ url: `https://example.com/blog/${post.slug}`, lastModified: post.updatedAt }));
}
```

```tsx
// ✅ JSON-LD from a Server Component, describing only visible content
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.publishedAt,
  }).replace(/</g, "\\u003c") }}
/>
```

```tsx
// ❌ not crawlable, no semantic structure
<div onClick={() => router.push(`/blog/${slug}`)}><div className="title">{title}</div></div>

// ✅ crawlable link, real heading
<article>
  <h2><Link href={`/blog/${slug}`}>{title}</Link></h2>
</article>
```
