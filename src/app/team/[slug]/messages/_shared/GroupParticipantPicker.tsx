"use client";

import { useEffect, useState } from "react";
import { searchDirectoryEntries } from "./groupMessaging";
import Avatar from "./Avatar";
import { roleLabel } from "./participantDisplay";

export type DirectoryEntry = { id: string; name: string; role: string; athlete_id?: string | null; photo_url?: string | null };
type Directory = { coaches: DirectoryEntry[]; athletes: DirectoryEntry[]; parents: DirectoryEntry[] };

// Group Messaging G2 — shared search/select UI for both "Create Group" and
// "Add People" (Manage Group). Search-first, same lesson Phase C2's athlete
// picker already proved for a large roster: an empty query shows nothing,
// a query shows a small capped set of matches grouped by type. Coaches
// select ATHLETES and STAFF only — the directory's own `parents` list is
// never rendered here, since G1 mirrors linked parents in automatically;
// exposing them as selectable would let a coach "double-add" a parent the
// server already handles on its own.
//
// Reuses the existing /messages/directory endpoint (already built for the
// DM compose picker) rather than a second roster API — that endpoint
// already excludes the calling coach's own id from `coaches`, so the
// creator/current-manager never appears as a selectable row here without
// any extra logic.
export default function GroupParticipantPicker({
  slug,
  excludeAthleteIds,
  excludeStaffIds,
  selectedAthleteIds,
  selectedStaffIds,
  onChange,
  primaryColor,
}: {
  slug: string;
  excludeAthleteIds: Set<string>;
  excludeStaffIds: Set<string>;
  selectedAthleteIds: string[];
  selectedStaffIds: string[];
  onChange: (athleteIds: string[], staffIds: string[]) => void;
  primaryColor: string;
}) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`/api/team/${slug}/messages/directory`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setDir(d))
      .catch(() => {});
  }, [slug]);

  const athletePool = dir?.athletes ?? [];
  const staffPool = dir?.coaches ?? [];
  const byId = new Map<string, DirectoryEntry>([...athletePool, ...staffPool].map(e => [e.id, e]));

  const excludedAthletes = new Set([...excludeAthleteIds, ...selectedAthleteIds]);
  const excludedStaff = new Set([...excludeStaffIds, ...selectedStaffIds]);
  const athleteResults = searchDirectoryEntries(athletePool, query, excludedAthletes);
  const staffResults = searchDirectoryEntries(staffPool, query, excludedStaff);

  function addAthlete(id: string) {
    onChange([...selectedAthleteIds, id], selectedStaffIds);
    setQuery("");
  }
  function addStaff(id: string) {
    onChange(selectedAthleteIds, [...selectedStaffIds, id]);
    setQuery("");
  }
  function removeAthlete(id: string) {
    onChange(selectedAthleteIds.filter(x => x !== id), selectedStaffIds);
  }
  function removeStaff(id: string) {
    onChange(selectedAthleteIds, selectedStaffIds.filter(x => x !== id));
  }

  const hasQuery = query.trim().length > 0;
  const hasAnyResults = athleteResults.length > 0 || staffResults.length > 0;
  const selectedCount = selectedAthleteIds.length + selectedStaffIds.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280" }}>Add People</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search athletes or staff..."
          aria-label="Search athletes or staff"
          style={{
            width: "100%", padding: ".55rem .7rem", borderRadius: 10,
            border: "1.5px solid #e5e7eb", fontSize: "1rem", color: "#374151", boxSizing: "border-box",
          }}
        />
      </label>

      {hasQuery && (
        <div role="group" aria-label="Search results" style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {!dir ? (
            <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
          ) : !hasAnyResults ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>No athletes or staff found.</div>
          ) : (
            <>
              {athleteResults.length > 0 && (
                <div>
                  <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
                    Athletes
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    {athleteResults.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addAthlete(a.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: ".6rem",
                          padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                          border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", width: "100%",
                        }}
                      >
                        <Avatar name={a.name} photoUrl={a.photo_url ?? null} size={32} />
                        <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d" }}>{a.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {staffResults.length > 0 && (
                <div>
                  <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
                    Staff
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    {staffResults.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addStaff(s.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: ".6rem",
                          padding: ".5rem .6rem", borderRadius: 10, textAlign: "left",
                          border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", width: "100%",
                        }}
                      >
                        <Avatar name={s.name} photoUrl={s.photo_url ?? null} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d" }}>{s.name}</div>
                          <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{roleLabel(s.role)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div>
          <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
            Selected ({selectedCount})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
            {selectedAthleteIds.map(id => {
              const entry = byId.get(id);
              return (
                <div
                  key={id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                    padding: ".5rem .6rem", borderRadius: 10, border: `1.5px solid ${primaryColor}`, background: "#fff",
                  }}
                >
                  <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry?.name ?? "Athlete"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAthlete(id)}
                    aria-label={`Remove ${entry?.name ?? "athlete"}`}
                    style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "1.1rem", lineHeight: 1, cursor: "pointer", flexShrink: 0, minWidth: 32, minHeight: 32 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {selectedStaffIds.map(id => {
              const entry = byId.get(id);
              return (
                <div
                  key={id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                    padding: ".5rem .6rem", borderRadius: 10, border: `1.5px solid ${primaryColor}`, background: "#fff",
                  }}
                >
                  <span style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry?.name ?? "Staff"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStaff(id)}
                    aria-label={`Remove ${entry?.name ?? "staff member"}`}
                    style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "1.1rem", lineHeight: 1, cursor: "pointer", flexShrink: 0, minWidth: 32, minHeight: 32 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
