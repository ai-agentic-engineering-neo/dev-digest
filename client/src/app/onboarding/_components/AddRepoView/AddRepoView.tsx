/* AddRepoView — add-repository screen body. URL only. API keys (OpenAI /
   Anthropic / GitHub PAT) are NOT entered here; they live in Settings → API
   Keys and don't change per repo. Escapable: Esc or the close button returns
   to the app. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Icon, IconBtn, Kbd, TextInput, FormField } from "@devdigest/ui";
import { useAddRepo } from "@/lib/hooks";
import { useKeydown } from "@/lib/hooks/useKeydown";
import { ApiError } from "@/lib/api";

export function AddRepoView() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [repoUrl, setRepoUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addRepo = useAddRepo();

  const close = React.useCallback(() => router.push("/"), [router]);

  // Escapable (the footer advertises Esc — make it real).
  useKeydown((e) => {
    if (e.key === "Escape") close();
  });

  const submit = async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    try {
      const repo = await addRepo.mutateAsync(repoUrl.trim());
      router.push(`/repos/${repo.id}/pulls`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("addRepo.failed"));
    }
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "44px 28px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--text-primary)", display: "grid", placeItems: "center" }}>
          <Icon.Layers size={17} style={{ color: "var(--bg-primary)" }} />
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>DevDigest</span>
      </div>

      <div
        style={{
          position: "relative",
          width: 520,
          maxWidth: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 36,
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <IconBtn icon="X" label={t("addRepo.close")} onClick={close} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{t("addRepo.title")}</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, marginBottom: 28, lineHeight: 1.5 }}>
          {t.rich("addRepo.intro", {
            link: (chunks) => (
              <a
                href="/settings/api-keys"
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/settings/api-keys");
                }}
                style={{ color: "var(--accent-text)" }}
              >
                {chunks}
              </a>
            ),
          })}
        </p>

        <FormField label={t("addRepo.urlLabel")} hint={t("addRepo.urlHint")}>
          <TextInput
            value={repoUrl}
            onChange={setRepoUrl}
            mono
            placeholder={t("addRepo.urlPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </FormField>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 8,
              background: "var(--crit-bg)",
              border: "1px solid rgba(239,68,68,0.25)",
              marginTop: 16,
            }}
          >
            <Icon.XCircle size={16} style={{ color: "var(--crit)" }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 24 }}>
          <Button kind="ghost" size="md" onClick={close}>
            {t("addRepo.cancel")}
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            kind="primary"
            size="md"
            icon="Plus"
            onClick={submit}
            disabled={!repoUrl.trim() || addRepo.isPending}
          >
            {addRepo.isPending ? t("addRepo.cloning") : t("addRepo.submit")}
          </Button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 24, display: "inline-flex", gap: 8, alignItems: "center" }}>
        <Icon.Lock size={12} /> {t.rich("addRepo.footer", { kbd: (chunks) => <Kbd>{chunks}</Kbd> })}
      </p>
    </div>
  );
}
