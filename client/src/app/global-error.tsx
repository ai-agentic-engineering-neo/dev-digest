/* Last-resort boundary for errors thrown by the root layout itself. It replaces
   the layout, so there is no NextIntlClientProvider here — strings are read from
   the messages file directly. */
"use client";

import { useEffect } from "react";
import { ErrorState } from "@devdigest/ui";
import common from "../../messages/en/common.json";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en" data-theme="dark" data-density="regular">
      <body>
        <ErrorState fullScreen title={common.errorPage.title} body={common.errorPage.body} onRetry={reset} />
      </body>
    </html>
  );
}
