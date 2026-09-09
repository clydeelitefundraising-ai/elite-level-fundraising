"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { decidePollAction, type SyncStatus } from "./teamSyncStatus";

// TeamRealtimeSync polling replacement. The prior version created a
// browser Supabase client with the anon key and subscribed to
// postgres_changes on announcements/calendar_events/notifications — but
// all three tables have RLS enabled with zero policies, and ELF has no
// Supabase Auth (no JWT ever bridged into that client), so it never
// received a single event in production. See the TeamRealtimeSync design
// report for the full audit.
//
// This component no longer instantiates Supabase at all — it polls a
// small authenticated ELF API route (GET /api/team/[slug]/sync-status,
// authorized via the existing elf_session/getTeamActor path, same as
// every other team route) and calls router.refresh() only when the
// returned change-detection signature actually differs from the last one
// seen. The decision logic itself (decidePollAction) is a pure function
// in ./teamSyncStatus.ts, unit tested there — this file only wires it
// into fetch/setInterval/visibilitychange/router.refresh().
const POLL_INTERVAL_MS = 45_000;

export default function TeamRealtimeSync({ slug }: { slug: string }) {
  const router = useRouter();

  useEffect(() => {
    // Refs, not state: polling must never itself cause this (invisible)
    // component to re-render — router.refresh() is the only externally
    // visible effect, and only when the signature actually changes.
    // baselineRef starts null on every mount of this effect (including a
    // slug change, since slug is a dependency below) so a prior team's
    // baseline can never suppress this team's first real change.
    const baselineRef = { current: null as string | null };
    const inFlightRef = { current: false };
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      // In-flight guard: never overlap requests. A tick that fires while
      // the previous one is still pending simply does nothing this time —
      // the next tick (or the next visibility-triggered check) tries again.
      if (inFlightRef.current || cancelled) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/team/${slug}/sync-status`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return; // transient failure: leave baseline untouched, never refresh
        const data: SyncStatus = await res.json();
        if (cancelled) return;
        const decision = decidePollAction(baselineRef.current, data);
        if (decision.action === "no-op") return;
        // Both "establish-baseline" (first successful poll — no refresh,
        // the page was just server-rendered) and "refresh" (signature
        // actually changed) update the baseline; only "refresh" also
        // triggers router.refresh().
        baselineRef.current = decision.signature;
        if (decision.action === "refresh") router.refresh();
      } catch {
        // Network error: leave the last known-good baseline exactly as it
        // was, and never refresh on a failure.
      } finally {
        inFlightRef.current = false;
      }
    }

    function startInterval() {
      if (intervalId !== null) return;
      intervalId = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    }
    function stopInterval() {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopInterval();
      } else {
        // Foregrounding: check immediately (don't wait up to 45s for the
        // next tick to notice something changed while backgrounded), then
        // resume the normal interval.
        void poll();
        startInterval();
      }
    }

    // Establish the initial baseline (no refresh — this is the same data
    // the server just rendered) and start the normal cadence.
    void poll();
    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [slug, router]);

  return null;
}
