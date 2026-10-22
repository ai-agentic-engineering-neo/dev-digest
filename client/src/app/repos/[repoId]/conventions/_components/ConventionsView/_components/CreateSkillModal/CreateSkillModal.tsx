/* CreateSkillModal — merge accepted conventions into one `convention` skill.
   Prefilled from the candidates; every field is editable before saving. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Toggle } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { SkillFields, isSkillValid, type SkillFieldValues } from "@/app/skills/_components/SkillFields";
import { renderConventionsSkillBodyPreview, suggestSkillName } from "./helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoName,
  accepted,
  onClose,
}: {
  repoId: string;
  repoName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions.modal");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkillFromConventions(repoId);

  const [draft, setDraft] = React.useState<SkillFieldValues>(() => {
    const name = suggestSkillName(repoName);
    return {
      name,
      description: t("descriptionDefault", { count: accepted.length, repo: repoName }),
      type: "convention",
      body: renderConventionsSkillBodyPreview(name, repoName, accepted),
    };
  });
  const [enabled, setEnabled] = React.useState(true);
  // The body tracks the name (its `# heading`) until the user edits the body itself.
  const [bodyEdited, setBodyEdited] = React.useState(false);

  const onChange = (next: SkillFieldValues) => {
    if (next.body !== draft.body) {
      setBodyEdited(true);
      setDraft(next);
    } else if (!bodyEdited && next.name !== draft.name) {
      setDraft({ ...next, body: renderConventionsSkillBodyPreview(next.name.trim() || "skill", repoName, accepted) });
    } else {
      setDraft(next);
    }
  };

  const submit = () =>
    create.mutate(
      {
        convention_ids: accepted.map((c) => c.id),
        name: draft.name.trim(),
        description: draft.description,
        enabled,
        body: draft.body,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("createdToast", { name: skill.name }));
          onClose();
          router.push(`/skills/${skill.id}`);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : t("failed")),
      },
    );

  return (
    <Modal
      width={760}
      title={t("title")}
      subtitle={<span className="mono">{draft.name || suggestSkillName(repoName)}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("footer")}
          </span>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            loading={create.isPending}
            disabled={!isSkillValid(draft) || create.isPending}
          >
            {create.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Wrench size={15} style={s.bannerIcon} />
          <span>
            {t.rich("banner", {
              count: accepted.length,
              repo: repoName,
              b: (chunks) => <b>{chunks}</b>,
              code: (chunks) => (
                <span className="mono" style={s.bannerRepo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>
        <SkillFields value={draft} onChange={onChange} bodyRows={14} showBodyHint={false} />
        <div style={s.enabledRow}>
          <Toggle on={enabled} onChange={setEnabled} />
          <div style={s.enabledText}>
            <span style={s.enabledLabel}>{t("enabledLabel")}</span>
            <span style={s.enabledHint}>{t("enabledHint")}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
