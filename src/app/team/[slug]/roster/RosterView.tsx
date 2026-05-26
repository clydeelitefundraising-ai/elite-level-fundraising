"use client";

import { useState } from "react";
import type { TeamAthleteRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Style tokens ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: ".875rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".75rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

// ── Helpers ───────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const colors = ["#bfdbfe", "#bbf7d0", "#fde68a", "#fecaca", "#e9d5ff", "#fed7aa", "#cffafe", "#d1fae5"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[hash % colors.length];
}

// ── Form type ─────────────────────────────────────────────────────────────────────

type AthForm = {
  name: string;
  event: string;
  jersey_number: string;
  grad_year: string;
};

const BLANK: AthForm = { name: "", event: "", jersey_number: "", grad_year: "" };

function fromRow(a: TeamAthleteRow): AthForm {
  return {
    name:          a.name,
    event:         a.event,
    jersey_number: a.jersey_number != null ? String(a.jersey_number) : "",
    grad_year:     a.grad_year     != null ? String(a.grad_year)     : "",
  };
}

// ── Main component ────────────────────────────────────────────────────────────────

export default function RosterView({
  slug,
  initialAthletes,
  coach,
}: {
  slug: string;
  initialAthletes: TeamAthleteRow[];
  coach: CoachSession | null;
}) {
  const [athletes, setAthletes] = useState<TeamAthleteRow[]>(initialAthletes);
  const [form,     setForm]     = useState<AthForm>(BLANK);
  const [editing,  setEditing]  = useState<TeamAthleteRow | null>(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const openAdd = () => { setForm(BLANK); setError(""); setShowAdd(true); };

  const openEdit = (a: TeamAthleteRow) => { setForm(fromRow(a)); setError(""); setEditing(a); };

  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.event.trim()) { setError("Name and event are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add athlete."); return; }
    setAthletes(prev => [...prev, data]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.name.trim() || !form.event.trim()) { setError("Name and event are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update athlete."); return; }
    setAthletes(prev => prev.map(a =>
      a.id === editing.id
        ? { ...a, name: form.name.trim(), event: form.event.trim(), jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null, grad_year: form.grad_year ? parseInt(form.grad_year) : null }
        : a
    ));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this athlete from the roster?")) return;
    const res = await fetch(`/api/team/${slug}/roster/${id}`, { method: "DELETE" });
    if (res.ok) setAthletes(prev => prev.filter(a => a.id !== id));
  };

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <>
      {/* Section header + CoachBar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
        <h2 style={{ margin: 0, fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
          Roster · {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
        </h2>
        <CoachBar coach={coach} label="Add Athlete" onAdd={openAdd} />
      </div>

      {athletes.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "2rem 1.25rem", textAlign: "center", color: "#9ca3af", fontSize: ".9rem", border: "1px solid #f0f0f0" }}>
          Roster coming soon.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: ".75rem" }}>
          {athletes.map(a => {
            const bg = avatarColor(a.name);
            return (
              <div key={a.id} style={{ background: "#fff", borderRadius: 12, padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: ".5rem" }}>
                {a.profile_photo ? (
                  <img src={a.profile_photo} alt={a.name} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.05rem", color: "#374151" }}>
                    {initials(a.name)}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827", lineHeight: 1.2 }}>
                    {a.name}
                    {a.jersey_number != null && <span style={{ marginLeft: ".35rem", fontSize: ".78rem", color: "#6b7280", fontWeight: 600 }}>#{a.jersey_number}</span>}
                  </div>
                  {a.event && <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".2rem" }}>{a.event}</div>}
                  {a.grad_year != null && <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".15rem" }}>Class of &apos;{String(a.grad_year).slice(-2)}</div>}
                </div>
                {/* Coach actions */}
                {coach && (
                  <div style={{ display: "flex", gap: ".35rem", marginTop: ".1rem" }}>
                    <button onClick={() => openEdit(a)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: ".2rem .55rem", fontSize: ".7rem", color: "#374151", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                    {coach.role === "head_coach" && (
                      <button onClick={() => handleDelete(a.id)} style={{ background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: ".2rem .55rem", fontSize: ".7rem", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Athlete" : "Add Athlete"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Name *
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Athlete name" autoFocus />
              </label>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Event / Position *
                <input style={inp} value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} placeholder="e.g. Sprints, Distance, Jumps" />
              </label>
              <label style={lbl}>
                Jersey #
                <input type="number" style={inp} value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))} placeholder="Optional" />
              </label>
              <label style={lbl}>
                Grad Year
                <input type="number" style={inp} value={form.grad_year} onChange={e => setForm(f => ({ ...f, grad_year: e.target.value }))} placeholder="e.g. 2027" />
              </label>
            </div>
            {error && <p style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} style={{ padding: ".45rem .9rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} style={{ padding: ".45rem .9rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Athlete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
