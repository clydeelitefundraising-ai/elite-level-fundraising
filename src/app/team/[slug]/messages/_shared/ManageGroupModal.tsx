"use client";

import { useEffect, useState } from "react";
import type { ResolvedParticipant } from "@/lib/messages";
import {
  validateGroupNameClient, MAX_GROUP_NAME_LENGTH, removalPayloadForParticipant, isLastActiveCoach,
  buildManageGroupRows, countGroupPeople, athleteSecondaryLabel,
  type RosterAssignmentWithStatus, type ManageGroupRow, type ManageGroupParticipantLike,
} from "./groupMessaging";
import GroupParticipantPicker from "./GroupParticipantPicker";
import Avatar from "./Avatar";
import { participantSecondaryLabel } from "./participantDisplay";

type ParticipantRow = ResolvedParticipant;

// What this modal removes directly — either a roster athlete assignment
// (athletes.id, G3A's rosterAthleteId) or a staff participant
// (team_coaches.id via the existing removalPayloadForParticipant mapping).
// A roster-only (never-joined) athlete has no participant row at all, so it
// can never be represented as a ParticipantRow — this is why athlete
// removal needs its own variant rather than reusing removalPayloadForParticipant,
// which only ever operates on an actual participant.
type RemoveTarget =
  | { kind: "athlete"; athleteId: string; name: string }
  | { kind: "participant"; participant: ManageGroupParticipantLike };

