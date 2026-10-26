"use client";

// Complete Season Phase 5A — the deliberate completion step under the
// preview. Shown only when COMPLETE_SEASON_EXECUTE is on for this team
// (COMPLETE_SEASON_EXECUTE_TEAMS; decided by the server page). The coach
// types the team's address AND the season's phrase; the button stays
// disabled until both match. One confirmation id
// (idempotency key) is made per preview, so a retry after a lost response
// returns the original receipt instead of completing twice. The server and
// the database re-check everything; this screen never decides on its own.
import { useEffect, useRef, useState } from "react";
import type { SeasonPreview } from "@/lib/seasonPreview";
import { confirmationMatches } from "@/lib/seasonConfirmation";
import { plural } from "./seasonPreviewText";
import styles from "./SeasonPreview.module.css";

export type CompletionReceipt = {
  transitionId: string;
  fromSlug: string;
  toSlug: string;
  toSeasonLabel: string;
  completedAt: string;
  replayed: boolean;
  summary: Record<string, number | boolean>;
  newSeasonUrl: string;
  archivedSeasonUrl: string;
  /** QA deployment only: completed with Stripe intentionally unconfigured. */
  paymentsUnverified?: boolean;
};

/** Codes after which the preview must be reloaded before trying again. */
const RELOAD_CODES = new Set(["stale", "blocked", "already_completed", "duplicate_conflict", "open_checkouts"]);

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export default function CompleteSeasonPanel({
  slug,
  preview,
  applied,
  onReload,
  onCompleted,
}: {
  slug: string;
  preview: SeasonPreview;
  /** The next-season address/name the shown preview was loaded with. */
  applied: { toSlug: string; toSeasonLabel: string };
  onReload: () => void;
  onCompleted: (receipt: CompletionReceipt) => void;
}) {
  const [typedSlug, setTypedSlug] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // A problem belongs to the preview it happened on; a new preview hides it.
  const [problem, setProblem] = useState<{ message: string; code: string; fingerprint: string } | null>(null);
  const shownProblem = problem && problem.fingerprint === preview.fingerprint ? problem : null;
  // One confirmation id per preview: a new preview (fingerprint) starts a
  // new confirmation; retrying the same one reuses it.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    keyRef.current = { fingerprint: preview.fingerprint, key: newKey() };
  }, [preview.fingerprint]);

  const phrase = preview.proposed.confirmation_phrase;
  const blocked = preview.blockers.length > 0;
  const matches = confirmationMatches({ teamSlug: typedSlug, phrase: typedPhrase }, { teamSlug: slug, phrase });
  const canSubmit = !blocked && matches && !submitting && !!preview.proposed.slug;
  const teamName = [preview.from.school_name, preview.from.sport_name].filter(Boolean).join(" · ");

  async function submit() {
    if (!canSubmit) return;
    if (!keyRef.current || keyRef.current.fingerprint !== preview.fingerprint) {
      keyRef.current = { fingerprint: preview.fingerprint, key: newKey() };
    }
    setSubmitting(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/team/${encodeURIComponent(slug)}/season/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          fingerprint: preview.fingerprint,
          idempotencyKey: keyRef.current.key,
          confirmTeamSlug: typedSlug,
          confirmation: typedPhrase,
          toSlug: applied.toSlug || null,
          toSeasonLabel: applied.toSeasonLabel || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.receipt) { onCompleted(body.receipt as CompletionReceipt); return; }
      setProblem({ message: body.error ?? "The season couldn't be completed.", code: body.code ?? "error", fingerprint: preview.fingerprint });
    } catch {
      setProblem({ message: "The connection dropped before an answer arrived. You can safely try again — the same confirmation is reused, so the season can't be completed twice.", code: "error", fingerprint: preview.fingerprint });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="complete-season-action" data-testid="complete-season-panel">
      <h2 id="complete-season-action" className={styles.sectionTitle}>Complete this season</h2>
      {blocked ? (
        <p role="status">Resolve the items listed above, then reload the preview to complete the season.</p>
      ) : (
        <>
          <p>
            You are completing <strong>{teamName}</strong> — <strong>{preview.from.season_label}</strong> (/{slug}).
            It becomes read-only history immediately, and <strong>{preview.proposed.season_label ?? "the next season"}</strong>
            {preview.proposed.slug ? <> (/{preview.proposed.slug})</> : null}{" "}becomes the team&apos;s active season.
            The new fundraiser stays off until ELF turns it on. This can&apos;t be undone from the app.
          </p>
          <div className={styles.confirmForm} data-testid="complete-season-confirm">
            <label className={styles.field}>
              Type the team address <code>{slug}</code>
              <input value={typedSlug} onChange={e => setTypedSlug(e.target.value)} autoCapitalize="none" autoCorrect="off"
                spellCheck={false} autoComplete="off" maxLength={100} aria-describedby="complete-season-help" />
            </label>
            <label className={styles.field}>
              Type <code>{phrase}</code>
              <input value={typedPhrase} onChange={e => setTypedPhrase(e.target.value)} autoComplete="off" maxLength={100}
                aria-describedby="complete-season-help" />
            </label>
            <p id="complete-season-help" className={styles.confirmHelp}>
              The button turns on when both match. Capitals and extra spaces in the phrase don&apos;t matter.
            </p>
            <button type="button" className={styles.btn} onClick={() => void submit()} disabled={!canSubmit} aria-disabled={!canSubmit}>
              {submitting ? "Completing…" : `Complete ${preview.from.season_label}`}
            </button>
          </div>
        </>
      )}
      {shownProblem && (
        <div role="alert" style={{ marginTop: ".6rem" }}>
          {shownProblem.message}
          {RELOAD_CODES.has(shownProblem.code) && (
            <> <button type="button" className={styles.btn} onClick={onReload}>Reload the preview</button></>
          )}
        </div>
      )}
    </section>
  );
}

