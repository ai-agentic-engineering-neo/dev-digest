"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Onboarding, OnboardingSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { TourCommandRow } from "@/components/tour-command-row";
import { TourPathRow } from "@/components/tour-path-row";
import { TourReadingStep } from "@/components/tour-reading-step";
import { TourSectionCard } from "@/components/tour-section-card";
import { SECTIONS } from "../OnboardingTourView/constants";
import { s } from "./styles";

interface TourSectionsProps {
  tour: Onboarding;
  /** Repo of the tour; undefined until the repo list has loaded. */
  repo?: { full_name: string; default_branch: string };
}

/** The five cards of the tour, in order. Model text only goes through Markdown / MermaidDiagram. */
export function TourSections({ tour, repo }: TourSectionsProps) {
  const t = useTranslations("onboarding");
  const path = { openLabel: t("open"), copiedLabel: t("copied"), repo };
  const empty = (kind: OnboardingSection["kind"]) => <p style={s.empty}>{t(`sections.${kind}.empty`)}</p>;

  return (
    <>
      {tour.sections.map((section, i) => {
        const meta = SECTIONS[i]!;
        return (
          <TourSectionCard
            key={meta.id}
            id={meta.id}
            icon={meta.icon}
            title={t(`sections.${meta.kind}.title`)}
            collapseLabel={t("collapse")}
            expandLabel={t("expand")}
          >
            {section.kind === "architecture" ? (
              <>
                {section.body.trim() ? <Markdown>{section.body}</Markdown> : empty("architecture")}
                {section.diagram ? (
                  <div style={s.diagram}>
                    <MermaidDiagram chart={section.diagram} />
                  </div>
                ) : null}
              </>
            ) : section.kind === "critical_paths" ? (
              section.items.length === 0 ? (
                empty("critical_paths")
              ) : (
                <div style={s.list}>
                  {section.items.map((it) => (
                    <TourPathRow key={it.path} path={it.path} why={it.why} {...path} />
                  ))}
                </div>
              )
            ) : section.kind === "run_locally" ? (
              section.items.length === 0 ? (
                empty("run_locally")
              ) : (
                <div style={s.list}>
                  {section.items.map((it, n) => (
                    <TourCommandRow
                      key={`${n}-${it.command}`}
                      index={n + 1}
                      command={it.command}
                      note={it.note}
                      copyLabel={t("copyCommand")}
                      copiedLabel={t("copied")}
                    />
                  ))}
                </div>
              )
            ) : section.kind === "reading_path" ? (
              section.items.length === 0 ? (
                empty("reading_path")
              ) : (
                <div style={s.steps}>
                  {section.items.map((it, n) => (
                    <TourReadingStep key={it.path} index={n + 1} path={it.path} why={it.why} />
                  ))}
                </div>
              )
            ) : section.items.length === 0 ? (
              empty("first_tasks")
            ) : (
              <div style={s.tasks}>
                {section.items.map((task) => (
                  <div key={task.title} style={s.task}>
                    <h3 style={s.taskTitle}>{task.title}</h3>
                    <p style={s.taskWhy}>{task.why}</p>
                    <div style={s.list}>
                      {task.files.map((f) => (
                        <TourPathRow key={f.path} path={f.path} {...path} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TourSectionCard>
        );
      })}
    </>
  );
}
