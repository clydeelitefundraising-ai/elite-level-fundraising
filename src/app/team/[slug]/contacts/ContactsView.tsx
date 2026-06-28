"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  relationship: string | null;
  relationship_other: string | null;
  notes: string | null;
  added_by_type: "athlete" | "parent" | "coach";
  created_at: string;
};

type ContactForm = {
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  relationship: string;
  relationship_other: string;
  notes: string;
};

const BLANK_FORM: ContactForm = {
  phone: "", email: "", first_name: "", last_name: "",
  relationship: "", relationship_other: "", notes: "",
};

const RELATIONSHIPS = ["Family","Friend","Coworker","Neighbor","Coach","Teacher","Business","Other"] as const;

// ── Styles ─────────────────────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  fontSize: ".9rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
  fontFamily: "inherit",
};

const LBL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 100, height: 8, overflow: "hidden" }}>
      <div style={{
        background: color, borderRadius: 100, height: "100%",
        width: `${Math.min(100, Math.max(0, pct))}%`,
        transition: "width .5s ease",
      }} />
    </div>
  );
}

function displayRelationship(c: Contact): string {
  if (!c.relationship) return "";
  if (c.relationship === "Other" && c.relationship_other) return c.relationship_other;
  return c.relationship;
}

function displayName(c: Contact): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.phone || c.email || "Contact";
}