// Group Messaging G2 — rename / add / remove / archive, for an authorized
// coach only (the thread-header entry point that opens this already gated
// visibility server-side via canManageGroup — see ThreadView.tsx). Reuses
// the existing GET /api/team/[slug]/messages/threads/[threadId] endpoint
// (the same one ThreadView already polls for messages) to refresh the
// participant list after every mutation — no new read endpoint needed.
export default function ManageGroupModal({
  slug,
  threadId,
  initialGroupName,
  canArchive,
  primaryColor,
  onClose,
  onRenamed,
  onArchived,
}: {
  slug: string;
  threadId: string;
  initialGroupName: string;
  canArchive: boolean;
  primaryColor: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
  onArchived: () => void;
}) {
  const [participants, setParticipants] = useState<ParticipantRow[] | null>(null);
  // G3B: the full G3A roster-assignment list for this group (athletes.id +
  // name + joined status) — null while loading, same convention as
  // `participants`. undefined is never a valid loaded value (the route
  // always returns an array for a group thread); null-vs-array is the only
  // loading signal this modal needs.
  const [rosterAssignments, setRosterAssignments] = useState<RosterAssignmentWithStatus[] | null>(null);
  const [name, setName] = useState(initialGroupName);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [addingOpen, setAddingOpen] = useState(false);
  const [addAthleteIds, setAddAthleteIds] = useState<string[]>([]);
  const [addStaffIds, setAddStaffIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<RemoveTarget | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  function loadParticipants() {
    fetch(`/api/team/${slug}/messages/threads/${threadId}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        setParticipants(d.participants);
        setRosterAssignments(d.rosterAssignments ?? []);
      })
      .catch(() => {});
  }
  useEffect(loadParticipants, [slug, threadId]);

  // Group Messaging G3B — the single reconciliation point between the two
  // independent data sources: roster assignments (who's actually assigned,
  // joined or not) and live participants (who's authenticated/auto-included
  // right now). A joined roster athlete's own direct participant row is
  // deliberately excluded by buildManageGroupRows — never shown twice.
  const rows: ManageGroupRow[] | null =
    participants && rosterAssignments ? buildManageGroupRows(rosterAssignments, participants) : null;
  const peopleCount = participants && rosterAssignments ? countGroupPeople(rosterAssignments, participants) : null;

  const nameResult = validateGroupNameClient(name);
  const nameChanged = nameResult.ok && nameResult.name !== initialGroupName;

  async function handleRename() {
    if (!nameResult.ok || !nameChanged || renaming) return;
    setRenaming(true);
    setRenameError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/groups/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameResult.name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRenameError(data?.error ?? "Couldn't rename group. Please try again.");
        setRenaming(false);
        return;
      }
      onRenamed(nameResult.name);
      setRenaming(false);
    } catch {
      setRenameError("Network error. Please try again.");
      setRenaming(false);
    }
  }

  // G3B review correction: Add People must exclude athletes who are
  // ALREADY ACTIVELY ASSIGNED via message_thread_athletes — not merely
  // athletes who happen to be active message_thread_participants. A
  // roster-only (never-joined) assigned athlete has no participant row at
  // all, so the old participants-derived exclude-set would have let a
  // coach "re-add" someone already assigned. Sourced from rosterAssignments
  // (G3A) instead.
  const activeAthleteIds = new Set((rosterAssignments ?? []).map(a => a.athlete_id));
  const activeStaffIds = new Set(
    (participants ?? []).filter(p => p.actor_type === "coach" && p.coach_id).map(p => p.coach_id as string),
  );

  async function handleAdd() {
    if ((addAthleteIds.length + addStaffIds.length) === 0 || adding) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/groups/${threadId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterAthleteIds: addAthleteIds, staffIds: addStaffIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAddError(data?.error ?? "Couldn't add this person. Refresh and try again.");
        setAdding(false);
        return;
      }
      setAddAthleteIds([]);
      setAddStaffIds([]);
      setAddingOpen(false);
      setAdding(false);
      loadParticipants();
    } catch {
      setAddError("Network error. Please try again.");
      setAdding(false);
    }
  }

  async function handleRemove(target: RemoveTarget) {
    const body = target.kind === "athlete"
      ? { rosterAthleteId: target.athleteId }
      : removalPayloadForParticipant(target.participant);
    if (!body) {
      // Should be unreachable — the Remove control is only ever rendered
      // for a row removalPayloadForParticipant() (staff) or the athlete
      // branch above accepts. Defensive only: never sends a malformed
      // request if that guard is ever loosened by mistake.
      setRemoveError("This person can't be removed directly.");
      setConfirmRemove(null);
      return;
    }
    const removingKey = target.kind === "athlete" ? `athlete-${target.athleteId}` : target.participant.id;
    setRemoving(removingKey);
    setRemoveError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/groups/${threadId}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRemoveError(data?.error ?? "Couldn't remove this person. Please try again.");
        setRemoving(null);
        setConfirmRemove(null);
        return;
      }
      setConfirmRemove(null);
      setRemoving(null);
      // Reflects whatever the server now says — including any family
      // reconciliation (e.g. a parent disappearing because no other
      // selected child remains) that happened as a side effect. No
      // client-side reconstruction of that logic.
      loadParticipants();
    } catch {
      setRemoveError("Network error. Please try again.");
      setRemoving(null);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setArchiveError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/groups/${threadId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setArchiveError(data?.error ?? "Couldn't archive group. Please try again.");
        setArchiving(false);
        setConfirmArchive(false);
        return;
      }
      onArchived();
    } catch {
      setArchiveError("Network error. Please try again.");
      setArchiving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))",
        animation: "elf-backdropIn .18s ease both",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage Group"
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(460px,100%)",
          background: "#fff",
          borderRadius: 18,
          padding: "1.2rem 1rem",
          animation: "elf-modalIn .2s ease both",
          maxHeight: "calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", flex: 1 }}>
            Manage Group
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>Group Name</span>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={MAX_GROUP_NAME_LENGTH}
              aria-label="Group Name"
              style={{
                flex: 1, padding: ".6rem .7rem", borderRadius: 10,
                border: "1.5px solid #e5e7eb", fontSize: ".95rem", color: "#374151", boxSizing: "border-box",
              }}
            />
            <button
              onClick={handleRename}
              disabled={!nameResult.ok || !nameChanged || renaming}
              style={{
                padding: ".6rem 1rem", borderRadius: 10, border: "none",
                background: primaryColor, color: "#fff", fontSize: ".82rem", fontWeight: 700,
                cursor: (!nameResult.ok || !nameChanged || renaming) ? "default" : "pointer",
                opacity: (!nameResult.ok || !nameChanged || renaming) ? .5 : 1,
                flexShrink: 0,
              }}
            >
              {renaming ? "Saving…" : "Rename"}
            </button>
          </div>
          {renameError && <div role="alert" style={{ fontSize: ".75rem", color: "#dc2626" }}>{renameError}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>
            People {peopleCount !== null ? `(${peopleCount})` : ""}
          </span>
          {!rows ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {rows.map(row => {
                // G3B: a directly-assigned roster athlete (joined or not)
                // is always removable, via rosterAthleteId — never derived
                // from a participant row, which a roster-only athlete
                // doesn't have. Staff removability is unchanged
                // (removalPayloadForParticipant + the last-active-coach
                // guard, mirroring G1's own server-side rule). Family rows
                // are never removable directly here at all.
                const name = row.kind === "athlete" ? row.name : row.participant.name;
                const photoUrl = row.kind === "athlete" ? null : row.participant.photo_url;
                const secondary = row.kind === "athlete" ? athleteSecondaryLabel(row.joined) : participantSecondaryLabel(row.participant);
                const removable = row.kind === "athlete" || (row.kind === "staff" && removalPayloadForParticipant(row.participant) !== null);
                const isSoleCoach = row.kind === "staff" && row.participant.actor_type === "coach" && !!row.participant.coach_id
                  && isLastActiveCoach(participants ?? [], row.participant.coach_id);
                const removingKey = row.kind === "athlete" ? `athlete-${row.athleteId}` : row.participant.id;
                const target: RemoveTarget = row.kind === "athlete"
                  ? { kind: "athlete", athleteId: row.athleteId, name: row.name }
                  : { kind: "participant", participant: row.participant };
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                      padding: ".5rem .6rem", borderRadius: 10, border: "1.5px solid #e5e7eb",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", minWidth: 0 }}>
                      <Avatar name={name} photoUrl={photoUrl} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>
                          {secondary}
                        </div>
                      </div>
                    </div>
                    {removable && (
                      isSoleCoach ? (
                        <span style={{ fontSize: ".68rem", color: "#9ca3af", flexShrink: 0, fontStyle: "italic" }}>
                          Last coach
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(target)}
                          disabled={removing === removingKey}
                          aria-label={`Remove ${name}`}
                          style={{
                            background: "none", border: "none", color: "#dc2626", fontSize: ".78rem", fontWeight: 700,
                            cursor: removing === removingKey ? "default" : "pointer", flexShrink: 0,
                            opacity: removing === removingKey ? .5 : 1,
                          }}
                        >
                          {removing === removingKey ? "Removing…" : "Remove"}
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {removeError && <div role="alert" style={{ fontSize: ".75rem", color: "#dc2626" }}>{removeError}</div>}
        </div>

        {!addingOpen ? (
          <button
            type="button"
            onClick={() => setAddingOpen(true)}
            style={{
              alignSelf: "flex-start", background: "none", border: `1.5px solid ${primaryColor}`,
              color: primaryColor, fontWeight: 700, fontSize: ".85rem",
              borderRadius: 10, padding: ".55rem 1rem", cursor: "pointer",
            }}
          >
            + Add People
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem", background: "#fafafa", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: ".8rem" }}>
            <GroupParticipantPicker
              slug={slug}
              excludeAthleteIds={activeAthleteIds}
              excludeStaffIds={activeStaffIds}
              selectedAthleteIds={addAthleteIds}
              selectedStaffIds={addStaffIds}
              onChange={(a, s) => { setAddAthleteIds(a); setAddStaffIds(s); }}
              primaryColor={primaryColor}
            />
            {addError && <div role="alert" style={{ fontSize: ".75rem", color: "#dc2626" }}>{addError}</div>}
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button
                type="button"
                onClick={() => { setAddingOpen(false); setAddAthleteIds([]); setAddStaffIds([]); setAddError(""); }}
                style={{ background: "none", border: "none", fontSize: ".78rem", color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={(addAthleteIds.length + addStaffIds.length) === 0 || adding}
                style={{
                  marginLeft: "auto", padding: ".5rem 1rem", borderRadius: 10, border: "none",
                  background: primaryColor, color: "#fff", fontSize: ".82rem", fontWeight: 700,
                  cursor: ((addAthleteIds.length + addStaffIds.length) === 0 || adding) ? "default" : "pointer",
                  opacity: ((addAthleteIds.length + addStaffIds.length) === 0 || adding) ? .5 : 1,
                }}
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        )}

        {canArchive && (
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: ".9rem" }}>
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              style={{ background: "none", border: "none", color: "#dc2626", fontSize: ".82rem", fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              Archive Group
            </button>
            {archiveError && <div role="alert" style={{ fontSize: ".75rem", color: "#dc2626", marginTop: ".4rem" }}>{archiveError}</div>}
          </div>
        )}
      </div>

      {/* Remove-participant confirmation */}
      {confirmRemove && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
          }}
        >
          <div style={{ width: "min(360px,100%)", background: "#fff", borderRadius: 16, padding: "1.1rem" }}>
            <p style={{ margin: "0 0 1rem", fontSize: ".9rem", color: "#374151" }}>
              Remove {confirmRemove.kind === "athlete" ? confirmRemove.name : confirmRemove.participant.name} from {initialGroupName}?
            </p>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmRemove(null)}
                style={{ padding: ".5rem 1rem", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                style={{ padding: ".5rem 1rem", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation */}
      {confirmArchive && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
          }}
        >
          <div style={{ width: "min(380px,100%)", background: "#fff", borderRadius: 16, padding: "1.1rem" }}>
            <p style={{ margin: "0 0 .4rem", fontSize: ".92rem", fontWeight: 700, color: "#0b1e3d" }}>
              Archive &ldquo;{initialGroupName}&rdquo;?
            </p>
            <p style={{ margin: "0 0 1rem", fontSize: ".85rem", color: "#6b7280" }}>
              Members will no longer be able to access or send messages in this group.
            </p>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmArchive(false)}
                disabled={archiving}
                style={{ padding: ".5rem 1rem", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                style={{ padding: ".5rem 1rem", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer", opacity: archiving ? .6 : 1 }}
              >
                {archiving ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
