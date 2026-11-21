/* ProjectGraphView — /repos/:repoId/graph (specs/18-dependency-graph.md).
   Overview → directory expand → file drill-down on a bounded canvas, plus the
   non-visual equivalents (cycles, index/coverage, sortable file table).
   Every server response carries an explicit `state`; this view branches on it. */
"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Flame, RefreshCw } from "lucide-react";
import type { ProjectGraphFileSort, ProjectGraphReady } from "@devdigest/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { GraphCanvasLazy, LiveRegion, type BannerCondition, type GraphRoleDef } from "@/components/graph-canvas";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useProjectGraph } from "@/lib/hooks/project-graph";
import { ApiError } from "@/lib/api";
import { CyclesPanel } from "./CyclesPanel";
import { FilesTable, TABLE_ID } from "./FilesTable";
import { IndexPanel } from "./IndexPanel";
import { SymbolsPanel } from "./SymbolsPanel";
import { crumbsOf, parentDir, toCanvas } from "./helpers";
import { s } from "./styles";

export function ProjectGraphView() {
  const t = useTranslations("projectGraph");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // Focus: at most one of dir / file (the API answers 422 for both).
  const [focus, setFocus] = useState<{ dir: string | null; file: string | null }>({ dir: null, file: null });
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [sort, setSort] = useState<ProjectGraphFileSort>("path");

  const { data, isLoading, isError, error, refetch } = useProjectGraph(repoId, focus);

  const repoName = activeRepo?.full_name ?? repoId ?? t("repoFallback");
  const crumb = [{ label: repoName, mono: true }, { label: t("crumb") }];

  const roles = useMemo<Record<string, GraphRoleDef>>(
    () => ({
      hot: { label: t("role.hot"), shape: "diamond", icon: Flame },
      cycle: { label: t("role.cycle"), shape: "hexagon", icon: RefreshCw },
    }),
    [t],
  );

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  function go(next: { dir: string | null; file: string | null }) {
    setFocus(next);
    setHighlighted(null);
    setTablePage(1);
  }

  const header = (
    <div style={s.pageHeader}>
      <h1 style={s.pageTitle}>{t("title")}</h1>
      <p style={s.pageSubtitle}>{t("subtitle")}</p>
    </div>
  );

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div style={s.stack} aria-busy="true" aria-label={t("loading")}>
        <Skeleton height={40} />
        <Skeleton height={320} />
      </div>
    );
  } else if (isError) {
    content = (
      <ErrorState
        title={t("loadError.title")}
        body={error instanceof ApiError ? error.message : t("loadError.title")}
        onRetry={() => refetch()}
      />
    );
  } else if (!data) {
    content = null;
  } else if (data.state === "empty") {
    content = (
      <div style={s.body}>
        <EmptyState icon="GitBranch" title={t(`empty.${data.reason}.title`)} body={t(`empty.${data.reason}.body`)} />
        <LiveRegion message={t("announce.empty")} />
      </div>
    );
  } else if (data.state === "reindexing") {
    const { done, total, state } = data.reindexing;
    content = (
      <div style={s.body}>
        <section style={s.panel} role="status">
          <h2 style={s.panelTitle}>{t("reindexing.title")}</h2>
          <p>{t("reindexing.body")}</p>
          <div style={s.row}>
            <strong>{t(`reindexing.${state}`)}</strong>
            <progress aria-label={t("reindexing.progressLabel")} value={done} max={Math.max(total, 1)} />
            <span style={s.muted}>{t("reindexing.progress", { done, total })}</span>
          </div>
        </section>
      </div>
    );
  } else {
    content = (
      <ReadyGraph
        repoId={repoId}
        graph={data}
        roles={roles}
        highlighted={highlighted}
        onHighlight={setHighlighted}
        onGo={go}
        tablePage={tablePage}
        sort={sort}
        onTablePage={setTablePage}
        onSort={(next) => {
          setSort(next);
          setTablePage(1);
        }}
      />
    );
  }

  return (
    <AppShell crumb={crumb}>
      {header}
      {content}
    </AppShell>
  );
}

