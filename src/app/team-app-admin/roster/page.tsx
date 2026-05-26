"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type Position = "Sprints" | "Distance" | "Jumps" | "Hurdles" | "Throws" | "Relays" | "Field Events";

const positions: Position[] = ["Sprints", "Distance", "Jumps", "Hurdles", "Throws", "Relays", "Field Events"];

const avatarGrads = [
  { bg: "linear-gradient(135deg, #0B1E3D, #1A3A5C)", text: "#C9A84C" },
  { bg: "linear-gradient(135deg, #C9A84C, #F0C040)",  text: "#0B1E3D" },
  { bg: "linear-gradient(135deg, #1A3A5C, #2A5080)",  text: "#FFFFFF" },
  { bg: "linear-gradient(135deg, #374151, #4B5563)",   text: "#FFFFFF" },
];

const emptyAthlete = { name: "", number: "", position: "Sprints" as Position, gradYear: "2025" };

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminRosterPage() {
  const { athletes: roster, setAthletes, teamInfo } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyAthlete });
  const [editForm, setEditForm] = useState({ ...emptyAthlete });

  type AthleteForm = typeof emptyAthlete;
  function F(setter: React.Dispatch<React.SetStateAction<AthleteForm>>) {
    return (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setter(f => ({ ...f, [field]: e.target.value }));
  }
  const setF  = F(setForm);
  const setEF = F(setEditForm);

  function handleAdd() {
    if (!form.name.trim()) return;
    const initials = form.name.trim().split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const newAthlete = {
      id: Date.now(),
      name: form.name.trim(),
      number: Number(form.number) || 0,
      position: form.position,
      gradYear: Number(form.gradYear) || 2025,
      initials,
    };
    setAthletes([...roster, newAthlete]);
    setForm({ ...emptyAthlete });
    setAdding(false);
  }

  function startEdit(a: typeof roster[0]) {
    setEditForm({ name: a.name, number: String(a.number), position: a.position as Position, gradYear: String(a.gradYear) });
    setEditingId(a.id);
  }

  function handleSaveEdit() {
    setAthletes(roster.map(a => {
      if (a.id !== editingId) return a;
      const initials = editForm.name.trim().split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
      return { ...a, name: editForm.name.trim(), number: Number(editForm.number), position: editForm.position, gradYear: Number(editForm.gradYear), initials };
    }));
    setEditingId(null);
  }

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Roster</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
            {teamInfo.shortName} {teamInfo.mascot} &middot; {roster.length} athletes
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Athlete
          </button>
        )}
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {adding && (
          <div className="ta-adm-card" style={{ padding: "20px 24px", border: "1.5px solid #C9A84C" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", marginBottom: 16 }}>New Athlete</p>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <Label>Full Name</Label>
                <input className="ta-adm-input" placeholder="First Last" value={form.name} onChange={setF("name")} />
              </div>
              <div>
                <Label>Jersey #</Label>
                <input className="ta-adm-input" type="number" placeholder="0" value={form.number} onChange={setF("number")} />
              </div>
              <div>
                <Label>Position</Label>
                <select className="ta-adm-select" value={form.position} onChange={setF("position")}>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <Label>Grad Year</Label>
                <input className="ta-adm-input" type="number" placeholder="2025" value={form.gradYear} onChange={setF("gradYear")} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setAdding(false); setForm({ ...emptyAthlete }); }} style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAdd} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Add Athlete</button>
            </div>
          </div>
        )}

        <div className="ta-adm-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1.5fr 1fr 120px", padding: "12px 20px", borderBottom: "1px solid #F0EDE8", background: "#FAFAF9" }}>
            {["Athlete", "#", "Position", "Class", "Actions"].map(h => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</p>
            ))}
          </div>

          {roster.map((a, i) => {
            const pal = avatarGrads[i % avatarGrads.length];
            const isEditing = editingId === a.id;
            const isDeleting = deletingId === a.id;

            if (isEditing) {
              return (
                <div key={a.id} style={{ padding: "12px 20px", borderBottom: i < roster.length - 1 ? "1px solid #F0EDE8" : "none", background: "rgba(201,168,76,0.04)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1.5fr 1fr 120px", gap: 10, alignItems: "center" }}>
                    <input className="ta-adm-input" value={editForm.name} onChange={setEF("name")} />
                    <input className="ta-adm-input" type="number" value={editForm.number} onChange={setEF("number")} />
                    <select className="ta-adm-select" value={editForm.position} onChange={setEF("position")}>
                      {positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input className="ta-adm-input" type="number" value={editForm.gradYear} onChange={setEF("gradYear")} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={handleSaveEdit} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={a.id}
                className="ta-adm-row"
                style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1.5fr 1fr 120px", padding: "12px 20px", alignItems: "center", borderBottom: i < roster.length - 1 ? "1px solid #F0EDE8" : "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: pal.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: pal.text, flexShrink: 0 }}>
                    {a.initials}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>{a.name}</p>
                </div>
                <p style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>#{a.number}</p>
                <p style={{ fontSize: 13, color: "#374151" }}>{a.position}</p>
                <p style={{ fontSize: 13, color: "#374151" }}>&apos;{String(a.gradYear).slice(2)}</p>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button className="ta-adm-icon-btn" onClick={() => startEdit(a)} title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  {isDeleting ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <button onClick={() => { setAthletes(roster.filter(x => x.id !== a.id)); setDeletingId(null); }} style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Del</button>
                      <button onClick={() => setDeletingId(null)} style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F3F4F6", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>No</button>
                    </div>
                  ) : (
                    <button className="ta-adm-icon-btn danger" onClick={() => setDeletingId(a.id)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {roster.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>No athletes yet. Add your first one above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
