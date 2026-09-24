"use client";

import { ErrorState } from "@devdigest/ui";
import common from "../../messages/en/common.json";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

/* Last-resort boundary for errors in the root layout itself. It replaces the
   layout, so no intl provider is mounted: copy comes straight from the `common`
   namespace file. Must render its own <html>/<body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={fontVariables} data-theme="dark" data-density="regular">
      <body>
        <ErrorState
          fullScreen
          title={common.errorPage.title}
          body={common.errorPage.body}
          onRetry={reset}
          retryLabel={common.actions.retry}
        />
      </body>
    </html>
  );
}
