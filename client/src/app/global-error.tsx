/* Last-resort boundary for errors in the root layout itself. It replaces the
   layout, so it renders its own <html>/<body> and i18n provider; messages are
   imported statically because the server message loader isn't available here. */
"use client";

import { NextIntlClientProvider } from "next-intl";
import "./globals.css";
import { RouteError } from "@/components/route-states";
import common from "../../messages/en/common.json";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <NextIntlClientProvider locale="en" messages={{ common }}>
          <RouteError error={error} onRetry={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
