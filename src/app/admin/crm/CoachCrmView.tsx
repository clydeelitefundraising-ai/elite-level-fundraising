"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CRM_STATUSES, CRM_STATUS_LABELS, CRM_ACTIVITY_TYPES,
} from "./types";
import type { CrmContact, CrmActivity, CrmData, CrmStatus, CrmActivityType } from "./types";

type Props = { data: CrmData };

// ── Style helpers ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: ".5rem .75rem", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: ".85rem", color: "#1d1d1f", background: "#fff",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: ".7rem", fontWeight: 600, color: "#6e6e73",
  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".3rem",
};

const sectionLabel: React.CSSProperties = {
  fontSize: ".68rem", fontWeight: 700, color: "#94a3b8",
  letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem",
};

const STATUS_COLOR: Record<CrmStatus, { bg: string; text: string }> = {
  prospect:       { bg: "#f3f4f6", text: "#374151" },
  contacted:      { bg: "#eff6ff", text: "#1e40af" },
  demo_scheduled: { bg: "#fef3c7", text: "#92400e" },
  proposal_sent:  { bg: "#ede9fe", text: "#6d28d9" },
  signed:         { bg: "#dcfce7", text: "#166534" },
  active:         { bg: "#dcfce7", text: "#166534" },
  returning:      { bg: "#d1fae5", text: "#065f46" },
  lost:           { bg: "#fee2e2", text: "#991b1b" },
};

