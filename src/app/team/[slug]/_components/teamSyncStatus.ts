// Pure logic for TeamRealtimeSync's polling replacement — extracted so it's
// testable via node --test without a component-rendering harness (this
// repo has none; matches the reconcileMessages.ts/.test.ts precedent).
// TeamRealtimeSync.tsx itself only wires this into fetch/setInterval/
// visibilitychange/router.refresh(); no decision logic lives there.

export type SyncStatus = {
  announcements: { count: number; latestAt: string | null };
  calendar:      { count: number; signature: string };
  notifications: { count: number; latestAt: string | null };
};

// Deliberately just a stable JSON string of the (already-minimal) response
// — every field already comes from the server as change-detection
// metadata only (counts, timestamps, a calendar content hash), never row
// content, so no separate hashing step is needed here.
export function signatureOf(status: SyncStatus): string {
  return JSON.stringify(status);
}

export type PollDecision =
  | { action: "establish-baseline"; signature: string }
  | { action: "refresh"; signature: string }
  | { action: "no-op" };

// previousBaseline === null means "no successful poll yet for the current
// slug" — the caller resets it to null on every slug change so a prior
// team's baseline can never suppress a real change on a newly-mounted
// team. This function is only ever called with a successful response; a
// failed/errored fetch must never call it at all (that's what keeps a
// transient failure from overwriting the last known-good baseline or
// triggering a refresh — see TeamRealtimeSync.tsx's try/catch).
export function decidePollAction(
  previousBaseline: string | null,
  status: SyncStatus,
): PollDecision {
  const signature = signatureOf(status);
  if (previousBaseline === null) return { action: "establish-baseline", signature };
  if (signature !== previousBaseline) return { action: "refresh", signature };
  return { action: "no-op" };
}
