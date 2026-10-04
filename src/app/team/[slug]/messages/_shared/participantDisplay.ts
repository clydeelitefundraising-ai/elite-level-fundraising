// Shared, pure display-logic helpers for Direct Messages — used by both
// MessagesView.tsx (thread list) and ThreadView.tsx (thread detail) so
// naming/avatar rules aren't duplicated. Deliberately has zero server
// dependencies (no fetch, no env vars) — safe to import as a real runtime
// value from client components, unlike @/lib/messages itself (server-only,
// reads SUPABASE_SERVICE_ROLE_KEY; only its types are imported here).
import type { MessageThread, ResolvedParticipant } from "@/lib/messages";

const ROLE_LABEL: Record<string, string> = {
  head_coach:      "Head Coach",
  assistant_coach: "Asst. Coach",
  booster:         "Booster",
  athlete:         "Athlete",
  parent:          "Parent",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

// Group Messaging G2 review correction — extracted so Manage Group's
// per-participant secondary line (name aside) is independently testable,
// rather than an inline ternary. Never exposes a raw internal value
// (is_auto_included, actor_type, or an un-labeled role string like
// "head_coach") — an auto-included family participant always gets the
// generic, non-attributing "Family member" copy (never "Parent of X",
// per the no-client-side-relationship-invention rule), and every other
// participant gets roleLabel()'s already-human-readable mapping.
export function participantSecondaryLabel(
  p: Pick<ResolvedParticipant, "is_auto_included" | "actor_type" | "role">,
): string {
  if (p.is_auto_included && p.actor_type === "member") {
    return "Family member · Included automatically";
  }
  return roleLabel(p.role);
}

// Every non-self, non-observer participant — the set that defines "who
// this conversation is with" for display purposes. Head Coach oversight
// participants are deliberately excluded here (same rule used server-side
// for canonical conversation identity — observers never define who a
// conversation is "with").
export function otherParticipants(
  participants: ResolvedParticipant[],
  actorKind: "coach" | "member",
  actorId: string,
): ResolvedParticipant[] {
  return participants.filter(p => {
    if (p.is_observer) return false;
    if (actorKind === "coach") return !(p.actor_type === "coach" && p.coach_id === actorId);
    return !(p.actor_type === "member" && p.member_id === actorId);
  });
}

export function observerParticipants(participants: ResolvedParticipant[]): ResolvedParticipant[] {
  return participants.filter(p => p.is_observer);
}

// Primary conversation identity — participant names, not a subject.
export function conversationDisplayName(
  participants: ResolvedParticipant[],
  actorKind: "coach" | "member",
  actorId: string,
  maxNames = 3,
): string {
  const others = otherParticipants(participants, actorKind, actorId);
  const names = others.slice(0, maxNames).map(p => p.name);
  const extra = others.length > maxNames ? ` +${others.length - maxNames}` : "";
  const joined = names.join(" · ") + extra;
  return joined || "Conversation";
}

// Family-thread detection (excludes observers — an athlete+parent pair is
// a family thread regardless of who else is observing).
export function isFamilyThread(participants: ResolvedParticipant[]): boolean {
  const main = participants.filter(p => !p.is_observer);
  return main.some(p => p.role === "athlete") && main.some(p => p.role === "parent");
}

// The acting user's OWN participant row on a thread, if any — source of
// truth for Head Coach "For Me / Oversight" classification (is_observer on
// THIS actor's own row, never inferred from creator/participant-count/role
// combinations).
export function selfParticipantRow(
  participants: ResolvedParticipant[],
  actorKind: "coach" | "member",
  actorId: string,
): ResolvedParticipant | undefined {
  return participants.find(p =>
    actorKind === "coach" ? p.actor_type === "coach" && p.coach_id === actorId
                          : p.actor_type === "member" && p.member_id === actorId,
  );
}

// Group Messaging G2 — a stored, explicit discriminator (thread_type), never
// inferred from participant count: a DM can legitimately have 3+
// participants already (family auto-include, Head Coach oversight), so
// "more than 2 participants" would be a wrong signal for "this is a group."
export function isGroupThread(thread: Pick<MessageThread, "thread_type">): boolean {
  return thread.thread_type === "group";
}

// Single source of truth for a thread's displayed title, used by both the
// thread list (MessagesView) and thread detail header (ThreadView) so they
// can never disagree. A group's title is ALWAYS its own group_name — never
// derived from participant names (unlike a DM, whose identity has always
// been "who it's with"). Falls back to "Group" only in the data-integrity
// edge case of a group row with no name, which the server's own CHECK
// constraint (message_threads_group_name_check) should make unreachable.
export function threadDisplayTitle(
  thread: Pick<MessageThread, "thread_type" | "group_name">,
  participants: ResolvedParticipant[],
  actorKind: "coach" | "member",
  actorId: string,
): string {
  if (isGroupThread(thread)) return thread.group_name ?? "Group";
  return conversationDisplayName(participants, actorKind, actorId);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join("");
}
