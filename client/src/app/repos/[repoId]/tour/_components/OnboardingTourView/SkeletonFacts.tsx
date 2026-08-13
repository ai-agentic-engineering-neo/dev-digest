"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingFacts } from "@devdigest/shared";
import { SetupSteps } from "./SetupSteps";
import { s } from "./styles";

const SKELETON_RANKED_FILES_SHOWN = 10;

/**
 * AC-33/AC-35: the deterministic, facts-only rendering — no prose narrative,
 * no diagram, ever. Presents exactly the same four fact groups a generated
 * tour's facts panel would (stack, ranked files, setup steps, detected
 * routes), each attributable to its evidence file — the ONE renderer the
 * server uses for both a skeleton and a stored tour (render.ts's
 * `renderFacts`) means this can never describe different facts than what a
 * tour built from the same index would.
 */
export function SkeletonFacts({ facts }: { facts: OnboardingFacts }) {
  const t = useTranslations("onboarding");
  const { stack, ranked_files, setup_steps, routes } = facts;
  const frameworks = stack.frameworks ?? [];
  const shownFiles = ranked_files.slice(0, SKELETON_RANKED_FILES_SHOWN);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={s.skeletonGroup}>
        <div style={s.skeletonGroupTitle}>{t("skeleton.stack")}</div>
        {stack.language && (
          <div style={s.factRow}>
            <span style={s.factLabel}>{t("skeleton.language")}</span>
            <span style={s.factValue}>{stack.language.value}</span>
            <span style={s.factEvidence}>{stack.language.evidence_file}</span>
          </div>
        )}
        {stack.runtime && (
          <div style={s.factRow}>
            <span style={s.factLabel}>{t("skeleton.runtime")}</span>
            <span style={s.factValue}>{stack.runtime.value}</span>
            <span style={s.factEvidence}>{stack.runtime.evidence_file}</span>
          </div>
        )}
        {stack.package_manager && (
          <div style={s.factRow}>
            <span style={s.factLabel}>{t("skeleton.packageManager")}</span>
            <span style={s.factValue}>{stack.package_manager.value}</span>
            <span style={s.factEvidence}>{stack.package_manager.evidence_file}</span>
          </div>
        )}
        {frameworks.map((f) => (
          <div key={f.value} style={s.factRow}>
            <span style={s.factLabel}>{t("skeleton.framework")}</span>
            <span style={s.factValue}>{f.value}</span>
            <span style={s.factEvidence}>{f.evidence_file}</span>
          </div>
        ))}
        {!stack.language && !stack.runtime && !stack.package_manager && frameworks.length === 0 && (
          <p style={s.empty}>{t("skeleton.noStack")}</p>
        )}
      </div>

      <div style={s.skeletonGroup}>
        <div style={s.skeletonGroupTitle}>{t("skeleton.rankedFiles")}</div>
        {shownFiles.length === 0 ? (
          <p style={s.empty}>{t("skeleton.noRankedFiles")}</p>
        ) : (
          shownFiles.map((f) => (
            <div key={f.path} style={s.factRow}>
              <span className="mono" style={{ ...s.factValue, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.path}
              </span>
              <span className="tnum" style={s.factEvidence}>
                {t("skeleton.weighted", { value: f.weighted.toFixed(3) })}
              </span>
            </div>
          ))
        )}
      </div>

      <div style={s.skeletonGroup}>
        <div style={s.skeletonGroupTitle}>{t("skeleton.setupSteps")}</div>
        <SetupSteps steps={setup_steps} />
      </div>

      <div style={s.skeletonGroup}>
        <div style={s.skeletonGroupTitle}>{t("skeleton.routes")}</div>
        {routes.length === 0 ? (
          <p style={s.empty}>{t("skeleton.noRoutes")}</p>
        ) : (
          routes.map((r) => (
            <div key={r.file} style={s.factRow}>
              <span className="mono" style={{ ...s.factValue, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.file}
              </span>
              <span style={s.factEvidence}>
                {[...r.endpoints, ...r.crons].join(", ")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
