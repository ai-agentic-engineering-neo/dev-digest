import type { Metadata } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { themeNoFlashScript } from "@/lib/theme";

/* Each page.tsx sets its own `title`; the template adds the app name.
   noindex: every screen shows private, local workspace data (repos, PRs,
   settings) — nothing here should land in a search index (frontend-architecture §12). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} data-theme="dark" data-density="regular" suppressHydrationWarning>
      <head>
        {/* set theme before paint to avoid FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, translators, …)
          inject attributes like data-gr-ext-installed onto <body> before React
          hydrates. This suppresses ONLY this element's own attribute mismatch
          (one level deep) — real mismatches in descendants are still reported. */}
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <Providers>{children}</Providers>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
