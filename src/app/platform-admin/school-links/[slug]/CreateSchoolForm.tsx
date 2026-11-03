"use client";

import { useId, useState } from "react";
import { US_STATES } from "@/lib/platform/usStates";

// "Create new school" inside School Links step 2. Creates the school record
// only (POST /api/platform-admin/school-links/schools); the panel then
// selects it, and nothing is linked until Preview + Confirm. The server
// re-validates everything and owns duplicate detection — the checks here
// only save a round trip.

export type CreatedSchool = { id: string; slug: string; label: string };
type Field = "school_name" | "city" | "state";
type Problem =
  | { kind: "field"; field: Field; text: string }
  | { kind: "duplicate"; existing: CreatedSchool }
  | { kind: "similar"; similar: CreatedSchool[] }
  | { kind: "error"; text: string };

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  width: "100%", boxSizing: "border-box", minHeight: 44, padding: ".5rem .7rem", borderRadius: 8,
  border: `1px solid ${invalid ? "#b91c1c" : "#d1d5db"}`, fontSize: "1rem", background: "#fff",
});
const labelStyle: React.CSSProperties = { display: "block", fontSize: ".8rem", fontWeight: 700, color: "#374151", marginBottom: ".25rem" };
const errStyle: React.CSSProperties = { display: "block", marginTop: ".25rem", fontSize: ".78rem", color: "#b91c1c" };
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  minHeight: 44, padding: ".5rem 1rem", borderRadius: 8, fontSize: ".88rem", fontWeight: 700, cursor: disabled ? "default" : "pointer",
  border: primary ? "none" : "1px solid #d1d5db", background: primary ? (disabled ? "#9ca3af" : "#0b1e3d") : "#fff", color: primary ? "#fff" : "#111",
});

export default function CreateSchoolForm({
  initialName,
  onCreated,
  onUseExisting,
  onCancel,
}: {
  initialName: string;
  onCreated: (school: CreatedSchool, auditRecorded: boolean) => void;
  onUseExisting: (school: CreatedSchool) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initialName.trim());
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [differentSchool, setDifferentSchool] = useState(false);

  const fieldError = (f: Field) => (problem?.kind === "field" && problem.field === f ? problem.text : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) return setProblem({ kind: "field", field: "school_name", text: "Enter the school's name." });
    if (!city.trim()) return setProblem({ kind: "field", field: "city", text: "Enter the city." });
    if (!state) return setProblem({ kind: "field", field: "state", text: "Choose a state." });
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/platform-admin/school-links/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_name: name, city, state, acknowledgeSimilar: differentSchool }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 201) return onCreated(d.school, d.auditRecorded !== false);
      if (res.status === 409 && d.code === "duplicate") return setProblem({ kind: "duplicate", existing: d.existing });
      if (res.status === 409 && d.code === "similar") return setProblem({ kind: "similar", similar: d.similar });
      if (res.status === 400 && d.field) return setProblem({ kind: "field", field: d.field, text: d.error });
      setProblem({ kind: "error", text: d.error ?? "The school couldn't be created. Nothing was changed." });
    } catch {
      setProblem({ kind: "error", text: "The school couldn't be created — check your connection. Nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      noValidate
      style={{ marginTop: ".6rem", padding: ".85rem", borderRadius: 10, border: "1px solid #d1d5db", background: "#f8fafc", display: "flex", flexDirection: "column", gap: ".7rem" }}
    >
      <div>
        <h3 id={`${id}-title`} style={{ margin: 0, fontSize: ".95rem", color: "#0b1e3d" }}>Create a new school</h3>
        <p style={{ margin: ".2rem 0 0", fontSize: ".8rem", color: "#4b5563" }}>
          Adds the school to the directory and selects it here. No season is linked until you preview and confirm.
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-name`} style={labelStyle}>School name</label>
        <input
          id={`${id}-name`} value={name} onChange={e => { setName(e.target.value); setProblem(null); setDifferentSchool(false); }}
          autoComplete="off" maxLength={120} required style={inputStyle(!!fieldError("school_name"))}
          aria-invalid={!!fieldError("school_name")} aria-describedby={fieldError("school_name") ? `${id}-name-err` : undefined}
        />
        {fieldError("school_name") && <span id={`${id}-name-err`} style={errStyle}>{fieldError("school_name")}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 7rem", gap: ".6rem" }}>
        <div>
          <label htmlFor={`${id}-city`} style={labelStyle}>City</label>
          <input
            id={`${id}-city`} value={city} onChange={e => { setCity(e.target.value); setProblem(null); }}
            autoComplete="address-level2" maxLength={80} required style={inputStyle(!!fieldError("city"))}
            aria-invalid={!!fieldError("city")} aria-describedby={fieldError("city") ? `${id}-city-err` : undefined}
          />
          {fieldError("city") && <span id={`${id}-city-err`} style={errStyle}>{fieldError("city")}</span>}
        </div>
        <div>
          <label htmlFor={`${id}-state`} style={labelStyle}>State</label>
          <select
            id={`${id}-state`} value={state} onChange={e => { setState(e.target.value); setProblem(null); }}
            autoComplete="address-level1" required style={inputStyle(!!fieldError("state"))}
            aria-invalid={!!fieldError("state")} aria-describedby={fieldError("state") ? `${id}-state-err` : undefined}
          >
            <option value="">—</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {fieldError("state") && <span id={`${id}-state-err`} style={errStyle}>{fieldError("state")}</span>}
        </div>
      </div>

      {problem?.kind === "duplicate" && (
        <div role="alert" style={{ padding: ".6rem .7rem", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: ".84rem", color: "#92400e" }}>
          <strong>This school already exists:</strong> {problem.existing.label}.
          <div style={{ marginTop: ".5rem" }}>
            <button type="button" style={btn(true)} onClick={() => onUseExisting(problem.existing)}>Use this school</button>
          </div>
        </div>
      )}

      {problem?.kind === "similar" && (
        <div role="alert" style={{ padding: ".6rem .7rem", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: ".84rem", color: "#92400e" }}>
          <strong>A school with this name already exists:</strong>
          <ul style={{ margin: ".35rem 0", paddingLeft: "1.1rem" }}>
            {problem.similar.map(s => (
              <li key={s.id} style={{ marginBottom: ".25rem" }}>
                {s.label}{" "}
                <button type="button" style={{ ...btn(false), minHeight: 36, padding: ".25rem .6rem", fontSize: ".8rem" }} onClick={() => onUseExisting(s)}>Use this one</button>
              </li>
            ))}
          </ul>
          <label style={{ display: "flex", gap: ".5rem", alignItems: "center", minHeight: 44, cursor: "pointer", color: "#374151" }}>
            <input type="checkbox" checked={differentSchool} onChange={e => setDifferentSchool(e.target.checked)} />
            This is a different school in {city.trim() || "another city"}{state ? `, ${state}` : ""}
          </label>
        </div>
      )}

      {problem?.kind === "error" && (
        <p role="alert" style={{ margin: 0, fontSize: ".84rem", color: "#b91c1c" }}>{problem.text}</p>
      )}

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <button
          type="submit" style={btn(true, busy || (problem?.kind === "similar" && !differentSchool))}
          disabled={busy || (problem?.kind === "similar" && !differentSchool)} aria-busy={busy}
        >
          {busy ? "Creating…" : problem?.kind === "similar" ? "Create as a different school" : "Create school"}
        </button>
        <button type="button" style={btn(false)} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
