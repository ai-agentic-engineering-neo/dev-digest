# Before / after examples

## Contents
- Thin route
- Logic out of the component
- Data access through hooks
- Constants and copy
- Imports and public API
- Server/client boundary

## Thin route

```tsx
// ❌ app/agents/page.tsx — fetches, filters and renders the whole screen
"use client";
export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => { fetch(`${API}/agents`).then(r => r.json()).then(setAgents); }, []);
  return <div>{agents.filter(a => a.enabled).map(a => <div key={a.id}>…</div>)}</div>;
}

// ✅ app/agents/page.tsx — server component, wiring only
import { AgentsListView } from "./_components/AgentsListView";
export default function AgentsPage() {
  return <AgentsListView />;
}
```

## Logic out of the component

```tsx
// ❌ rule buried in JSX
{findings.filter(f => f.status !== "dismissed")
  .sort((a, b) => SEV[b.severity] - SEV[a.severity]).map(…)}

// ✅ FindingsPanel/helpers.ts — pure, tested in helpers.test.ts
export function visibleFindings(list: FindingRecord[]): FindingRecord[] {
  return list
    .filter((f) => f.status !== "dismissed")
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
// FindingsPanel.tsx
const items = visibleFindings(findings);
```

Stateful flow → custom hook in the component folder:

```tsx
// CreateAgentModal/useCreateAgentForm.ts
export function useCreateAgentForm(onDone: () => void) {
  const create = useCreateAgent();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const submit = () => create.mutate(toCreateInput(draft), { onSuccess: onDone });
  return { draft, setDraft, submit, pending: create.isPending, error: create.error };
}
```

## Data access through hooks

```tsx
// ❌ component talks to the API
const del = () => api.del(`/agents/${id}`).then(() => qc.invalidateQueries());

// ✅ lib/hooks/agents.ts owns key + invalidation
export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
// component
const del = useDeleteAgent();
del.mutate(ag.id);
```

## Constants and copy

```tsx
// ❌
<span style={{ color: model === "gpt-4o" ? "#10b981" : "#999" }}>Delete agent?</span>

// ✅ constants.ts
export const MODEL_COLOR: Record<string, string> = { "gpt-4o": "#10b981" };
// helpers.ts
export const modelColor = (m: string) => MODEL_COLOR[m] ?? "var(--text-secondary)";
// AgentCard.tsx — text from messages/en/agents.json
<span style={{ color: modelColor(ag.model) }}>{t("deleteConfirm")}</span>
```

## Imports and public API

```ts
// ❌ deep relative + reaching into another folder's internals
import { useAgents } from "../../../../../lib/hooks/agents";
import { fileKey } from "@/components/diff-viewer/helpers";

// ✅ aliases + index.ts
import { useAgents } from "@/lib/hooks";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
// inside the same folder: relative
import { s } from "./styles";
```

## Server/client boundary

```tsx
// ✅ page stays a Server Component; interactivity lives in the leaf
// app/repos/[repoId]/pulls/page.tsx
export default async function PullsPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <PullsView repoId={repoId} />;   // PullsView.tsx starts with "use client"
}
```
