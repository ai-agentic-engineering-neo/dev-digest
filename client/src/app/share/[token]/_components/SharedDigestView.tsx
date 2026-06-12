"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

/* Public read-only view for a shared digest. Renders the server-rendered digest
   HTML (markdown → HTML happens API-side in the share service) inside the
   reader shell. No auth — the token in the URL is the capability. */

interface SharedDigest {
  id: string;
  html: string;
}

export function SharedDigestView({ token }: { token: string }) {
  const [digest, setDigest] = useState<SharedDigest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/share/${token}${window.location.search}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Link expired"))))
      .then(setDigest)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (error) return <main className="share-reader">{error}</main>;
  if (!digest) return <main className="share-reader">Loading…</main>;

  return (
    <main className="share-reader">
      {/* Body is the digest author's own rendered markdown. */}
      <article dangerouslySetInnerHTML={{ __html: digest.html }} />
    </main>
  );
}

/** Inline highlight for a matched search term inside the shared digest. */
export function highlightTerm(term: string): string {
  return `<mark>${term}</mark>`;
}

export default SharedDigestView;
