"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useSkillAgents, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "../../../../constants";
import { isValidSkillName } from "../../../../helpers";
import { s } from "./styles";

const VERSION_MESSAGE_MAX = 200;

/**
 * Config tab — name/description/type/body + the skill's own kill switch.
 * The `Enabled` toggle issues its own PATCH so it never rides along with a
 * body/name/description/type change and never bumps the version (§5.2).
 */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [versionMessage, setVersionMessage] = React.useState("");
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // Only asked for once the confirmation is open — the same lazy read the
  // rail's delete flow does (§5.4).
  const { data: linkedAgents } = useSkillAgents(confirmingDelete ? skill.id : undefined);

  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setVersionMessage("");
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameValid = isValidSkillName(name);
  const dirty =
    name !== skill.name || description !== skill.description || type !== skill.type || body !== skill.body;
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const lines = body.split("\n");

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  const onToggleEnabled = (v: boolean) => {
    setEnabled(v);
    update.mutate({ id: skill.id, patch: { enabled: v } });
  };

  /** Back to the saved record — the same values the skill-switch effect resets to. */
  const cancel = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setVersionMessage("");
  };

  const confirmDelete = () => {
    del.mutate(skill.id, {
      onSuccess: () => {
        setConfirmingDelete(false);
        router.push("/skills");
      },
    });
  };

  const save = () => {
    if (!nameValid) return;
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, version_message: versionMessage.trim() || undefined } },
      {
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setVersionMessage("");
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h2 style={s.h2}>{t("config.title")}</h2>
          <Badge icon="GitCommit" mono bg="transparent" style={s.versionChip}>
            {t("preview.version", { version: skill.version })}
          </Badge>
        </div>
        <label style={s.enabledLabel}>
          {t("preview.enabled")}
          <Toggle on={enabled} onChange={onToggleEnabled} size={16} />
        </label>
      </div>

      {skill.source !== "manual" && (
        <div style={s.trustNotice}>
          <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <FormField label={t("newSkill.fields.name")} required>
        <TextInput value={name} onChange={setName} mono placeholder={t("file.namePlaceholder")} />
        {!nameValid && <div style={s.slugError}>{t("newSkill.slugError")}</div>}
      </FormField>

      <FormField label={t("newSkill.fields.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      <FormField label={t("newSkill.fields.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} mono={false} />
      </FormField>

      <FormField
        label={t("file.bodyLabel")}
        required
        right={
          <div style={s.metaRow}>
            {dirty && <Badge color="var(--warn)">{t("config.unsaved")}</Badge>}
            <Badge mono>{t("config.tokenCount", { count: skill.token_estimate })}</Badge>
          </div>
        }
      >
        <div style={s.editorRow}>
          <div ref={gutterRef} style={s.gutter}>
            {lines.map((_, i) => (
              <div key={i} style={s.lineNo}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={taRef}
            className="mono"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            rows={Math.max(lines.length, 10)}
            style={s.textarea}
          />
        </div>
      </FormField>

      <FormField label={t("config.versionMessage")} hint={t("config.versionMessageHint")}>
        <TextInput
          value={versionMessage}
          onChange={(v) => setVersionMessage(v.slice(0, VERSION_MESSAGE_MAX))}
          placeholder={t("config.versionMessagePlaceholder")}
        />
      </FormField>

      <div style={s.actions}>
        <div style={s.actionButtons}>
          <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !nameValid}>
            {update.isPending ? t("config.saving") : t("config.save")}
          </Button>
          <Button kind="secondary" onClick={cancel} disabled={!dirty}>
            {t("config.cancel")}
          </Button>
        </div>
        {dirty && (
          <span style={s.snapshotHint}>{t("config.willSnapshotAs", { version: skill.version + 1 })}</span>
        )}
      </div>

      <div style={s.divider} />

      <div style={s.dangerZone}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.dangerZoneTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerZoneBody")}</div>
        </div>
        <Button kind="danger" icon="Trash" onClick={() => setConfirmingDelete(true)}>
          {t("config.dangerZoneTitle")}
        </Button>
      </div>

      {confirmingDelete && (
        <Modal
          title={t("delete.title", { name: skill.name })}
          onClose={() => setConfirmingDelete(false)}
          footer={
            <div style={s.deleteFooter}>
              <Button kind="ghost" onClick={() => setConfirmingDelete(false)}>
                {t("delete.cancel")}
              </Button>
              <Button kind="danger" onClick={confirmDelete} disabled={del.isPending}>
                {t("delete.confirm")}
              </Button>
            </div>
          }
        >
          <div style={s.deleteBody}>
            {linkedAgents && linkedAgents.length > 0
              ? t("delete.usedByWarning", { agents: linkedAgents.map((a) => a.name).join(", ") })
              : t("delete.noAgents")}
          </div>
        </Modal>
      )}
    </div>
  );
}