function money(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ status }: { status: CrmStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap" }}>
      {CRM_STATUS_LABELS[status]}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, sublabel }: { label: string; value: string | number; icon: string; sublabel?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      {sublabel && <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".2rem" }}>{sublabel}</div>}
      <div style={{ fontSize: ".73rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachCrmView({ data }: Props) {
  const router = useRouter();
  const { summary, pipeline, followUpsDue, recentActivity } = data;

  const [contacts, setContacts]     = useState<CrmContact[]>(data.contacts);
  const [statusFilter, setStatusFilter] = useState<CrmStatus | "all">("all");
  const [query, setQuery]           = useState("");
  const [showNew, setShowNew]       = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = contacts.find(c => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.name, c.school_name, c.sport, c.city, c.email]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [contacts, statusFilter, query]);

  function upsertContact(updated: CrmContact) {
    setContacts(prev => {
      const exists = prev.some(c => c.id === updated.id);
      return exists ? prev.map(c => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
  }

  async function createContact(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to create contact.");
    }
    const contact = await res.json() as CrmContact;
    upsertContact(contact);
    setShowNew(false);
    setSelectedId(contact.id);
    router.refresh();
  }

  async function patchContact(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/crm/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to update contact.");
    }
    const contact = await res.json() as CrmContact;
    upsertContact(contact);
    router.refresh();
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Coach CRM</h2>
          <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
            Track sales prospects, demos, proposals, and signed teams.
          </div>
        </div>
        <button onClick={() => setShowNew(true)} style={primaryBtn}>
          + New Contact
        </button>
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Total Contacts"    value={summary.totalContacts}    icon="📇" />
          <StatCard label="Open Prospects"    value={summary.openProspects}    icon="🔎" />
          <StatCard label="Demos Scheduled"   value={summary.demosScheduled}   icon="🖥" />
          <StatCard label="Proposals Sent"    value={summary.proposalsSent}    icon="📝" />
          <StatCard label="Signed / Active"   value={summary.signedActive}     icon="✅" />
          <StatCard label="Pipeline Value"    value={money(summary.estimatedPipeline)} icon="💰" />
          <StatCard label="Follow-ups Due"    value={summary.followUpsDue}     icon="⏰" />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: "1.5rem", alignItems: "start" }}>
        <div>
          {/* Filters */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search name, school, sport, city, email…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ ...inputStyle, maxWidth: 320 }}
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CrmStatus | "all")} style={{ ...inputStyle, width: "auto" }}>
                <option value="all">All statuses</option>
                {CRM_STATUSES.map(s => <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </section>

          {/* Follow-ups due */}
          {followUpsDue.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <div style={sectionLabel}>Follow-ups Due Soon</div>
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: ".25rem 1rem" }}>
                {followUpsDue.slice(0, 6).map(c => (
                  <div key={c.id} onClick={() => setSelectedId(c.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".6rem 0", borderBottom: "1px solid #fde68a", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#92400e" }}>{c.name}</div>
                      <div style={{ fontSize: ".7rem", color: "#b45309" }}>{c.school_name ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#92400e" }}>{fmtDate(c.next_follow_up_at)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pipeline by status */}
          <section style={{ marginBottom: "2rem" }}>
            <div style={sectionLabel}>Pipeline</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
              {CRM_STATUSES.map(status => (
                <div key={status} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".9rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".6rem" }}>
                    <StatusBadge status={status} />
                    <span style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 600 }}>{pipeline[status].length}</span>
                  </div>
                  {pipeline[status].length === 0 ? (
                    <div style={{ fontSize: ".72rem", color: "#c7c7cc" }}>None</div>
                  ) : (
                    pipeline[status].slice(0, 4).map(c => (
                      <div key={c.id} onClick={() => setSelectedId(c.id)}
                        style={{ fontSize: ".76rem", color: "#374151", padding: ".3rem 0", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}>
                        {c.name}{c.school_name ? ` · ${c.school_name}` : ""}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Contact list */}
          <section style={{ marginBottom: "2rem" }}>
            <div style={sectionLabel}>Contacts ({filtered.length})</div>
            {filtered.length === 0 ? (
              <EmptyState onAdd={() => setShowNew(true)} />
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                {filtered.map(c => (
                  <ContactRow key={c.id} contact={c} onClick={() => setSelectedId(c.id)} selected={c.id === selectedId} />
                ))}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section>
            <div style={sectionLabel}>Recent Activity</div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".25rem 1rem" }}>
              {recentActivity.length === 0 ? (
                <div style={{ padding: "1.5rem 0", textAlign: "center", fontSize: ".78rem", color: "#94a3b8" }}>No activity yet</div>
              ) : (
                recentActivity.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f" }}>{a.title}</div>
                      <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: ".1rem" }}>{a.activity_type} · {relativeTime(a.activity_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Detail panel */}
        {selected && (
          <ContactDetail
            contact={selected}
            onClose={() => setSelectedId(null)}
            onPatch={patch => patchContact(selected.id, patch)}
          />
        )}
      </div>

      {showNew && (
        <NewContactModal onClose={() => setShowNew(false)} onCreate={createContact} />
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: ".55rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const secondaryBtn: React.CSSProperties = {
  padding: ".5rem 1rem", background: "#fff", color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>📇</div>
      <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No CRM contacts yet</div>
      <div style={{ fontSize: ".75rem", color: "#94a3b8", margin: ".35rem 0 1rem" }}>
        Add your first coach or prospect to start tracking the pipeline.
      </div>
      <button onClick={onAdd} style={primaryBtn}>+ Add First Contact</button>
    </div>
  );
}

function ContactRow({ contact, onClick, selected }: { contact: CrmContact; onClick: () => void; selected: boolean }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "1rem", padding: ".75rem 1rem",
      borderBottom: "1px solid #f3f4f6", cursor: "pointer",
      background: selected ? "#f8fafc" : "transparent",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".84rem", fontWeight: 600, color: "#1d1d1f" }}>{contact.name}</div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: ".1rem" }}>
          {[contact.school_name, contact.sport, contact.city].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
      {contact.estimated_value != null && (
        <div style={{ fontSize: ".78rem", fontWeight: 600, color: "#16a34a" }}>{money(contact.estimated_value)}</div>
      )}
      <StatusBadge status={contact.status} />
    </div>
  );
}

// ── New contact modal ─────────────────────────────────────────────────────────

function NewContactModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", school_name: "", sport: "", city: "", state: "AZ",
    status: "prospect" as CrmStatus, source: "", estimated_value: "", expected_close_date: "",
    next_follow_up_at: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function submit() {
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr("");
    try {
      await onCreate({
        ...form,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
        next_follow_up_at: form.next_follow_up_at ? new Date(form.next_follow_up_at).toISOString() : null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="New CRM Contact" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Field label="Name *">
          <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Status">
          <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CrmStatus })}>
            {CRM_STATUSES.map(s => <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Email">
          <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="School Name">
          <input style={inputStyle} value={form.school_name} onChange={e => setForm({ ...form, school_name: e.target.value })} />
        </Field>
        <Field label="Sport">
          <input style={inputStyle} value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value })} />
        </Field>
        <Field label="City">
          <input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State">
          <input style={inputStyle} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
        </Field>
        <Field label="Source">
          <input style={inputStyle} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Referral, cold outreach, etc." />
        </Field>
        <Field label="Estimated Value ($)">
          <input type="number" style={inputStyle} value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} />
        </Field>
        <Field label="Expected Close Date">
          <input type="date" style={inputStyle} value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })} />
        </Field>
        <Field label="Next Follow-up">
          <input type="date" style={inputStyle} value={form.next_follow_up_at} onChange={e => setForm({ ...form, next_follow_up_at: e.target.value })} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Notes">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: ".78rem", marginTop: ".75rem" }}>{err}</div>}

      <div style={{ display: "flex", gap: ".6rem", marginTop: "1.25rem" }}>
        <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Create Contact"}</button>
        <button onClick={onClose} style={secondaryBtn}>Cancel</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1d1d1f" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.1rem", color: "#94a3b8", cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Contact detail panel ──────────────────────────────────────────────────────

function ContactDetail({ contact, onClose, onPatch }: {
  contact: CrmContact;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState(contact);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");
  const [activities, setActivities] = useState<CrmActivity[] | null>(null);
  const [loadingAct, setLoadingAct] = useState(false);
  const [newNote, setNewNote]     = useState("");
  const [noteType, setNoteType]   = useState<CrmActivityType>("note");
  const [addingNote, setAddingNote] = useState(false);

  async function loadActivities() {
    setLoadingAct(true);
    try {
      const res = await fetch(`/api/admin/crm/activities?contact_id=${contact.id}`);
      if (res.ok) setActivities(await res.json());
    } finally {
      setLoadingAct(false);
    }
  }

  useEffect(() => {
    setActivities(null);
    void loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await onPatch({
        name: form.name, email: form.email, phone: form.phone,
        school_name: form.school_name, sport: form.sport, city: form.city, state: form.state,
        source: form.source, estimated_value: form.estimated_value,
        expected_close_date: form.expected_close_date, next_follow_up_at: form.next_follow_up_at,
        notes: form.notes,
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: CrmStatus) {
    await onPatch({ status });
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch("/api/admin/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id, activity_type: noteType, title: newNote.trim() }),
      });
      if (res.ok) {
        setNewNote("");
        await loadActivities();
      }
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.25rem", position: "sticky", top: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".75rem" }}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#1d1d1f" }}>{contact.name}</div>
          <div style={{ marginTop: ".3rem" }}><StatusBadge status={contact.status} /></div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1rem", color: "#94a3b8", cursor: "pointer" }}>✕</button>
      </div>

      <Field label="Change Status">
        <select style={inputStyle} value={contact.status} onChange={e => changeStatus(e.target.value as CrmStatus)}>
          {CRM_STATUSES.map(s => <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>)}
        </select>
      </Field>

      <div style={{ marginTop: ".75rem" }}>
        <Field label="Next Follow-up">
          <input type="date" style={inputStyle}
            value={contact.next_follow_up_at ? contact.next_follow_up_at.slice(0, 10) : ""}
            onChange={e => onPatch({ next_follow_up_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
      </div>

      {!editing ? (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".45rem", fontSize: ".8rem", color: "#374151" }}>
          <DetailLine label="Email" value={contact.email} />
          <DetailLine label="Phone" value={contact.phone} />
          <DetailLine label="School" value={contact.school_name} />
          <DetailLine label="Sport" value={contact.sport} />
          <DetailLine label="City / State" value={[contact.city, contact.state].filter(Boolean).join(", ") || null} />
          <DetailLine label="Source" value={contact.source} />
          <DetailLine label="Est. Value" value={contact.estimated_value != null ? money(contact.estimated_value) : null} />
          <DetailLine label="Expected Close" value={contact.expected_close_date ? fmtDate(contact.expected_close_date) : null} />
          <DetailLine label="Last Contacted" value={contact.last_contacted_at ? fmtDate(contact.last_contacted_at) : null} />
          {contact.notes && <DetailLine label="Notes" value={contact.notes} />}
          <button onClick={() => { setForm(contact); setEditing(true); }} style={{ ...secondaryBtn, marginTop: ".5rem" }}>Edit Details</button>
        </div>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <Field label="Email"><input style={inputStyle} value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input style={inputStyle} value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="School"><input style={inputStyle} value={form.school_name ?? ""} onChange={e => setForm({ ...form, school_name: e.target.value })} /></Field>
          <Field label="Sport"><input style={inputStyle} value={form.sport ?? ""} onChange={e => setForm({ ...form, sport: e.target.value })} /></Field>
          <Field label="City"><input style={inputStyle} value={form.city ?? ""} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="State"><input style={inputStyle} value={form.state ?? ""} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
          <Field label="Source"><input style={inputStyle} value={form.source ?? ""} onChange={e => setForm({ ...form, source: e.target.value })} /></Field>
          <Field label="Estimated Value ($)">
            <input type="number" style={inputStyle} value={form.estimated_value ?? ""} onChange={e => setForm({ ...form, estimated_value: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Expected Close Date">
            <input type="date" style={inputStyle} value={form.expected_close_date ? form.expected_close_date.slice(0, 10) : ""} onChange={e => setForm({ ...form, expected_close_date: e.target.value || null })} />
          </Field>
          <Field label="Notes">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {err && <div style={{ color: "#dc2626", fontSize: ".76rem" }}>{err}</div>}
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} style={secondaryBtn}>Cancel</button>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div style={{ marginTop: "1.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
        <div style={sectionLabel}>Add Activity</div>
        <div style={{ display: "flex", gap: ".4rem", marginBottom: ".5rem" }}>
          <select style={{ ...inputStyle, width: "auto" }} value={noteType} onChange={e => setNoteType(e.target.value as CrmActivityType)}>
            {CRM_ACTIVITY_TYPES.filter(t => t !== "status_change").map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} placeholder="What happened?"
          value={newNote} onChange={e => setNewNote(e.target.value)} />
        <button onClick={addNote} disabled={addingNote || !newNote.trim()} style={{ ...primaryBtn, marginTop: ".5rem", width: "100%" }}>
          {addingNote ? "Adding…" : "Add Activity"}
        </button>

        <div style={{ marginTop: "1rem" }}>
          <div style={sectionLabel}>Activity Log</div>
          {loadingAct && !activities ? (
            <div style={{ fontSize: ".75rem", color: "#94a3b8" }}>Loading…</div>
          ) : !activities || activities.length === 0 ? (
            <div style={{ fontSize: ".75rem", color: "#94a3b8" }}>No activity yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", maxHeight: 260, overflowY: "auto" }}>
              {activities.map(a => (
                <div key={a.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: ".5rem" }}>
                  <div style={{ fontSize: ".76rem", fontWeight: 600, color: "#1d1d1f" }}>{a.title}</div>
                  <div style={{ fontSize: ".66rem", color: "#94a3b8", marginTop: ".1rem" }}>{a.activity_type} · {relativeTime(a.activity_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: "#94a3b8", fontWeight: 500 }}>{label}: </span>
      <span>{value}</span>
    </div>
  );
}
