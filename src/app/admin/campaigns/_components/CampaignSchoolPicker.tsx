"use client";

import { useEffect, useState } from "react";
import CreateSchoolForm, { type CreatedSchool } from "@/app/platform-admin/school-links/[slug]/CreateSchoolForm";
import { partnerVisibilityText, type SchoolDefaultsRow } from "@/lib/campaignSchoolDefaults";

// School selection for the Platform Admin New Campaign (and CRM Launch) and
// Duplicate wizards. Reuses the School Links directory search
// (GET /api/platform-admin/school-links/schools) and the Create New School
// form/endpoint with its duplicate protections. Choosing a school loads its
// Organization Center record (GET /api/admin/organization) for defaults and
// Community Partner visibility. A suggested name (e.g. from a CRM contact)
// only pre-fills the search — a school is never selected without a click.

export type SelectedSchool = { id: string; label: string; org: SchoolDefaultsRow };
type Result = { id: string; slug: string; label: string };

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  minHeight: 44, padding: ".45rem .9rem", borderRadius: 8, fontSize: ".82rem", fontWeight: 600,
  cursor: disabled ? "default" : "pointer", border: primary ? "none" : "1.5px solid #0b1e3d",
  background: primary ? (disabled ? "#9ca3af" : "#0b1e3d") : "#fff", color: primary ? "#fff" : "#0b1e3d", whiteSpace: "nowrap",
});

export async function loadSchool(id: string, label?: string): Promise<SelectedSchool | null> {
  const res = await fetch(`/api/admin/organization?organizationId=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const d = await res.json().catch(() => null) as { org?: SchoolDefaultsRow & { id: string; slug: string } } | null;
  if (!d?.org) return null;
  const place = [d.org.city?.trim(), d.org.state?.trim()].filter(Boolean).join(", ");
  return { id, label: label ?? (place ? `${d.org.school_name} — ${place}` : d.org.school_name ?? id), org: d.org };
}

export default function CampaignSchoolPicker({
  value, onChange, suggestedName = "", note,
}: {
  value: SelectedSchool | null;
  onChange: (school: SelectedSchool) => void;
  suggestedName?: string;
  note?: React.ReactNode;
}) {
  const [changing, setChanging] = useState(!value);
  const [query, setQuery] = useState(suggestedName);
  const [results, setResults] = useState<Result[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "failed">("idle");
  const [creating, setCreating] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [auditWarning, setAuditWarning] = useState("");

  // A school supplied later by the parent (e.g. the source campaign's school
  // once it has loaded) is shown as the selection.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with a parent-provided selection
  useEffect(() => { if (value) setChanging(false); }, [value?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!changing) return;
    const t = setTimeout(async () => {
      setSearchState("loading");
      try {
        const res = await fetch(`/api/platform-admin/school-links/schools?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        setResults(res.ok ? d.schools : []);
        setSearchState(res.ok ? "idle" : "failed");
      } catch {
        setResults([]);
        setSearchState("failed");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, changing]);

  async function choose(s: Result | CreatedSchool, auditRecorded = true) {
    setError("");
    setAuditWarning(auditRecorded ? "" : `The school was created, but its audit-log entry couldn't be recorded. Please tell the ELF team (school id ${s.id}).`);
    setLoadingId(s.id);
    const loaded = await loadSchool(s.id, s.label).catch(() => null);
    setLoadingId(null);
    if (!loaded) { setError("That school's settings couldn't be loaded. Try again."); return; }
    setCreating(false);
    setChanging(false);
    onChange(loaded);
  }

  if (value && !changing) {
    return (
      <div style={{ padding: ".85rem 1rem", borderRadius: 10, border: "1.5px solid #0b1e3d", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#0b1e3d", overflowWrap: "anywhere" }}>{value.label}</div>
          <div style={{ fontSize: ".75rem", color: "#4b5563", marginTop: ".15rem" }}>
            Community Partners: {partnerVisibilityText(value.org)} <span style={{ color: "#6b7280" }}>(the school&apos;s advertising settings)</span>
          </div>
          {note && <div style={{ fontSize: ".75rem", color: "#4b5563", marginTop: ".25rem" }}>{note}</div>}
          {auditWarning && <div role="alert" style={{ fontSize: ".75rem", color: "#92400e", marginTop: ".25rem" }}>{auditWarning}</div>}
        </div>
        <button type="button" style={btn(false)} onClick={() => { setChanging(true); setQuery(""); }}>Change school</button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="search" value={query} onChange={e => { setQuery(e.target.value); setError(""); }}
        placeholder="Search schools by name, city or state" aria-label="Search schools by name, city or state"
        style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "1rem", marginBottom: ".5rem" }}
      />
      {suggestedName && query === suggestedName && (
        <div style={{ fontSize: ".75rem", color: "#4b5563", marginBottom: ".4rem" }}>
          Search pre-filled from the CRM contact — select the matching school or create it.
        </div>
      )}
      <ul aria-label="Schools" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 260, overflowY: "auto", border: "1px solid #f0f0f2", borderRadius: 8 }}>
        {results.map(r => (
          <li key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", padding: ".35rem .6rem", borderTop: "1px solid #f5f5f7" }}>
            <span style={{ fontSize: ".85rem", color: "#1d1d1f", overflowWrap: "anywhere", minWidth: 0 }}>{r.label}</span>
            <button type="button" style={btn(value?.id === r.id, loadingId !== null)} disabled={loadingId !== null} onClick={() => choose(r)}>
              {loadingId === r.id ? "Loading…" : value?.id === r.id ? "Selected" : "Select"}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li style={{ padding: ".6rem", fontSize: ".8rem", color: searchState === "failed" ? "#b45309" : "#6b7280" }}>
            {searchState === "failed" ? "Schools couldn't be loaded. Try searching again." : searchState === "loading" ? "Searching…" : query.trim() ? `No schools match “${query.trim()}”.` : "No schools yet."}
          </li>
        )}
      </ul>
      {error && <p role="alert" style={{ margin: ".5rem 0 0", fontSize: ".8rem", color: "#b91c1c" }}>{error}</p>}
      {creating ? (
        <CreateSchoolForm
          initialName={query}
          onCreated={(school, auditRecorded) => choose(school, auditRecorded)}
          onUseExisting={school => choose(school)}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div style={{ marginTop: ".5rem", display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={btn(results.length === 0 && !!query.trim())} onClick={() => setCreating(true)}>+ Create new school</button>
          {value && <button type="button" style={btn(false)} onClick={() => setChanging(false)}>Keep {value.label}</button>}
        </div>
      )}
    </div>
  );
}
