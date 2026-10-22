"use client";

// Complete Season Phase 3 — loads the read-only preview and shows it. The
// coach can adjust the new team address / season name (needed when they
// can't be advanced automatically) and refresh. Nothing on this screen
// completes a season.
import { useCallback, useEffect, useState } from "react";
import type { OpenCheckouts, SeasonPreview } from "@/lib/seasonPreview";
import SeasonPreviewReport from "./SeasonPreviewReport";
import styles from "./SeasonPreview.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: SeasonPreview; openCheckouts: OpenCheckouts }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

export function previewUrl(slug: string, nextSlug: string, nextLabel: string): string {
  const q = new URLSearchParams();
  if (nextSlug.trim()) q.set("next_slug", nextSlug.trim());
  if (nextLabel.trim()) q.set("next_label", nextLabel.trim());
  const s = q.toString();
  return `/api/team/${encodeURIComponent(slug)}/season/preview${s ? `?${s}` : ""}`;
}

/** Loads the preview and turns the response into a screen state. The data
 *  always comes from the server — never computed or filled in here. */
export async function fetchPreviewState(url: string): Promise<State> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.preview) {
      return { kind: "ready", preview: body.preview, openCheckouts: body.openCheckouts ?? { state: "unknown" } };
    }
    if (res.status === 503) return { kind: "unavailable", message: body.error ?? "Season completion isn't available yet." };
    return { kind: "error", message: body.error ?? "The preview couldn't be loaded." };
  } catch {
    return { kind: "error", message: "The preview couldn't be loaded. Check your connection and try again." };
  }
}

export default function SeasonPreviewScreen({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [nextSlug, setNextSlug] = useState("");
  const [nextLabel, setNextLabel] = useState("");

  const load = useCallback(async (s: string, l: string) => {
    setState({ kind: "loading" });
    setState(await fetchPreviewState(previewUrl(slug, s, l)));
  }, [slug]);

  useEffect(() => {
    let active = true;
    void fetchPreviewState(previewUrl(slug, "", "")).then(next => { if (active) setState(next); });
    return () => { active = false; };
  }, [slug]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Complete Season — Preview</h1>
        <p className={styles.lede}>
          Completing a season archives this season as read-only history and immediately makes the next season this
          team&apos;s active season. Review what would happen below. This is a preview — nothing changes.
        </p>
      </header>

      <form
        className={styles.overrides}
        onSubmit={e => { e.preventDefault(); void load(nextSlug, nextLabel); }}
        aria-label="Next season name and address"
      >
        <label className={styles.field}>
          New season name (optional)
          <input value={nextLabel} onChange={e => setNextLabel(e.target.value)} maxLength={40}
            placeholder={state.kind === "ready" ? state.preview.proposed.season_label ?? "e.g. 2028 Season" : "e.g. 2028 Season"} />
        </label>
        <label className={styles.field}>
          New team address (optional)
          <input value={nextSlug} onChange={e => setNextSlug(e.target.value.toLowerCase())} maxLength={80}
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder={state.kind === "ready" ? state.preview.proposed.slug ?? "e.g. lions-track-2028" : "e.g. lions-track-2028"} />
        </label>
        <button type="submit" className={styles.btn} disabled={state.kind === "loading"}>Update preview</button>
      </form>

      {state.kind === "loading" && <div className={styles.state} role="status">Loading the preview…</div>}
      {state.kind === "unavailable" && (
        <div className={styles.state} role="status"><strong>Not available yet.</strong> {state.message}</div>
      )}
      {state.kind === "error" && <div className={styles.state} role="alert">{state.message}</div>}
      {state.kind === "ready" && <SeasonPreviewReport preview={state.preview} openCheckouts={state.openCheckouts} />}
    </div>
  );
}
