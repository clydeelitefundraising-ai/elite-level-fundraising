"use client";

import { useEffect, useState } from "react";
import { searchDirectoryEntries, searchRosterAthletes, athleteMetaLabel, athleteJoinStatusLabel, type RosterAthleteEntry } from "./groupMessaging";
import Avatar from "./Avatar";
import { roleLabel } from "./participantDisplay";

type StaffEntry = { id: string; name: string; role: string };
type Directory = { athletes: RosterAthleteEntry[]; staff: StaffEntry[] };

// Group Messaging G3B — shared search/select UI for both "Create Group" and
// "Add People" (Manage Group). Search-first, same lesson Phase C2's athlete
// picker already proved for a large roster: an empty query shows nothing,
// a query shows a small capped set of matches grouped by type. Coaches
// select ATHLETES and STAFF only — parents are never selectable here at
// all (G1 mirrors linked parents in automatically; exposing them would let
// a coach "double-add" a parent the server already handles on its own).
//
// G3B: switched from /messages/directory (joined team_members only — still
// correct for DM compose, which stays on that endpoint) to
// /messages/group-directory (G3A) — the FULL athletes roster, including
// athletes who have never joined ELF. Selected/excluded athlete ids are now
// athletes.id throughout, never team_members.id.
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
  excludeAthleteIds: Set<string>; // athletes.id
  excludeStaffIds: Set<string>;   // team_coaches.id
  selectedAthleteIds: string[];   // athletes.id
  selectedStaffIds: string[];     // team_coaches.id
  onChange: (athleteIds: string[], staffIds: string[]) => void;
  primaryColor: string;
}) {
  const [dir, setDir] = useState<Directory | null>(null);
  // G3 bugfix (preserved from the original diagnostic): a failed directory
  // fetch previously left `dir` at its initial null forever —
  // indistinguishable from "still loading," and easy to misread as "no
  // results" once a search is typed. fetchFailed makes a real fetch
  // failure its own distinct, retryable state instead.
  const [fetchFailed, setFetchFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // No explicit reset of fetchFailed here: this component is always
    // freshly mounted per modal open (CreateGroupModal/ManageGroupModal
    // each instantiate their own GroupParticipantPicker), so the initial
    // `useState(false)` already covers the only case that matters — a
    // synchronous setState at the top of an effect is otherwise flagged
    // as a cascading-render risk.
    fetch(`/api/team/${slug}/messages/group-directory`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`group-directory fetch failed: ${r.status}`))))
      .then(d => setDir(d))
      .catch(() => setFetchFailed(true));
  }, [slug]);

  const athletePool = dir?.athletes ?? [];
  const staffPool = dir?.staff ?? [];
  const athleteById = new Map<string, RosterAthleteEntry>(athletePool.map(a => [a.id, a]));
  const staffById = new Map<string, StaffEntry>(staffPool.map(s => [s.id, s]));

  // Selection persists across search changes by construction: selected ids
  // are looked up directly in athleteById/staffById (the full, unfiltered
  // roster), never derived from the current search results.
  const excludedAthletes = new Set([...excludeAthleteIds, ...selectedAthleteIds]);
  const excludedStaff = new Set([...excludeStaffIds, ...selectedStaffIds]);
  const athleteResults = searchRosterAthletes(athletePool, query, excludedAthletes);
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
  const hasFullRoster = athletePool.length > 0 || staffPool.length > 0;
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
          {fetchFailed ? (
            <div role="alert" style={{ fontSize: ".82rem", color: "#dc2626" }}>
              Couldn&apos;t load athletes and staff. Try again.
            </div>
          ) : !dir ? (
            <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>Loading athletes and staff…</div>
          ) : !hasAnyResults ? (
            <div style={{ fontSize: ".82rem", color: "#9ca3af" }}>
              {hasFullRoster ? "No matching athletes or staff." : "No athletes or staff are available yet."}
            </div>
          ) : (
            <>
              {athleteResults.length > 0 && (
                <div>
                  <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem" }}>
                    Athletes
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    {athleteResults.map(a => {
                      const meta = athleteMetaLabel(a.event, a.classYear);
                      const joinStatus = athleteJoinStatusLabel(a.joined);
                      return (
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
                          <Avatar name={a.name} photoUrl={null} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#0b1e3d" }}>{a.name}</div>
                            {meta && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{meta}</div>}
                            {joinStatus && <div style={{ fontSize: ".7rem", color: "#9ca3af" }}>{joinStatus}</div>}
                          </div>
                        </button>
                      );
                    })}
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
                        <Avatar name={s.name} photoUrl={null} size={32} />
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
              const entry = athleteById.get(id);
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
              const entry = staffById.get(id);
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
