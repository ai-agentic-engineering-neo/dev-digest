"use client";

import { useCallback, useState } from "react";

const HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

/** Visually hidden polite live region for state announcements. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={HIDDEN}>
      {message}
    </div>
  );
}

/** `const { message, announce } = useAnnouncer(); <LiveRegion message={message} />` */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => setMessage(m), []);
  return { message, announce };
}
