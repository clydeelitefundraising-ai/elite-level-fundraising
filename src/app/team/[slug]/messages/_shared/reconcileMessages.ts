export type MinimalMessage = { id: string };

/** A client-generated placeholder id for a message this browser just
 *  sent, before its own POST response (or a later authoritative refetch)
 *  confirms the real server-assigned id. Never anything the server
 *  itself would ever produce. */
export function isOptimisticMessageId(id: string): boolean {
  return id.startsWith("opt-");
}

/** Pure. Merges a freshly-fetched, AUTHORITATIVE server message list
 *  (the trusted result of an authenticated refetch — never a realtime
 *  payload) with whatever is currently rendered locally.
 *
 *  The server list is authoritative for every message it contains,
 *  INCLUDING its order — it is used exactly as returned, never re-sorted
 *  here. The only thing ever preserved from the local list is a
 *  still-in-flight optimistic entry (recognized by `isOptimisticId`)
 *  that the server list doesn't contain yet — e.g. a message this exact
 *  client just sent, whose own POST response hasn't resolved when a
 *  poll-triggered refresh (fired by a DIFFERENT participant's
 *  message) lands first. Once that entry's real id appears in a later
 *  server list, it's dropped automatically — nothing here needs to know
 *  which optimistic id maps to which real id, since only ids ABSENT from
 *  the server list are ever kept. This is what makes a duplicate bubble
 *  impossible once a subsequent refresh (or the sender's own POST
 *  response) completes. */
export function reconcileMessages<T extends MinimalMessage>(
  serverMessages: T[],
  localMessages: T[],
  isOptimisticId: (id: string) => boolean = isOptimisticMessageId,
): T[] {
  const serverIds = new Set(serverMessages.map(m => m.id));
  const stillPendingLocal = localMessages.filter(m => isOptimisticId(m.id) && !serverIds.has(m.id));
  return [...serverMessages, ...stillPendingLocal];
}