function ReadyGraph({
  repoId,
  graph,
  roles,
  highlighted,
  onHighlight,
  onGo,
  tablePage,
  sort,
  onTablePage,
  onSort,
}: {
  repoId: string;
  graph: ProjectGraphReady;
  roles: Record<string, GraphRoleDef>;
  highlighted: number | null;
  onHighlight: (i: number | null) => void;
  onGo: (f: { dir: string | null; file: string | null }) => void;
  tablePage: number;
  sort: ProjectGraphFileSort;
  onTablePage: (p: number) => void;
  onSort: (s: ProjectGraphFileSort) => void;
}) {
  const t = useTranslations("projectGraph");
  const { focus } = graph;

  const highlightSet = useMemo(
    () => (highlighted != null && graph.cycles.items[highlighted] ? new Set(graph.cycles.items[highlighted].members) : null),
    [highlighted, graph.cycles.items],
  );
  const canvas = useMemo(
    () =>
      toCanvas(graph, {
        highlight: highlightSet,
        tags: {
          hot: t("tag.hot"),
          cycle: t("tag.cycle"),
          files: (count) => t("tag.files", { count }),
          aggregate: t("tag.aggregate"),
          exported: t("tag.exported"),
        },
      }),
    [graph, highlightSet, t],
  );

  const banners: BannerCondition[] = [];
  const tr = graph.truncation;
  if (tr.truncated) {
    banners.push({
      id: "truncated",
      tone: "warning",
      text: t("banner.truncated", {
        nodes: tr.nodesDropped,
        edges: tr.edgesDropped,
        maxNodes: tr.maxNodes,
        maxEdges: tr.maxEdges,
      }),
      stats: [
        { label: t("banner.nodesDropped"), value: tr.nodesDropped },
        { label: t("banner.edgesDropped"), value: tr.edgesDropped },
      ],
    });
  }
  if (graph.index.status === "partial") banners.push({ id: "partial", tone: "warning", text: t("banner.partial") });
  if (graph.index.status === "degraded") banners.push({ id: "degraded", tone: "warning", text: t("banner.degraded") });

  const scopePath = focus.file ?? focus.dir;
  const announcement = t(`announce.${focus.mode}`, {
    path: scopePath ?? "",
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  });

  function onSelect(id: string) {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.kind === "directory") onGo({ dir: n.path, file: null });
    else if (n.kind === "file") onGo({ dir: null, file: n.path });
  }

  const crumbDir = focus.file ? parentDir(focus.file) : focus.dir;
  const parent = focus.file ? parentDir(focus.file) : focus.dir ? parentDir(focus.dir) : null;
  const tableDir = focus.file ? null : focus.dir;

  return (
    <div style={s.body}>
      <nav aria-label={t("nav.label")} style={s.row}>
        {focus.mode !== "overview" && (
          <Button size="sm" icon="ChevronLeft" onClick={() => onGo({ dir: parent, file: null })}>
            {t("nav.back")}
          </Button>
        )}
        <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: 0, flexWrap: "wrap" }}>
          <li>
            <button type="button" style={s.linkBtn} onClick={() => onGo({ dir: null, file: null })}>
              {t("nav.overview")}
            </button>
          </li>
          {crumbsOf(crumbDir).map((c) => (
            <li key={c.path}>
              <span aria-hidden="true">/ </span>
              <button type="button" style={{ ...s.linkBtn, ...s.mono }} onClick={() => onGo({ dir: c.path, file: null })}>
                {c.label}
              </button>
            </li>
          ))}
          {focus.file && (
            <li aria-current="page" style={s.mono}>
              <span aria-hidden="true">/ </span>
              {focus.file.split("/").pop()}
            </li>
          )}
        </ol>
        <a href={`#${TABLE_ID}`} style={s.muted}>
          {t("table.skip")}
        </a>
      </nav>
      <p style={s.muted}>{t("canvas.hint")}</p>

      <GraphCanvasLazy
        nodes={canvas.nodes}
        edges={canvas.edges}
        ariaLabel={t("canvas.label", { scope: scopePath ?? t("canvas.scopeOverview") })}
        onSelect={onSelect}
        roles={roles}
        banners={banners}
        announcement={announcement}
        height={520}
      />

      {focus.file && <SymbolsPanel key={focus.file} repoId={repoId} file={focus.file} />}

      <div style={s.grid2}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CyclesPanel cycles={graph.cycles} hotFiles={graph.hotFiles} highlighted={highlighted} onHighlight={onHighlight} />
        </div>
        <IndexPanel repoId={repoId} index={graph.index} />
      </div>

      <FilesTable
        repoId={repoId}
        dir={tableDir}
        page={tablePage}
        sort={sort}
        onPage={onTablePage}
        onSort={onSort}
        onOpenFile={(path) => onGo({ dir: null, file: path })}
      />
    </div>
  );
}

export default ProjectGraphView;