function ContactCard({
  contact,
  onEdit,
  onDelete,
  primaryColor,
}: {
  contact: Contact;
  onEdit: (c: Contact) => void;
  onDelete: (id: string) => void;
  primaryColor: string;
}) {
  const rel = displayRelationship(contact);
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: ".75rem 1rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".5rem",
      display: "flex",
      alignItems: "flex-start",
      gap: ".75rem",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", background: primaryColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: ".85rem", color: "#fff", flexShrink: 0,
      }}>
        {displayName(contact)[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d", marginBottom: ".1rem" }}>
          {displayName(contact)}
        </div>
        {rel && (
          <div style={{ fontSize: ".72rem", color: "#6b7280", marginBottom: ".15rem" }}>{rel}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: ".1rem" }}>
          {contact.phone && (
            <div style={{ fontSize: ".78rem", color: "#374151" }}>📱 {contact.phone}</div>
          )}
          {contact.email && (
            <div style={{ fontSize: ".78rem", color: "#374151", wordBreak: "break-all" }}>✉️ {contact.email}</div>
          )}
        </div>
        {contact.notes && (
          <div style={{ fontSize: ".72rem", color: "#9ca3af", marginTop: ".2rem", lineHeight: 1.4 }}>
            {contact.notes}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: ".2rem", flexShrink: 0 }}>
        <button
          onClick={() => onEdit(contact)}
          style={{
            background: "none", border: "1px solid #e5e7eb", borderRadius: 7,
            fontSize: ".7rem", fontWeight: 600, color: "#374151",
            padding: ".25rem .55rem", cursor: "pointer",
          }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(contact.id)}
          style={{
            background: "none", border: "1px solid #fecaca", borderRadius: 7,
            fontSize: ".7rem", fontWeight: 600, color: "#dc2626",
            padding: ".25rem .55rem", cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ContactsView({
  slug,
  athleteId,
  memberRole,
  primaryColor,
}: {
  slug: string;
  athleteId: string;
  memberName: string;
  memberRole: string;
  primaryColor: string;
}) {
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [goal, setGoal]             = useState(10);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<Contact | null>(null);
  const [form, setForm]             = useState<ContactForm>(BLANK_FORM);
  const [error, setError]           = useState("");
  const [saving, setSaving]         = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  const pct = goal > 0 ? Math.round((contacts.length / goal) * 100) : 0;

  useEffect(() => {
    fetch(`/api/team/${slug}/contacts`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setContacts(d.contacts ?? []);
          setGoal(d.goal ?? 10);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const openAdd = () => {
    setForm(BLANK_FORM);
    setError("");
    setEditing(null);
    setShowModal(true);
    setTimeout(() => phoneRef.current?.focus(), 80);
  };

  const openEdit = (c: Contact) => {
    setForm({
      phone:              c.phone ?? "",
      email:              c.email ?? "",
      first_name:         c.first_name ?? "",
      last_name:          c.last_name ?? "",
      relationship:       c.relationship ?? "",
      relationship_other: c.relationship_other ?? "",
      notes:              c.notes ?? "",
    });
    setError("");
    setEditing(c);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setError(""); };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    const res = await fetch(`/api/team/${slug}/contacts/${id}`, { method: "DELETE" });
    if (res.ok) setContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleSave = async (andAddAnother: boolean) => {
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!phone && !email) {
      setError("At least one of phone or email is required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      phone:              phone || undefined,
      email:              email || undefined,
      first_name:         form.first_name.trim() || undefined,
      last_name:          form.last_name.trim() || undefined,
      relationship:       form.relationship || undefined,
      relationship_other: form.relationship === "Other" ? form.relationship_other.trim() || undefined : undefined,
      notes:              form.notes.trim() || undefined,
    };

    if (editing) {
      const res = await fetch(`/api/team/${slug}/contacts/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) { setError(data.error ?? "Failed to update."); return; }
      setContacts(prev => prev.map(c => c.id === editing.id ? { ...c, ...data } : c));
      closeModal();
    } else {
      const res = await fetch(`/api/team/${slug}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
      setContacts(prev => [data, ...prev]);
      if (andAddAnother) {
        setForm(BLANK_FORM);
        setError("");
        setTimeout(() => phoneRef.current?.focus(), 80);
      } else {
        closeModal();
      }
    }
  };

  const isEditing = editing !== null;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Back link */}
      <a
        href={`/team/${slug}/home`}
        style={{
          display: "inline-flex", alignItems: "center", gap: ".3rem",
          fontSize: ".8rem", fontWeight: 600, color: "#6b7280",
          textDecoration: "none", marginBottom: ".875rem",
        }}
      >
        ← Home
      </a>

      {/* Header */}
      <div style={{ marginBottom: ".75rem" }}>
        <div style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".1rem" }}>
          My Contacts
        </div>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
          Fundraising Contacts
        </h1>
        {memberRole === "parent" && (
          <p style={{ margin: ".3rem 0 0", fontSize: ".78rem", color: "#6b7280" }}>
            You and your athlete share this contact list.
          </p>
        )}
      </div>

      {/* Progress card */}
      <div style={{
        background: "#fff",
        borderRadius: 14,
        padding: "1rem 1.15rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".75rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".55rem" }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: "1.6rem", color: "#0b1e3d" }}>{contacts.length}</span>
            <span style={{ fontSize: ".82rem", color: "#6b7280", marginLeft: ".3rem" }}>of {goal} contacts</span>
          </div>
          <span style={{ fontSize: ".75rem", fontWeight: 700, color: pct >= 100 ? "#059669" : "#6b7280" }}>
            {Math.min(100, pct)}%
          </span>
        </div>
        <ProgressBar pct={pct} color={pct >= 100 ? "#059669" : primaryColor} />
        {pct >= 100 && (
          <p style={{ margin: ".5rem 0 0", fontSize: ".75rem", color: "#059669", fontWeight: 700 }}>
            🎉 Goal reached! Keep adding contacts to maximize your fundraiser.
          </p>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={openAdd}
        style={{
          width: "100%",
          padding: ".85rem",
          background: primaryColor,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          fontSize: ".95rem",
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: ".75rem",
          letterSpacing: ".02em",
        }}
      >
        + Add Contact
      </button>

      {/* Contact list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af", fontSize: ".85rem" }}>
          Loading…
        </div>
      ) : contacts.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No contacts yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            Add family, friends, neighbors — anyone who might support your fundraiser.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".45rem" }}>
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </div>
          {contacts.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              onEdit={openEdit}
              onDelete={handleDelete}
              primaryColor={primaryColor}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,.45)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: "#fff",
            borderRadius: "18px 18px 0 0",
            width: "min(430px, 100%)",
            maxHeight: "92vh",
            overflowY: "auto",
            padding: "1.25rem 1.1rem 2rem",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0b1e3d" }}>
                {isEditing ? "Edit Contact" : "Add Contact"}
              </div>
              <button
                onClick={closeModal}
                style={{
                  background: "#f3f4f6", border: "none", borderRadius: "50%",
                  width: 30, height: 30, cursor: "pointer",
                  fontSize: "1rem", color: "#6b7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Inject phoneRef onto the phone field */}
            <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                <label style={LBL}>
                  Phone
                  <input
                    ref={phoneRef}
                    type="tel"
                    placeholder="555-123-4567"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    style={{ ...INP, border: `1.5px solid ${form.phone ? primaryColor : "#e5e7eb"}` }}
                  />
                </label>
                <label style={LBL}>
                  Email
                  <input
                    type="email"
                    placeholder="name@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={{ ...INP, border: `1.5px solid ${form.email ? primaryColor : "#e5e7eb"}` }}
                  />
                </label>
              </div>
              <p style={{ margin: "-.5rem 0 0", fontSize: ".68rem", color: "#9ca3af" }}>
                Phone or email required — both is better.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                <label style={LBL}>
                  First Name
                  <input type="text" placeholder="Jane" value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} style={INP} />
                </label>
                <label style={LBL}>
                  Last Name
                  <input type="text" placeholder="Smith" value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} style={INP} />
                </label>
              </div>

              <label style={LBL}>
                Relationship
                <select value={form.relationship}
                  onChange={e => setForm(f => ({ ...f, relationship: e.target.value, relationship_other: "" }))}
                  style={INP}>
                  <option value="">Select…</option>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              {form.relationship === "Other" && (
                <label style={LBL}>
                  Describe relationship
                  <input type="text" placeholder="e.g. Personal trainer"
                    value={form.relationship_other}
                    onChange={e => setForm(f => ({ ...f, relationship_other: e.target.value }))}
                    style={INP} />
                </label>
              )}

              <label style={LBL}>
                Notes (optional)
                <textarea placeholder="Any notes…" value={form.notes} rows={2}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...INP, resize: "none" }} />
              </label>

              {error && (
                <p style={{
                  margin: 0, padding: ".45rem .65rem",
                  background: "#fef2f2", border: "1px solid #fecaca",
                  borderRadius: 8, color: "#dc2626", fontSize: ".82rem",
                }}>
                  {error}
                </p>
              )}

              {/* Action buttons */}
              {isEditing ? (
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button
                    onClick={closeModal}
                    style={{
                      flex: 1, padding: ".65rem", background: "#f3f4f6", color: "#374151",
                      border: "none", borderRadius: 10, fontSize: ".88rem", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    style={{
                      flex: 2, padding: ".65rem", background: primaryColor, color: "#fff",
                      border: "none", borderRadius: 10, fontSize: ".88rem", fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                    }}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    style={{
                      padding: ".65rem", background: primaryColor, color: "#fff",
                      border: "none", borderRadius: 10, fontSize: ".88rem", fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    style={{
                      padding: ".65rem", background: "#f0f4ff", color: "#1d4ed8",
                      border: "none", borderRadius: 10, fontSize: ".88rem", fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
                    }}
                  >
                    Save &amp; Add Another
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
