"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SPONSOR_STATUSES, SPONSOR_STATUS_LABELS, SPONSOR_ACTIVITY_TYPES } from "./types";
import type {
  SponsorBusiness, SponsorActivity, SponsorRelationship, SponsorDirectoryData,
  SponsorStatus, SponsorActivityType,
} from "./types";

type Props = { data: SponsorDirectoryData };

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

const STATUS_COLOR: Record<SponsorStatus, { bg: string; text: string }> = {
  prospect:  { bg: "#f3f4f6", text: "#374151" },
  contacted: { bg: "#eff6ff", text: "#1e40af" },
  active:    { bg: "#dcfce7", text: "#166534" },
  recurring: { bg: "#d1fae5", text: "#065f46" },
  paused:    { bg: "#fef3c7", text: "#92400e" },
  lost:      { bg: "#fee2e2", text: "#991b1b" },
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

function StatusBadge({ status }: { status: SponsorStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{ fontSize: ".68rem", fontWeight: 600, color: c.text, background: c.bg, padding: ".15rem .55rem", borderRadius: 12, whiteSpace: "nowrap" }}>
      {SPONSOR_STATUS_LABELS[status]}
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

const primaryBtn: React.CSSProperties = {
  padding: ".55rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const secondaryBtn: React.CSSProperties = {
  padding: ".5rem 1rem", background: "#fff", color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>{icon}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".73rem", color: "#6e6e73", marginTop: ".35rem", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SponsorDirectoryView({ data }: Props) {
  const router = useRouter();
  const { summary, renewalsDue, recentActivity } = data;

  const [sponsors, setSponsors]     = useState<SponsorBusiness[]>(data.sponsors);
  const [statusFilter, setStatusFilter] = useState<SponsorStatus | "all">("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [query, setQuery]           = useState("");
  const [showNew, setShowNew]       = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = sponsors.find(s => s.id === selectedId) ?? null;

  const industries = useMemo(
    () => Array.from(new Set(sponsors.map(s => s.industry).filter((v): v is string => !!v))).sort(),
    [sponsors],
  );
  const sports = useMemo(
    () => Array.from(new Set(sponsors.flatMap(s => s.preferred_sports))).sort(),
    [sponsors],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sponsors.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (industryFilter !== "all" && s.industry !== industryFilter) return false;
      if (sportFilter !== "all" && !s.preferred_sports.includes(sportFilter)) return false;
      if (!q) return true;
      return [s.business_name, s.contact_name, s.city, s.industry, ...s.preferred_sports]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [sponsors, statusFilter, industryFilter, sportFilter, query]);

  function upsertSponsor(updated: SponsorBusiness) {
    setSponsors(prev => {
      const exists = prev.some(s => s.id === updated.id);
      return exists ? prev.map(s => (s.id === updated.id ? updated : s)) : [updated, ...prev];
    });
  }

  async function createSponsor(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/sponsor-businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to create sponsor.");
    }
    const sponsor = await res.json() as SponsorBusiness;
    upsertSponsor(sponsor);
    setShowNew(false);
    setSelectedId(sponsor.id);
    router.refresh();
  }

  async function patchSponsor(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/sponsor-businesses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to update sponsor.");
    }
    const sponsor = await res.json() as SponsorBusiness;
    upsertSponsor(sponsor);
    router.refresh();
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 1300, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>Sponsor Directory</h2>
          <div style={{ fontSize: ".75rem", color: "#94a3b8", marginTop: ".3rem" }}>
            Track businesses, sponsorship history, and renewal opportunities.
          </div>
        </div>
        <button onClick={() => setShowNew(true)} style={primaryBtn}>
          + New Sponsor
        </button>
      </div>

      {/* Summary cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={sectionLabel}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: ".9rem" }}>
          <StatCard label="Total Businesses"   value={summary.totalBusinesses}    icon="🏢" />
          <StatCard label="Active Sponsors"    value={summary.activeSponsors}     icon="✅" />
          <StatCard label="Recurring Sponsors" value={summary.recurringSponsors}  icon="🔁" />
          <StatCard label="Prospects"          value={summary.prospectSponsors}   icon="🔎" />
          <StatCard label="Est. Annual Budget" value={money(summary.estimatedAnnualBudgetCents)} icon="💰" />
          <StatCard label="Lifetime Value"     value={money(summary.lifetimeValueCents)}          icon="📈" />
          <StatCard label="Renewals Due"       value={summary.renewalsDue}        icon="⏰" />
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: "1.5rem", alignItems: "start" }}>
        <div>
          {/* Filters */}
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search business, contact, city, industry, sport…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ ...inputStyle, maxWidth: 320 }}
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SponsorStatus | "all")} style={{ ...inputStyle, width: "auto" }}>
                <option value="all">All statuses</option>
                {SPONSOR_STATUSES.map(s => <option key={s} value={s}>{SPONSOR_STATUS_LABELS[s]}</option>)}
              </select>
              <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="all">All industries</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              <select value={sportFilter} onChange={e => setSportFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="all">All sports</option>
                {sports.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </section>

          {/* Renewals due */}
          {renewalsDue.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <div style={sectionLabel}>Renewals Due Soon</div>
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: ".25rem 1rem" }}>
                {renewalsDue.slice(0, 6).map(s => (
                  <div key={s.id} onClick={() => setSelectedId(s.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".6rem 0", borderBottom: "1px solid #fde68a", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: ".8rem", fontWeight: 600, color: "#92400e" }}>{s.business_name}</div>
                      <div style={{ fontSize: ".7rem", color: "#b45309" }}>{s.industry ?? "—"}</div>
                    </div>
                    <div style={{ fontSize: ".72rem", fontWeight: 600, color: "#92400e" }}>{fmtDate(s.next_renewal_at)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sponsor list */}
          <section style={{ marginBottom: "2rem" }}>
            <div style={sectionLabel}>Businesses ({filtered.length})</div>
            {filtered.length === 0 ? (
              <EmptyState onAdd={() => setShowNew(true)} />
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                {filtered.map(s => (
                  <SponsorRow key={s.id} sponsor={s} onClick={() => setSelectedId(s.id)} selected={s.id === selectedId} />
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
          <SponsorDetail
            sponsor={selected}
            onClose={() => setSelectedId(null)}
            onPatch={patch => patchSponsor(selected.id, patch)}
          />
        )}
      </div>

      {showNew && (
        <NewSponsorModal onClose={() => setShowNew(false)} onCreate={createSponsor} />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 10, padding: "2.5rem 1rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>🏢</div>
      <div style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>No sponsor businesses yet</div>
      <div style={{ fontSize: ".75rem", color: "#94a3b8", margin: ".35rem 0 1rem" }}>
        Add your first sponsor to start tracking business relationships.
      </div>
      <button onClick={onAdd} style={primaryBtn}>+ Add First Sponsor</button>
    </div>
  );
}

function SponsorRow({ sponsor, onClick, selected }: { sponsor: SponsorBusiness; onClick: () => void; selected: boolean }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "1rem", padding: ".75rem 1rem",
      borderBottom: "1px solid #f3f4f6", cursor: "pointer",
      background: selected ? "#f8fafc" : "transparent",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".84rem", fontWeight: 600, color: "#1d1d1f" }}>{sponsor.business_name}</div>
        <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: ".1rem" }}>
          {[sponsor.contact_name, sponsor.city, sponsor.industry].filter(Boolean).join(" · ") || "—"}
          {sponsor.preferred_sports.length > 0 && ` · ${sponsor.preferred_sports.join(", ")}`}
        </div>
      </div>
      {sponsor.estimated_annual_budget != null && (
        <div style={{ fontSize: ".78rem", fontWeight: 600, color: "#16a34a", minWidth: 80, textAlign: "right" }}>{money(sponsor.estimated_annual_budget)}</div>
      )}
      <div style={{ fontSize: ".72rem", color: "#94a3b8", minWidth: 90 }}>{fmtDate(sponsor.next_renewal_at)}</div>
      <StatusBadge status={sponsor.status} />
    </div>
  );
}

// ── New sponsor modal ─────────────────────────────────────────────────────────

function NewSponsorModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    business_name: "", contact_name: "", contact_email: "", contact_phone: "", website: "",
    industry: "", city: "", state: "AZ", address: "", preferred_sports: "",
    preferred_sponsorship_level: "", estimated_annual_budget: "", next_renewal_at: "",
    status: "prospect" as SponsorStatus, source: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function submit() {
    if (!form.business_name.trim()) { setErr("Business name is required."); return; }
    setSaving(true);
    setErr("");
    try {
      await onCreate({
        ...form,
        preferred_sports: form.preferred_sports.split(",").map(s => s.trim()).filter(Boolean),
        estimated_annual_budget: form.estimated_annual_budget ? Number(form.estimated_annual_budget) : null,
        next_renewal_at: form.next_renewal_at ? new Date(form.next_renewal_at).toISOString() : null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create sponsor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="New Sponsor Business" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Field label="Business Name *">
          <input style={inputStyle} value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />
        </Field>
        <Field label="Status">
          <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as SponsorStatus })}>
            {SPONSOR_STATUSES.map(s => <option key={s} value={s}>{SPONSOR_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Contact Name">
          <input style={inputStyle} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
        </Field>
        <Field label="Contact Email">
          <input style={inputStyle} value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
        </Field>
        <Field label="Contact Phone">
          <input style={inputStyle} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
        </Field>
        <Field label="Website">
          <input style={inputStyle} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
        </Field>
        <Field label="Industry">
          <input style={inputStyle} value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
        </Field>
        <Field label="City">
          <input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State">
          <input style={inputStyle} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
        </Field>
        <Field label="Address">
          <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Preferred Sports (comma separated)">
          <input style={inputStyle} value={form.preferred_sports} onChange={e => setForm({ ...form, preferred_sports: e.target.value })} placeholder="Football, Track & Field" />
        </Field>
        <Field label="Preferred Sponsorship Level">
          <input style={inputStyle} value={form.preferred_sponsorship_level} onChange={e => setForm({ ...form, preferred_sponsorship_level: e.target.value })} placeholder="Gold, Silver, Bronze" />
        </Field>
        <Field label="Estimated Annual Budget ($)">
          <input type="number" style={inputStyle} value={form.estimated_annual_budget} onChange={e => setForm({ ...form, estimated_annual_budget: e.target.value })} />
        </Field>
        <Field label="Next Renewal Date">
          <input type="date" style={inputStyle} value={form.next_renewal_at} onChange={e => setForm({ ...form, next_renewal_at: e.target.value })} />
        </Field>
        <Field label="Source">
          <input style={inputStyle} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Referral, cold outreach, etc." />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Notes">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: ".78rem", marginTop: ".75rem" }}>{err}</div>}

      <div style={{ display: "flex", gap: ".6rem", marginTop: "1.25rem" }}>
        <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Create Sponsor"}</button>
        <button onClick={onClose} style={secondaryBtn}>Cancel</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem", maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
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

// ── Sponsor detail panel ──────────────────────────────────────────────────────

function SponsorDetail({ sponsor, onClose, onPatch }: {
  sponsor: SponsorBusiness;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState(sponsor);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");
  const [activities, setActivities] = useState<SponsorActivity[] | null>(null);
  const [relationships, setRelationships] = useState<SponsorRelationship[] | null>(null);
  const [loadingAct, setLoadingAct] = useState(false);
  const [newNote, setNewNote]     = useState("");
  const [noteType, setNoteType]   = useState<SponsorActivityType>("note");
  const [addingNote, setAddingNote] = useState(false);
  const [showSponsorship, setShowSponsorship] = useState(false);

  async function loadActivities() {
    setLoadingAct(true);
    try {
      const [actRes, relRes] = await Promise.all([
        fetch(`/api/admin/sponsor-businesses/activities?business_id=${sponsor.id}`),
        fetch(`/api/admin/sponsor-businesses/relationships?business_id=${sponsor.id}`),
      ]);
      if (actRes.ok) setActivities(await actRes.json());
      if (relRes.ok) setRelationships(await relRes.json());
    } finally {
      setLoadingAct(false);
    }
  }

  useEffect(() => {
    setActivities(null);
    setRelationships(null);
    void loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsor.id]);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await onPatch({
        business_name: form.business_name, contact_name: form.contact_name, contact_email: form.contact_email,
        contact_phone: form.contact_phone, website: form.website, industry: form.industry,
        city: form.city, state: form.state, address: form.address, preferred_sports: form.preferred_sports,
        preferred_sponsorship_level: form.preferred_sponsorship_level,
        estimated_annual_budget: form.estimated_annual_budget, next_renewal_at: form.next_renewal_at,
        source: form.source, notes: form.notes,
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: SponsorStatus) {
    await onPatch({ status });
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch("/api/admin/sponsor-businesses/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: sponsor.id, activity_type: noteType, title: newNote.trim() }),
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
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#1d1d1f" }}>{sponsor.business_name}</div>
          <div style={{ marginTop: ".3rem" }}><StatusBadge status={sponsor.status} /></div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1rem", color: "#94a3b8", cursor: "pointer" }}>✕</button>
      </div>

      <Field label="Change Status">
        <select style={inputStyle} value={sponsor.status} onChange={e => changeStatus(e.target.value as SponsorStatus)}>
          {SPONSOR_STATUSES.map(s => <option key={s} value={s}>{SPONSOR_STATUS_LABELS[s]}</option>)}
        </select>
      </Field>

      <div style={{ marginTop: ".75rem" }}>
        <Field label="Next Renewal Date">
          <input type="date" style={inputStyle}
            value={sponsor.next_renewal_at ? sponsor.next_renewal_at.slice(0, 10) : ""}
            onChange={e => onPatch({ next_renewal_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
      </div>

      {!editing ? (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".45rem", fontSize: ".8rem", color: "#374151" }}>
          <DetailLine label="Contact" value={sponsor.contact_name} />
          <DetailLine label="Email" value={sponsor.contact_email} />
          <DetailLine label="Phone" value={sponsor.contact_phone} />
          <DetailLine label="Website" value={sponsor.website} />
          <DetailLine label="Industry" value={sponsor.industry} />
          <DetailLine label="City / State" value={[sponsor.city, sponsor.state].filter(Boolean).join(", ") || null} />
          <DetailLine label="Preferred Sports" value={sponsor.preferred_sports.length > 0 ? sponsor.preferred_sports.join(", ") : null} />
          <DetailLine label="Preferred Level" value={sponsor.preferred_sponsorship_level} />
          <DetailLine label="Est. Annual Budget" value={sponsor.estimated_annual_budget != null ? money(sponsor.estimated_annual_budget) : null} />
          <DetailLine label="Lifetime Value" value={money(sponsor.lifetime_value)} />
          <DetailLine label="Last Sponsored" value={sponsor.last_sponsored_at ? fmtDate(sponsor.last_sponsored_at) : null} />
          <DetailLine label="Source" value={sponsor.source} />
          {sponsor.notes && <DetailLine label="Notes" value={sponsor.notes} />}
          <button onClick={() => { setForm(sponsor); setEditing(true); }} style={{ ...secondaryBtn, marginTop: ".5rem" }}>Edit Details</button>
        </div>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <Field label="Contact Name"><input style={inputStyle} value={form.contact_name ?? ""} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Email"><input style={inputStyle} value={form.contact_email ?? ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></Field>
          <Field label="Phone"><input style={inputStyle} value={form.contact_phone ?? ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></Field>
          <Field label="Website"><input style={inputStyle} value={form.website ?? ""} onChange={e => setForm({ ...form, website: e.target.value })} /></Field>
          <Field label="Industry"><input style={inputStyle} value={form.industry ?? ""} onChange={e => setForm({ ...form, industry: e.target.value })} /></Field>
          <Field label="City"><input style={inputStyle} value={form.city ?? ""} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="State"><input style={inputStyle} value={form.state ?? ""} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
          <Field label="Preferred Sports (comma separated)">
            <input style={inputStyle} value={form.preferred_sports.join(", ")}
              onChange={e => setForm({ ...form, preferred_sports: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Preferred Level"><input style={inputStyle} value={form.preferred_sponsorship_level ?? ""} onChange={e => setForm({ ...form, preferred_sponsorship_level: e.target.value })} /></Field>
          <Field label="Estimated Annual Budget ($)">
            <input type="number" style={inputStyle} value={form.estimated_annual_budget ?? ""} onChange={e => setForm({ ...form, estimated_annual_budget: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Source"><input style={inputStyle} value={form.source ?? ""} onChange={e => setForm({ ...form, source: e.target.value })} /></Field>
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

      {/* Sponsorship history */}
      <div style={{ marginTop: "1.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
          <div style={sectionLabel}>Sponsorship History</div>
          <button onClick={() => setShowSponsorship(true)} style={{ ...secondaryBtn, padding: ".25rem .6rem", fontSize: ".7rem" }}>+ Record</button>
        </div>
        {loadingAct && !relationships ? (
          <div style={{ fontSize: ".75rem", color: "#94a3b8" }}>Loading…</div>
        ) : !relationships || relationships.length === 0 ? (
          <div style={{ fontSize: ".75rem", color: "#94a3b8" }}>No sponsorships recorded yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {relationships.map(r => (
              <div key={r.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: ".5rem", fontSize: ".76rem", color: "#374151" }}>
                <div style={{ fontWeight: 600 }}>{r.campaign_slug ?? "General sponsorship"}</div>
                <div style={{ color: "#94a3b8", fontSize: ".68rem" }}>
                  {r.sponsorship_amount != null ? money(r.sponsorship_amount) : "—"}
                  {r.sponsorship_level ? ` · ${r.sponsorship_level}` : ""} · {fmtDate(r.sponsored_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div style={{ marginTop: "1.5rem", borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
        <div style={sectionLabel}>Add Activity</div>
        <div style={{ display: "flex", gap: ".4rem", marginBottom: ".5rem" }}>
          <select style={{ ...inputStyle, width: "auto" }} value={noteType} onChange={e => setNoteType(e.target.value as SponsorActivityType)}>
            {SPONSOR_ACTIVITY_TYPES.filter(t => t !== "status_change").map(t => <option key={t} value={t}>{t}</option>)}
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

      {showSponsorship && (
        <SponsorshipModal
          businessId={sponsor.id}
          onClose={() => setShowSponsorship(false)}
          onCreated={async () => { setShowSponsorship(false); await loadActivities(); }}
        />
      )}
    </div>
  );
}

function SponsorshipModal({ businessId, onClose, onCreated }: {
  businessId: string; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [campaignSlug, setCampaignSlug] = useState("");
  const [amount, setAmount]             = useState("");
  const [level, setLevel]               = useState("");
  const [notes, setNotes]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState("");

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/sponsor-businesses/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          campaign_slug: campaignSlug.trim() || null,
          sponsorship_amount: amount ? Number(amount) : null,
          sponsorship_level: level.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to record sponsorship.");
      }
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record sponsorship.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Record Sponsorship" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
        <Field label="Campaign Slug (optional)">
          <input style={inputStyle} value={campaignSlug} onChange={e => setCampaignSlug(e.target.value)} placeholder="e.g. paradise-valley-track-field" />
        </Field>
        <Field label="Sponsorship Amount ($)">
          <input type="number" style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} />
        </Field>
        <Field label="Sponsorship Level">
          <input style={inputStyle} value={level} onChange={e => setLevel(e.target.value)} placeholder="Gold, Silver, Bronze" />
        </Field>
        <Field label="Notes">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        {err && <div style={{ color: "#dc2626", fontSize: ".76rem" }}>{err}</div>}
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Record Sponsorship"}</button>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
        </div>
      </div>
    </ModalShell>
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
