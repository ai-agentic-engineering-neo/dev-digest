/* ConventionCard — one extracted rule: category, rule text (inline edit),
   verified evidence (path:lines + the real file lines, copyable), confidence
   bar, and the Accept / Reject column. Clicking the active decision again
   resets the rule to pending. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, SelectInput, Textarea } from "@devdigest/ui";
import type { Convention, ConventionCategory, ConventionEvidence, ConventionStatus } from "@devdigest/shared";
import { CONVENTION_RULE_MAX } from "@devdigest/shared";
import { skillHref } from "@/app/skills/helpers";
import { CONVENTION_CATEGORIES } from "../../constants";
import { confidenceTone, evidenceLabel, nextStatus } from "../../helpers";
import { s, TONE_COLOR } from "./styles";

export interface ConventionEdit {
  rule: string;
  category: ConventionCategory;
}

function EvidenceBlock({ evidence }: { evidence: ConventionEvidence }) {
  const t = useTranslations("conventions");
  return (
    <div style={s.evidence}>
      <div style={s.evidenceHead}>
        <span className="mono" style={s.evidencePath}>
          {evidenceLabel(evidence)}
        </span>
        <IconBtn icon="Copy" label={t("card.copy")} size={26} onClick={() => void navigator.clipboard?.writeText(evidence.snippet)} />
      </div>
      <pre className="mono" style={s.snippet}>
        {evidence.snippet}
      </pre>
    </div>
  );
}

function EditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ConventionEdit;
  onSave: (edit: ConventionEdit) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("conventions");
  const [draft, setDraft] = React.useState(initial);
  const rule = draft.rule.trim();
  const changed = rule !== initial.rule || draft.category !== initial.category;
  const options = CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }));
  return (
    <div style={s.editForm}>
      <Textarea value={draft.rule} onChange={(v) => setDraft((d) => ({ ...d, rule: v.slice(0, CONVENTION_RULE_MAX) }))} rows={2} />
      <SelectInput
        value={draft.category}
        onChange={(v) => setDraft((d) => ({ ...d, category: v as ConventionCategory }))}
        options={options}
        mono={false}
      />
      <div style={s.editRow}>
        <Button kind="ghost" size="sm" onClick={onCancel}>
          {t("card.cancel")}
        </Button>
        <Button kind="primary" size="sm" disabled={!rule || !changed} onClick={() => onSave({ rule, category: draft.category })}>
          {t("card.save")}
        </Button>
      </div>
    </div>
  );
}

export function ConventionCard({
  convention: c,
  skillName,
  onDecide,
  onEdit,
}: {
  convention: Convention;
  /** Name of the skill the rule was merged into (when `skill_id` is set and known). */
  skillName?: string;
  onDecide: (status: ConventionStatus) => void;
  onEdit: (edit: ConventionEdit) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [primary, ...more] = c.evidence;
  const pct = Math.round(c.confidence * 100);
  const accepted = c.status === "accepted";
  const rejected = c.status === "rejected";

  return (
    <article style={s.card(c.status)} aria-label={c.rule} data-testid="convention-card" data-status={c.status}>
      <div style={s.main}>
        <div style={s.meta}>
          <Badge>{t(`category.${c.category}`)}</Badge>
          {c.edited && <span style={s.muted}>{t("card.edited")}</span>}
          {c.skill_id && skillName && (
            <Link href={skillHref(c.skill_id)} style={s.skillLink}>
              {t("card.inSkill", { name: skillName })}
            </Link>
          )}
        </div>
        {editing ? (
          <EditForm
            initial={{ rule: c.rule, category: c.category }}
            onCancel={() => setEditing(false)}
            onSave={(edit) => {
              onEdit(edit);
              setEditing(false);
            }}
          />
        ) : (
          <div style={s.titleRow}>
            <div style={s.rule}>{c.rule}</div>
          </div>
        )}
        {primary && <EvidenceBlock evidence={primary} />}
        {showAll && more.map((e) => <EvidenceBlock key={evidenceLabel(e)} evidence={e} />)}
        {more.length > 0 && (
          <button type="button" style={s.moreBtn} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? t("card.fewerPlaces") : t("card.morePlaces", { count: more.length })}
          </button>
        )}
        <div style={s.confidence}>
          <span>{t("card.confidence")}</span>
          <div style={s.track} role="meter" aria-label={t("card.confidence")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={s.fill(pct, TONE_COLOR[confidenceTone(c.confidence)])} />
          </div>
          <span className="tnum" style={s.pct}>
            {pct}%
          </span>
        </div>
      </div>
      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={accepted}
          onClick={() => onDecide(nextStatus(c.status, "accepted"))}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          icon="X"
          full
          aria-pressed={rejected}
          onClick={() => onDecide(nextStatus(c.status, "rejected"))}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
        {/* Third action of the card (AC 47); edits the rule in place. */}
        <Button
          kind="ghost"
          icon="Edit"
          full
          aria-label={t("card.editLabel")}
          aria-expanded={editing}
          disabled={editing}
          onClick={() => setEditing(true)}
        >
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
