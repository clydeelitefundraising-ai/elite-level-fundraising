// Phase 9: pure in-memory dedupe/in-flight tracking for announcement Seen
// writes — deliberately separate from the DB's own idempotent upsert
// (notification_reads/notification_coach_reads' UNIQUE constraints, see
// src/lib/notifications.ts), which is the actual correctness guarantee.
// This layer exists purely to avoid redundant network traffic: without
// it, the same announcement re-entering the viewport (e.g. scrolling past
// it twice, or the same announcement rendering on both Home and
// Communications in one session) would fire a POST every time.
//
// `successfullySeen` and `inFlight` are intentionally separate concepts
// (see attemptMarkSeen below) — a failed request must NOT be treated the
// same as a successful one, or a transient network failure would
// permanently suppress ever retrying that announcement for the rest of
// the session.

export function createSeenWriteState() {
  const successfullySeen = new Set<string>();
  const inFlight = new Set<string>();

  function isAlreadyHandled(id: string): boolean {
    return successfullySeen.has(id) || inFlight.has(id);
  }

  /**
   * If already successfully marked, or a request for this id is already
   * in flight, does nothing. Otherwise marks in-flight, calls `send`, and
   * only on a truthy (successful) result marks it successfullySeen.
   * `inFlight` is always cleared afterward regardless of outcome — a
   * failed send leaves the id eligible for a later retry (e.g. the next
   * time it re-qualifies for dwell), with no explicit retry loop.
   */
  async function attemptMarkSeen(id: string, send: (id: string) => Promise<boolean>): Promise<void> {
    if (isAlreadyHandled(id)) return;
    inFlight.add(id);
    try {
      const ok = await send(id);
      if (ok) successfullySeen.add(id);
    } catch {
      // Silent — Seen-tracking failures must never surface a user-facing
      // error. `inFlight`'s removal below (finally) is what allows a
      // later retry; nothing else to do here.
    } finally {
      inFlight.delete(id);
    }
  }

  return { isAlreadyHandled, attemptMarkSeen };
}

// One shared instance for the whole page session — Home and Communications
// both import this module, so the same announcement is only ever POSTed
// once across both surfaces per session (on top of, not instead of, the
// DB's own idempotent upsert).
export const seenWriteState = createSeenWriteState();
