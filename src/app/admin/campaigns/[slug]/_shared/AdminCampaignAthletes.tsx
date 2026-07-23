"use client";

import { useState, useEffect } from "react";
import { T, SectionHeader, Field, useToast, Toast } from "./ui";

const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

type AthleteRow = {
  id: string;
  name: string;
  event: string | null;
  class_year: string | null;
  linked_accounts: number;
};

type AthleteForm = { name: string; event: string; class_year: string };
const BLANK: AthleteForm = { name: "", event: "", class_year: "" };

export default function AdminCampaignAthletes({ slug }: { slug: string }) {
  const { toast, show } = useToast();
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");

  const [newForm, setNewForm]   = useState<AthleteForm>(BLANK);
  const [adding, setAdding]     = useState(false);

  const [editId, setEditId]     = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AthleteForm>(BLANK);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/campaigns/${slug}/athletes`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((rows: AthleteRow[]) => { if (!cancelled) { setAthletes(rows); setLoadError(""); } })
      .catch(() => { if (!cancelled) setLoadError("Failed to load roster."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const handleAdd = async () => {
    if (!newForm.name.trim() || !newForm.class_year) { show("Name and class are required.", "error"); return; }
    setAdding(true);
    const res = await fetch(`/api/admin/campaigns/${slug}/athletes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newForm.name.trim(), event: newForm.event.trim() || null, class_year: newForm.class_year }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { show(data.error ?? "Failed to add athlete.", "error"); return; }
    setAthletes(prev => [...prev, { ...data, linked_accounts: 0 }]);
    setNewForm(BLANK);
    show("Athlete added.");
  };

  const openEdit = (a: AthleteRow) => {
    setEditId(a.id);
    setEditForm({ name: a.name, event: a.event ?? "", class_year: a.class_year ?? "" });
  };

  const handleSaveEdit = async () => {
    if (!editId || !editForm.name.trim() || !editForm.class_year) { show("Name and class are required.", "error"); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/campaigns/${slug}/athletes/${editId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name.trim(), event: editForm.event.trim() || null, class_year: editForm.class_year }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { show(data.error ?? "Failed to update athlete.", "error"); return; }
    setAthletes(prev => prev.map(a => a.id === editId ? { ...a, name: editForm.name.trim(), event: editForm.event.trim() || null, class_year: editForm.class_year } : a));
    setEditId(null);
    show("Athlete updated.");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from the roster? Their historical donation totals are preserved, but this cannot be undone.`)) return;
    const res = await fetch(`/api/admin/campaigns/${slug}/athletes/${id}`, { method: "DELETE" });
    if (res.ok) { setAthletes(prev => prev.filter(a => a.id !== id)); show("Athlete deleted."); }
    else show("Failed to delete athlete.", "error");
  };

  return (
    <div style={T.card}>
      <SectionHeader title="Athletes" desc={`${athletes.length} athlete${athletes.length !== 1 ? "s" : ""} on the roster`} />

      {loading ? (
        <div style={{ padding: "1.5rem", textAlign: "center", fontSize: ".8rem", color: "#98989d" }}>Loading roster…</div>
      ) : loadError ? (
        <div style={{ padding: "1rem", textAlign: "center", fontSize: ".8rem", color: "#dc2626" }}>{loadError}</div>
      ) : (
        <>
          {athletes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginBottom: "1.1rem" }}>
              {athletes.map(a => (
                editId === a.id ? (
                  <div key={a.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-end", padding: ".65rem", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fafafa", flexWrap: "wrap" }}>
                    <Field label="Name"><input style={{ ...T.input, width: 160 }} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></Field>
                    <Field label="Class">
                      <select style={{ ...T.input, width: 130 }} value={editForm.class_year} onChange={e => setEditForm(f => ({ ...f, class_year: e.target.value }))}>
                        <option value="">Select…</option>
                        {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Event (optional)"><input style={{ ...T.input, width: 140 }} value={editForm.event} onChange={e => setEditForm(f => ({ ...f, event: e.target.value }))} placeholder="Sprints" /></Field>
                    <div style={{ display: "flex", gap: ".4rem" }}>
                      <button onClick={handleSaveEdit} disabled={saving} style={{ padding: ".45rem .8rem", background: saving ? "#9ca3af" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                      <button onClick={() => setEditId(null)} style={{ padding: ".45rem .8rem", background: "#f5f5f7", color: "#374151", border: "none", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem .65rem", borderRadius: 10, border: "1px solid #f0f0f2" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: ".84rem", color: "#1d1d1f" }}>{a.name}</span>
                        <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: ".1rem .45rem", borderRadius: 100 }}>{a.class_year ?? "—"}</span>
                        {a.linked_accounts > 0 ? (
                          <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: ".1rem .4rem", borderRadius: 100, textTransform: "uppercase" }}>
                            {a.linked_accounts > 1 ? `${a.linked_accounts} accounts linked` : "Account linked"}
                          </span>
                        ) : (
                          <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", background: "#f3f4f6", padding: ".1rem .4rem", borderRadius: 100, textTransform: "uppercase" }}>
                            Unclaimed
                          </span>
                        )}
                      </div>
                      {a.event && <div style={{ fontSize: ".7rem", color: "#98989d", marginTop: ".1rem" }}>{a.event}</div>}
                    </div>
                    <div style={{ display: "flex", gap: ".4rem", flexShrink: 0 }}>
                      <button onClick={() => openEdit(a)} style={{ padding: ".35rem .65rem", background: "#f5f5f7", border: "none", borderRadius: 7, fontSize: ".72rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}>Edit</button>
                      <button onClick={() => handleDelete(a.id, a.name)} style={{ padding: ".35rem .65rem", background: "#fef2f2", border: "none", borderRadius: 7, fontSize: ".72rem", fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: ".6rem", alignItems: "flex-end", padding: ".85rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2", flexWrap: "wrap" }}>
            <Field label="Name"><input style={{ ...T.input, width: 170 }} value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Athlete name" /></Field>
            <Field label="Class">
              <select style={{ ...T.input, width: 130 }} value={newForm.class_year} onChange={e => setNewForm(f => ({ ...f, class_year: e.target.value }))}>
                <option value="">Select…</option>
                {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Event (optional)"><input style={{ ...T.input, width: 140 }} value={newForm.event} onChange={e => setNewForm(f => ({ ...f, event: e.target.value }))} placeholder="Sprints" /></Field>
            <button onClick={handleAdd} disabled={adding} style={{ padding: ".5rem .9rem", background: adding ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: ".78rem", fontWeight: 600, cursor: adding ? "not-allowed" : "pointer" }}>
              {adding ? "Adding…" : "+ Add"}
            </button>
          </div>
        </>
      )}

      <Toast toast={toast} />
    </div>
  );
}
