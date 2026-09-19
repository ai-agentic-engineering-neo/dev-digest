/* AgentSelectList — checkbox rows inside the RunReviewDropdown menu.
   Lets a user pick a subset of agents and run only those, while each row's
   name stays individually clickable (unchanged "run this one now" behavior). */
"use client";

import { Button, Checkbox } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";

export function AgentSelectList({
  agents,
  selected,
  onToggle,
  onRunOne,
  onRunSelected,
  runSelectedLabel,
}: {
  agents: Agent[];
  selected: Set<string>;
  onToggle: (agentId: string) => void;
  onRunOne: (agentId: string) => void;
  onRunSelected: () => void;
  runSelectedLabel: (count: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 4px" }}>
      {agents.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 6px",
            borderRadius: 6,
          }}
        >
          <Checkbox checked={selected.has(a.id)} onChange={() => onToggle(a.id)} />
          <button
            type="button"
            onClick={() => onRunOne(a.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {a.enabled ? a.model : `${a.model} · disabled`}
            </span>
          </button>
        </div>
      ))}
      <Button
        kind="secondary"
        size="sm"
        full
        disabled={selected.size === 0}
        onClick={onRunSelected}
        style={{ marginTop: 4 }}
      >
        {runSelectedLabel(selected.size)}
      </Button>
    </div>
  );
}
