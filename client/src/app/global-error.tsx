/* Last-resort boundary: replaces the root layout, so it renders its own
   <html>/<body> and cannot use the intl or query providers. Text is read
   straight from the English message file instead of useTranslations. */
"use client";

import React from "react";
import { ErrorState } from "@devdigest/ui";
import messages from "../../messages/en/common.json";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark" data-density="regular">
      <body>
        <ErrorState fullScreen title={messages.errorPage.title} body={messages.errorPage.body} onRetry={reset} />
      </body>
    </html>
  );
}
