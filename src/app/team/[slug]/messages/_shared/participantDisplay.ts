// Shared, pure display-logic helpers for Direct Messages — used by both
// MessagesView.tsx (thread list) and ThreadView.tsx (thread detail) so
// naming/avatar rules aren't duplicated. Deliberately has zero server
// dependencies (no fetch, no env vars) — safe to import as a real runtime
// value from client components, unlike @/lib/messages itself (server-only,
// reads SUPABASE_SERVICE_ROLE_KEY; only its types are imported here).
import type { ResolvedParticipant } from "@/lib/messages";

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

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join("");
}
