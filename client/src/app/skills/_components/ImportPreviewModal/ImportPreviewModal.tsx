/* ImportPreviewModal — "Review before importing": the candidate skill from a
   file / URL / community import, BEFORE anything is saved. Shows the source,
   editable name / description / type, the body (rendered or raw), included and
   ignored files, sanitizer warnings and the trust notice. Confirm → POST
   /skills with source + source_ref (stored disabled) → the editor (via
   onCreated when the host must guard the navigation). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Chip, Icon, Markdown, Modal, SectionLabel } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { isValidSkillName, skillHref } from "../../helpers";
import { SkillMetaFields, type SkillMetaValue } from "../SkillMetaFields";
import { SOURCE_LABEL_KEY } from "./constants";
import { ignoreReasonKey } from "./helpers";
import { s } from "./styles";

export function ImportPreviewModal({
  preview,
  onClose,
  onCreated,
}: {
  preview: SkillImportPreview;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const create = useCreateSkill();
  const [meta, setMeta] = React.useState<SkillMetaValue>({
    name: preview.name,
    description: preview.description,
    type: preview.type,
  });
  const [raw, setRaw] = React.useState(false);
  const valid = isValidSkillName(meta.name) && preview.body.trim().length > 0;

  const confirm = () =>
    create.mutate(
      {
        ...meta,
        description: meta.description.trim(),
        body: preview.body,
        source: preview.source,
        source_ref: preview.source_ref,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("importPreview.imported", { name: skill.name }));
          onClose();
          if (onCreated) onCreated(skill.id);
          else router.push(skillHref(skill.id));
        },
      },
    );

  return (
    <Modal
      width={760}
      title={t("importPreview.title")}
      subtitle={
        <span style={s.source}>
          <Badge color="var(--text-secondary)">{t(SOURCE_LABEL_KEY[preview.source])}</Badge>
          <span className="mono" style={s.sourceRef}>
            {preview.source_ref}
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("importPreview.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={confirm} disabled={!valid || create.isPending}>
            {create.isPending ? t("importPreview.importing") : t("importPreview.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div role="note" style={s.trust}>
          <Icon.Shield size={16} style={s.trustIcon} />
          <span>{t.rich("importPreview.trust", { b: (chunks) => <strong>{chunks}</strong> })}</span>
        </div>

        <SkillMetaFields value={meta} onChange={(key, v) => setMeta((m) => ({ ...m, [key]: v }))} />

        <SectionLabel
          icon="FileText"
          right={
            <span style={s.chips}>
              <Chip active={!raw} onClick={() => setRaw(false)}>
                {t("importPreview.rendered")}
              </Chip>
              <Chip active={raw} onClick={() => setRaw(true)}>
                {t("importPreview.raw")}
              </Chip>
            </span>
          }
        >
          {t("importPreview.body")}
        </SectionLabel>
        <div style={s.bodyBox}>
          {raw ? (
            <pre className="mono" style={s.raw}>
              {preview.body}
            </pre>
          ) : (
            <Markdown>{preview.body}</Markdown>
          )}
        </div>

        {preview.included_files.length > 0 && (
          <section style={s.section}>
            <SectionLabel icon="Check">{t("importPreview.included")}</SectionLabel>
            <ul style={s.list}>
              {preview.included_files.map((f) => (
                <li key={f} className="mono" style={s.included}>
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {preview.ignored_files.length > 0 && (
          <section style={s.section}>
            <SectionLabel icon="EyeOff">{t("importPreview.ignored")}</SectionLabel>
            <ul style={s.list}>
              {preview.ignored_files.map((f) => (
                <li key={f.path} className="mono" style={s.ignored}>
                  {t("importPreview.ignoredRow", {
                    path: f.path,
                    reason: t(ignoreReasonKey(f.reason), { reason: f.reason }),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {preview.warnings.length > 0 && (
          <section style={s.section}>
            <SectionLabel icon="AlertTriangle">{t("importPreview.warnings")}</SectionLabel>
            <ul style={s.list}>
              {preview.warnings.map((w) => (
                <li key={w} style={s.warning}>
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
