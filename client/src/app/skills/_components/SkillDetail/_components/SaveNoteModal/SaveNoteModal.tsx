/* SaveNoteModal — "Save as vN" with an optional change note. Errors from the
   save stay inline here; the modal closes only on success. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import { SKILL_NOTE_MAX } from "@devdigest/shared";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function SaveNoteModal({
  version,
  pending,
  error,
  onSave,
  onClose,
}: {
  version: number;
  pending: boolean;
  error: string | null;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const [note, setNote] = React.useState("");
  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("saveNote.title", { version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("saveNote.cancel")}
          </Button>
          <Button kind="primary" icon="Check" loading={pending} onClick={() => onSave(note)}>
            {pending ? t("saveNote.saving") : t("saveNote.save", { version })}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
        <FormField label={t("saveNote.note")}>
          <TextInput
            value={note}
            onChange={setNote}
            maxLength={SKILL_NOTE_MAX}
            placeholder={t("saveNote.notePlaceholder")}
            data-autofocus
          />
        </FormField>
      </div>
    </Modal>
  );
}
