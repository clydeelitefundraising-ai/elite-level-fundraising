"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { searchAthletes } from "@/app/enter-code/athleteSearch";
import type { FamilyAthlete } from "./familyStatus";

function StatusRow({
  athlete, label, color, background,
}: {
  athlete:    FamilyAthlete;
  label:      string;
  color:      string;
  background: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
        padding: ".75rem .9rem", borderRadius: ".5rem", border: "1.5px solid #e5e7eb", background: "#fff",
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: ".95rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {athlete.name}
        </span>
        {athlete.event && (
          <span style={{ fontSize: ".78rem", color: "#6b7280" }}>{athlete.event}</span>
        )}
      </span>
      <span
        style={{
          flexShrink: 0, fontSize: ".72rem", fontWeight: 700, color, background,
          padding: ".25rem .55rem", borderRadius: 100, whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Family Relationships Phase D — "My Athletes". Authenticated-account page,
// entirely orthogonal to coach/member actor-kind resolution (see page.tsx):
// works identically for a parent with existing linked athletes and for a
// Head Coach/Assistant Coach establishing their first family relationship.
//
// Reuses searchAthletes() (src/app/enter-code/athleteSearch.ts) exactly as
// published for Phase C2 — not modified. `searchable` is already
// pre-filtered server-side (page.tsx) to exclude linked and pending
// athletes, so a declined-then-available athlete naturally reappears here
// with no special handling.
export default function FamilyView({
  slug, linked, pending, searchable,
}: {
  slug:       string;
  linked:     FamilyAthlete[];
  pending:    FamilyAthlete[];
  searchable: FamilyAthlete[];
}) {
  const [linkedList, setLinkedList]     = useState(linked);
  const [pendingList, setPendingList]   = useState(pending);
  const [searchableList, setSearchableList] = useState(searchable);
  const [showSearch, setShowSearch]     = useState(false);
  const [query, setQuery]               = useState("");
  // Single in-flight athlete id — disables every "Request Access" button
  // while set, the obvious accidental-double-submit guard the task calls
  // for. createPendingRequest()'s own idempotency on the server remains the
  // authoritative protection regardless.
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);

  // searchAthletes() expects event?: string (undefined, not null) — a tiny
  // shape adapter here, not a change to athleteSearch.ts itself.
  const results = searchAthletes(
    searchableList.map(a => ({ id: a.id, name: a.name, event: a.event ?? undefined })),
    query,
  );
  const hasLinked = linkedList.length > 0;

  async function requestAthlete(athlete: FamilyAthlete) {
    if (submittingId) return;
    setSubmittingId(athlete.id);
    setError(null);
    try {
      const res = await fetch(`/api/team/${slug}/family/requests`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ athleteId: athlete.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSearchableList(prev => prev.filter(a => a.id !== athlete.id));
      if (data?.status === "already_member") {
        setLinkedList(prev => [...prev, athlete]);
      } else {
        // "created" or "already_pending" both belong in Pending from the
        // parent's point of view — there's no new pending row to show
        // twice, just the one true current state.
        setPendingList(prev => [...prev, athlete]);
      }
      setQuery("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both", maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>My Athletes</h1>
        <p style={{ margin: ".35rem 0 0", fontSize: ".85rem", color: "#6b7280" }}>
          Athletes connected to your account for this team.
        </p>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".6rem .85rem", fontSize: ".82rem", color: "#991b1b" }}>
          {error}
        </div>
      )}

      {!hasLinked && pendingList.length === 0 && (
        <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
          You haven&apos;t linked any athletes yet.
        </p>
      )}

      {(linkedList.length > 0 || pendingList.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {linkedList.map(a => (
            <StatusRow key={a.id} athlete={a} label="Linked" color="#15803d" background="#f0fdf4" />
          ))}
          {pendingList.map(a => (
            <StatusRow key={a.id} athlete={a} label="Pending Coach Approval" color="#92400e" background="#fffbeb" />
          ))}
        </div>
      )}

      {!showSearch ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          style={{
            alignSelf: "flex-start", background: "none", border: "1.5px solid var(--elf-orange)",
            color: "var(--elf-orange-dark)", fontWeight: 700, fontSize: ".88rem",
            borderRadius: ".65rem", padding: ".6rem 1.1rem", cursor: "pointer",
          }}
        >
          + {hasLinked ? "Link Another Athlete" : "Link My Athlete"}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", background: "#fafafa", border: "1.5px solid #e5e7eb", borderRadius: ".65rem", padding: ".85rem" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search athlete name..."
            aria-label="Search athlete name"
            autoFocus
            style={{ padding: ".7rem .9rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: ".95rem", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" }}
          />

          {query.trim().length > 0 && (
            <div role="group" aria-label="Search results" style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {results.length === 0 ? (
                <div style={{ fontSize: ".85rem", color: "#9ca3af", padding: ".2rem .1rem" }}>No athletes found.</div>
              ) : (
                results.map(a => {
                  const athlete: FamilyAthlete = { id: a.id, name: a.name, event: a.event ?? null };
                  const busy = submittingId === a.id;
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                        padding: ".65rem .85rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", background: "#fff",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: ".92rem", color: "#0b1e3d" }}>{a.name}</span>
                        {a.event ? <span style={{ fontSize: ".78rem", color: "#6b7280" }}> · {a.event}</span> : null}
                      </span>
                      <button
                        type="button"
                        disabled={submittingId !== null}
                        onClick={() => requestAthlete(athlete)}
                        style={{
                          flexShrink: 0, background: "var(--elf-orange)", color: "#fff", border: "none",
                          borderRadius: ".5rem", padding: ".45rem .8rem", fontSize: ".8rem", fontWeight: 700,
                          cursor: submittingId !== null ? "default" : "pointer", opacity: submittingId !== null && !busy ? .5 : 1,
                        }}
                      >
                        {busy ? "Requesting…" : "Request Access"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setShowSearch(false); setQuery(""); }}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: ".78rem", color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: ".25rem" }}>
        <a
          href={`/team/${slug}/home`}
          style={{ display: "inline-flex", alignItems: "center", gap: ".2rem", fontSize: ".8rem", color: "var(--text-muted-app)", textDecoration: "none" }}
        >
          <ChevronLeft size={14} /> Back to Team Hub
        </a>
      </div>
    </div>
  );
}