/** Shown after a successful completion (or a replay of one). */
export function CompletionReceiptView({ receipt }: { receipt: CompletionReceipt }) {
  const s = receipt.summary;
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
  const when = new Date(receipt.completedAt);
  const graduated = n("athletes_graduated");
  const rejoin = n("members_must_rejoin") + n("coaches_must_rejoin");
  return (
    <section className={styles.section} aria-labelledby="season-completed" data-testid="completion-receipt">
      <h2 id="season-completed" className={styles.sectionTitle}>Season completed</h2>
      <p role="status">
        {receipt.replayed ? "This season was already completed with this confirmation. " : ""}
        /{receipt.fromSlug} is now read-only history, and <strong>{receipt.toSeasonLabel}</strong> (/{receipt.toSlug}) is the
        team&apos;s active season{Number.isNaN(when.getTime()) ? "" : ` (completed ${when.toLocaleString("en-US", { timeZone: "America/Phoenix" })})`}.
      </p>
      <ul>
        <li>{plural(n("athletes_carried"), "athlete")} moved to the new season; {graduated} graduated and {graduated === 1 ? "stays" : "stay"} in this season.</li>
        <li>{plural(n("members_carried"), "family member")} and {plural(n("coaches_carried"), "staff member")} carried over.</li>
        <li>{plural(rejoin, "person", "people")} {rejoin === 1 ? "needs" : "need"} to rejoin or be invited to the new season.</li>
        <li>{plural(n("calendar_events_copied"), "upcoming calendar event")} {n("calendar_events_copied") === 1 ? "was" : "were"} copied. The new fundraiser is off until ELF turns it on.</li>
      </ul>
      {receipt.paymentsUnverified && (
        <p role="note" data-testid="payments-unverified">QA test environment: open donation checkouts were not verified (Stripe isn&apos;t configured here).</p>
      )}
      <p style={{ fontSize: ".8rem" }}>Confirmation {receipt.transitionId}</p>
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <a className={styles.btn} href={receipt.newSeasonUrl}>Go to the new season</a>
        <a className={styles.btn} href={receipt.archivedSeasonUrl}>View the archived season</a>
      </div>
    </section>
  );
}
