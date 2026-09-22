/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import { useRunEvents } from "@/lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

export function RunStatus({
  runIds,
  onDone,
}: {
  runIds: string[];
  onDone?: () => void;
}) {
  const t = useTranslations("prReview");
  const { events, running } = useRunEvents(runIds);
  const wasRunning = React.useRef(false);
  // Latest onDone in a ref: parents pass an inline callback, which must not
  // re-run the effect (that re-fired onDone on every render after a run).
  const onDoneRef = React.useRef(onDone);
  React.useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });

  // Fire onDone exactly once per running → done transition.
  React.useEffect(() => {
    if (running) {
      wasRunning.current = true;
    } else if (wasRunning.current) {
      wasRunning.current = false;
      onDoneRef.current?.();
    }
  }, [running]);

  if (runIds.length === 0) return null;

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div style={s.wrap}>
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={running ? t("runStatus.elapsed", { count: runIds.length }) : undefined}
      />
    </div>
  );
}
