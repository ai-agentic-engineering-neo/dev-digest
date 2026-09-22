import { describe, it, expect, afterEach } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { renderHookWithProviders, cleanup, act, waitFor } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import { agentKeys, skillKeys } from "./keys";
import { communityQuery, useSetAgentSkills, useToggleSkill, useUpdateSkill } from "./skills";

afterEach(cleanup);

describe("useToggleSkill", () => {
  it("flips enabled in list + detail at once and keeps the server result", async () => {
    const skill = makeSkill();
    mockFetch({ "PUT /skills/sk1": (req) => ({ ...skill, ...(req.body as object) }) });
    const { result, queryClient } = renderHookWithProviders(() => useToggleSkill());
    queryClient.setQueryData(skillKeys.list(), [skill]);
    queryClient.setQueryData(skillKeys.detail("sk1"), skill);

    act(() => result.current.mutate({ id: "sk1", enabled: false }));
    await waitFor(() => expect(queryClient.getQueryData<Skill[]>(skillKeys.list())?.[0]?.enabled).toBe(false));
    expect(queryClient.getQueryData<Skill>(skillKeys.detail("sk1"))?.enabled).toBe(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<Skill[]>(skillKeys.list())?.[0]?.enabled).toBe(false);
  });

  it("rolls the switch back when the PUT fails", async () => {
    const skill = makeSkill();
    mockFetch({ "PUT /skills/sk1": jsonResponse({ error: { code: "internal", message: "boom" } }, 500) });
    const { result, queryClient } = renderHookWithProviders(() => useToggleSkill());
    queryClient.setQueryData(skillKeys.list(), [skill]);

    act(() => result.current.mutate({ id: "sk1", enabled: false }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<Skill[]>(skillKeys.list())?.[0]?.enabled).toBe(true);
  });
});

describe("useUpdateSkill", () => {
  it("refetches the live skill after a 409 stale_version", async () => {
    const api = mockFetch({
      "PUT /skills/sk1": jsonResponse({ error: { code: "stale_version", message: "stale" } }, 409),
      "GET /skills/sk1": makeSkill({ version: 6 }),
    });
    const { result, queryClient } = renderHookWithProviders(() => useUpdateSkill());
    queryClient.setQueryData(skillKeys.detail("sk1"), makeSkill());
    act(() => result.current.mutate({ id: "sk1", patch: { body: "x", base_version: 5 } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(skillKeys.detail("sk1"))?.isInvalidated).toBe(true);
    expect(api.requests("PUT", "/skills/sk1")).toHaveLength(1);
  });
});

describe("useSetAgentSkills", () => {
  const links = (ids: string[]): AgentSkillLink[] => ids.map((skill_id, order) => ({ agent_id: "ag1", skill_id, order }));

  it("writes the new order optimistically and sends the full id list", async () => {
    const api = mockFetch({ "POST /agents/ag1/skills": (req) => links((req.body as { skill_ids: string[] }).skill_ids) });
    const { result, queryClient } = renderHookWithProviders(() => useSetAgentSkills("ag1"));
    queryClient.setQueryData(agentKeys.skills("ag1"), links(["a", "b"]));

    act(() => result.current.mutate(["b", "a"]));
    await waitFor(() =>
      expect(queryClient.getQueryData<AgentSkillLink[]>(agentKeys.skills("ag1"))?.map((l) => l.skill_id)).toEqual(["b", "a"]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.requests("POST", "/agents/ag1/skills")[0]?.body).toEqual({ skill_ids: ["b", "a"] });
  });

  it("restores the previous links when the POST fails", async () => {
    mockFetch({ "POST /agents/ag1/skills": jsonResponse({ error: { code: "unknown_skill", message: "no" } }, 422) });
    const { result, queryClient } = renderHookWithProviders(() => useSetAgentSkills("ag1"));
    queryClient.setQueryData(agentKeys.skills("ag1"), links(["a", "b"]));

    act(() => result.current.mutate(["b"]));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<AgentSkillLink[]>(agentKeys.skills("ag1"))?.map((l) => l.skill_id)).toEqual(["a", "b"]);
  });
});

describe("communityQuery", () => {
  it("keeps only non-empty filters", () => {
    expect(communityQuery({})).toBe("");
    expect(communityQuery({ q: " sec ", tag: "", lang: "ts" })).toBe("?q=sec&lang=ts");
  });
});
