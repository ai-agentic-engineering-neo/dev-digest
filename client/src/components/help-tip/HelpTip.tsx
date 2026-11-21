/* HelpTip — an InfoTip whose copy lives in messages/en/help.json under
   `<topic>.{title,what,why,how}` (what/why/how are each optional). One place
   for all the "what is this, why do I care, how do I use it" explanations. */
"use client";

import { useTranslations } from "next-intl";
import { InfoTip, type InfoTipSection } from "@devdigest/ui";

const PARTS = ["what", "why", "how"] as const;

export function HelpTip({ topic, size }: { topic: string; size?: number }) {
  const t = useTranslations("help");
  const title = t(`${topic}.title`);
  const sections: InfoTipSection[] = PARTS.filter((p) => t.has(`${topic}.${p}`)).map((p) => ({
    label: t(`labels.${p}`),
    text: t(`${topic}.${p}`),
  }));
  return <InfoTip label={t("labels.about", { title })} title={title} sections={sections} size={size} />;
}
