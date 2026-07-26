"use client";

import { useState, useEffect } from "react";

export type CoachTeamContext = {
  campaign_slug: string;
  role:          string;
  school_name:   string;
  sport_name:    string;
  season:        string;
};

export type CoachSearchResult = {
  id:    string;
  name:  string;
  email: string;
  teams: CoachTeamContext[];
};

type FetchState = "loading" | "results" | "no_results" | "error";

const inputStyle: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8,
  fontSize: ".875rem", color: "#1d1d1f", background: "#fff", width: "100%",
  boxSizing: "border-box", outline: "none",
};

function teamLabel(t: CoachTeamContext): string {
  const parts = [t.school_name, t.sport_name].filter(Boolean).join(" · ");
  const role  = t.role === "head_coach" ? "Head Coach" : t.role === "assistant_coach" ? "Assistant Coach" : t.role;
  return [parts, t.season, role].filter(Boolean).join(" — ");
}

// Debounced, server-searched coach picker for the "Select Existing Coach"
// mode. Reuses the same debounce timing convention as the admin
// CommandCenter's search (380ms), and this wizard's own slug-availability
// debounce (also 380ms) — see NewCampaignWizard.tsx's slug check effect.
export default function CoachSearchSelect({
  selected, onSelect, initialAccountId,
}: {
  selected: CoachSearchResult | null;
  onSelect: (account: CoachSearchResult | null) => void;
  // Set once, right after a duplicate-email rejection in "Create New Coach"
  // mode offers to switch modes with that account preselected. We only have
  // {id,name,email} at that point (no team context) — fetch it properly the
  // first time this component mounts with it set.
  initialAccountId?: string | null;
}) {
  const [query, setQuery] = useState("");
  // null = nothing in flight / no completed search yet — the "too short to
  // search" and "initial prompt" states are derived from `query` at render
  // time instead of stored here, so no setState is ever called synchronously
  // from an effect body (only from inside the debounce timer's callback).
  const [state, setState] = useState<FetchState | null>(null);
  const [results, setResults] = useState<CoachSearchResult[]>([]);

  useEffect(() => {
    // No ref-based "already fetched" guard here — the effect is already
    // scoped by its dependency array to fire only when initialAccountId
    // itself changes. A ref guard was tried and removed: it broke under
    // React Strict Mode's dev-only double-invoke (the guard flips true on
    // the first, cleaned-up invocation, then silently blocks the second,
    // real one — the fetch never fires and the account never preselects).
    // Firing twice in Strict Mode dev is harmless (one extra network call);
    // silently never firing was the actual bug.
    if (!initialAccountId || selected) return;
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res  = await fetch(`/api/admin/coach-search?id=${encodeURIComponent(initialAccountId)}`);
        const data = await res.json() as { results?: CoachSearchResult[] };
        const match = data.results?.[0];
        if (match) onSelect(match);
      } catch {
        // best-effort preselect — silently fall through to manual search
      } finally {
        setState(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountId]);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res  = await fetch(`/api/admin/coach-search?q=${encodeURIComponent(q)}`);
        if (!res.ok) { setState("error"); return; }
        const data = await res.json() as { results?: CoachSearchResult[] };
        const list = data.results ?? [];
        setResults(list);
        setState(list.length > 0 ? "results" : "no_results");
      } catch {
        setState("error");
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [query, selected]);

  if (selected) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: ".75rem" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#1d1d1f" }}>{selected.name}</div>
            <div style={{ fontSize: ".78rem", color: "#6e6e73", marginTop: ".1rem" }}>{selected.email}</div>
            {selected.teams.length > 0 && (
              <div style={{ marginTop: ".5rem", display: "flex", flexDirection: "column", gap: ".2rem" }}>
                {selected.teams.map(t => (
                  <div key={t.campaign_slug} style={{ fontSize: ".72rem", color: "#15803d" }}>
                    {teamLabel(t)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(""); }}
            style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: ".7rem", color: "#6e6e73", fontWeight: 600, padding: ".25rem .6rem", flexShrink: 0 }}
          >
            Change
          </button>
        </div>
        <div style={{ fontSize: ".72rem", color: "#15803d", marginTop: ".65rem", fontWeight: 500 }}>
          This coach will be added to the new team and will keep their existing ELF login.
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        style={inputStyle}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by coach name or email"
      />
      <div style={{ marginTop: ".5rem" }}>
        {query.trim().length === 0 && (
          <div style={{ fontSize: ".78rem", color: "#98989d", padding: ".5rem 0" }}>Start typing a coach&rsquo;s name or email to search.</div>
        )}
        {query.trim().length > 0 && query.trim().length < 2 && (
          <div style={{ fontSize: ".78rem", color: "#98989d", padding: ".5rem 0" }}>Keep typing — at least 2 characters.</div>
        )}
        {state === "loading" && (
          <div style={{ fontSize: ".78rem", color: "#98989d", padding: ".5rem 0" }}>Searching…</div>
        )}
        {state === "no_results" && (
          <div style={{ fontSize: ".78rem", color: "#98989d", padding: ".5rem 0" }}>No matching coaches found.</div>
        )}
        {state === "error" && (
          <div style={{ fontSize: ".78rem", color: "#dc2626", padding: ".5rem 0" }}>Search failed. Please try again.</div>
        )}
        {state === "results" && (
          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", maxHeight: 260, overflowY: "auto" }}>
            {results.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r)}
                style={{
                  textAlign: "left", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                  padding: ".6rem .75rem", cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#1d1d1f" }}>{r.name}</div>
                <div style={{ fontSize: ".72rem", color: "#6e6e73" }}>{r.email}</div>
                {r.teams.length > 0 && (
                  <div style={{ fontSize: ".68rem", color: "#98989d", marginTop: ".25rem" }}>
                    {r.teams.map(teamLabel).join(" · ")}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
