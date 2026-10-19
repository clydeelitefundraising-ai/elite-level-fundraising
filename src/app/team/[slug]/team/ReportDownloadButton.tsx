"use client";

import { useEffect, useRef, useState } from "react";
import { REPORT_MESSAGES, ReportDownloadError, deliverReport, fetchCsvReport } from "./reportDownload";
import styles from "./Team.module.css";

// Team Management Phase 4-2 — the "Download CSV" / "Download All Tasks
// CSV" button on the coach completion dashboard (TaskCompletionView.tsx).
// Renders inline items for the dashboard header's action row: the button,
// then (on their own line) the note and any status message.
//
// One report at a time: a second tap while preparing does nothing. If iOS
// won't open the Share sheet after a slow report, the finished file is
// kept in memory and the button becomes "Report ready — Save CSV" so the
// next direct tap opens it. The file is released once delivered, when a
// new report starts, or when the view closes.

type State =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "ready"; file: File; message?: string }
  | { kind: "error"; message: string };

export const ALL_ATHLETES_NOTE = "Includes all athletes, not just the filtered view.";

export default function ReportDownloadButton({ url, label, fallbackName }: { url: string; label: string; fallbackName: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const update = (next: State) => { if (mounted.current) setState(next); };

  const deliver = async (file: File, secondTap: boolean) => {
    const result = await deliverReport(file);
    if (result === "needs_tap") {
      update({ kind: "ready", file, message: secondTap ? REPORT_MESSAGES.stillNeedsTap : undefined });
    } else {
      update({ kind: "idle" }); // delivered (or the share sheet was closed): release the file
    }
  };

  const run = async (task: () => Promise<void>) => {
    if (busy.current) return; // no duplicate reports from repeated taps
    busy.current = true;
    try {
      await task();
    } catch (err) {
      update({ kind: "error", message: err instanceof ReportDownloadError ? err.message : REPORT_MESSAGES.unexpected });
    } finally {
      busy.current = false;
    }
  };

  const start = () => run(async () => {
    update({ kind: "preparing" });
    const file = await fetchCsvReport(url, fallbackName);
    await deliver(file, false);
  });

  const saveReady = (file: File) => run(() => deliver(file, true));

  const preparing = state.kind === "preparing";
  return (
    <>
      {state.kind === "ready" ? (
        <button type="button" onClick={() => saveReady(state.file)} className={`${styles.btnSolid} elf-focus-ring`} style={{ flexShrink: 0 }}>
          Report ready — Save CSV
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={preparing}
          aria-busy={preparing}
          className={`${styles.btnOutline} elf-focus-ring`}
          style={{ flexShrink: 0 }}
        >
          {preparing ? "Preparing CSV…" : label}
        </button>
      )}
      <p style={{ order: 2, flexBasis: "100%", margin: 0, fontSize: ".74rem", color: "#6b7280" }}>{ALL_ATHLETES_NOTE}</p>
      {state.kind === "error" && (
        <p role="alert" style={{ order: 3, flexBasis: "100%", margin: 0, fontSize: ".8rem", color: "#b91c1c" }}>{state.message}</p>
      )}
      {state.kind === "ready" && (
        <p role="status" style={{ order: 3, flexBasis: "100%", margin: 0, fontSize: ".8rem", color: "#374151" }}>
          {state.message ?? "Your report is ready. Tap Save CSV to save or share it."}
        </p>
      )}
    </>
  );
}
