/* FutureTabEmpty — Context, Evals and Stats in M2: an empty state that names
   the milestone that fills the tab. Sends no request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, type IconName } from "@devdigest/ui";
import type { FutureTabMessageKey } from "../../constants";

export function FutureTabEmpty({ icon, messageKey }: { icon: IconName; messageKey: FutureTabMessageKey }) {
  const t = useTranslations("skills");
  return <EmptyState icon={icon} title={t(`future.${messageKey}`)} />;
}
