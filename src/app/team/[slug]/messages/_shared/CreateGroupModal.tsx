"use client";

import { useState } from "react";
import { validateGroupNameClient, MAX_GROUP_NAME_LENGTH } from "./groupMessaging";
import GroupParticipantPicker from "./GroupParticipantPicker";

// Group Messaging G2 — coach-only group creation. Reuses the exact modal
// chrome (backdrop, panel, header, bottom primary button) already
// established by MessagesView.tsx's ComposeModal for DM compose, so this
// reads as the same product rather than a second visual language. Submits
// only {name, athleteIds, staffIds} to the existing G1 endpoint — campaign,
// creator identity, and creator role are never sent from the client; the
// server derives all of that from the session and the URL slug.
export default function CreateGroupModal({
  slug,
  primaryColor,
  onClose,
  onCreated,
}: {
  slug: string;
  primaryColor: string;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [name, setName] = useState("");
  const [athleteIds, setAthleteIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const nameResult = validateGroupNameClient(name);
  // The G1 server already rejects a creator-only group (requires at least
  // one selected athlete or staff member) — mirrored here so the button
  // disables before a doomed request round-trips, not as a new rule.
  const hasParticipant = athleteIds.length + staffIds.length > 0;
  const canCreate = nameResult.ok && hasParticipant && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/messages/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, athleteIds, staffIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't create group. Please try again.");
        setCreating(false);
        return;
      }
      onCreated(data.id);
    } catch {
      setError("Network error. Please try again.");
      setCreating(false);
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
        aria-label="Create Group"
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
          gap: ".9rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", flex: 1 }}>
            Create Group
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>Group Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Varsity Jumps"
            aria-label="Group Name"
            maxLength={MAX_GROUP_NAME_LENGTH}
            autoFocus
            style={{
              width: "100%", padding: ".65rem .75rem", borderRadius: 10,
              border: "1.5px solid #e5e7eb", fontSize: "1rem", color: "#374151", boxSizing: "border-box",
            }}
          />
        </label>

        <GroupParticipantPicker
          slug={slug}
          excludeAthleteIds={new Set()}
          excludeStaffIds={new Set()}
          selectedAthleteIds={athleteIds}
          selectedStaffIds={staffIds}
          onChange={(a, s) => { setAthleteIds(a); setStaffIds(s); }}
          primaryColor={primaryColor}
        />

        {error && (
          <div role="alert" style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 8, padding: ".5rem .7rem", fontSize: ".78rem", color: "#dc2626",
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            width: "100%", padding: ".7rem",
            background: primaryColor, color: "#fff", border: "none", borderRadius: 10,
            fontSize: ".9rem", fontWeight: 700,
            cursor: canCreate ? "pointer" : "default",
            opacity: canCreate ? 1 : .5,
            transition: "opacity .15s",
          }}
        >
          {creating ? "Creating…" : "Create Group"}
        </button>
      </div>
    </div>
  );
}
