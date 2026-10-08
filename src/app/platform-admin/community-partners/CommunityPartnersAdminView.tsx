"use client";

import { useEffect, useState } from "react";

// Phase 2.2A — ELF Community Partners management. Platform-Admin-only
// (enforced server-side by every /api/platform-admin/community-partners/*
// route this view calls, independently of the /platform-admin/* layout
// gate). No team-level role can ever reach this page or its APIs.

type CommunityPartner = {
  id:                string;
  business_name:     string;
  short_description: string | null;
  website_url:       string | null;
  logo_url:          string | null;
  is_active:         boolean;
  is_featured:       boolean;
  display_order:     number;
  created_at:        string;
  updated_at:        string;
};

type PartnerForm = {
  business_name:     string;
  short_description: string;
  website_url:       string;
  logo_url:          string;
  is_featured:       boolean;
  display_order:     string;
};

const BLANK: PartnerForm = {
  business_name: "", short_description: "", website_url: "", logo_url: "",
  is_featured: false, display_order: "0",
};

function fromPartner(p: CommunityPartner): PartnerForm {
  return {
    business_name:     p.business_name,
    short_description: p.short_description ?? "",
    website_url:       p.website_url ?? "",
    logo_url:          p.logo_url ?? "",
    is_featured:       p.is_featured,
    display_order:     String(p.display_order),
  };
}

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", padding: "1rem 1.1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,.08)", marginBottom: ".75rem",
};

const inp: React.CSSProperties = {
  padding: ".5rem .7rem", border: "1.5px solid #e5e7eb", borderRadius: 8,
  fontSize: "1rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem",
  fontSize: ".72rem", fontWeight: 700, color: "#374151",
  textTransform: "uppercase", letterSpacing: ".04em",
};

function LogoThumb({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: "#0b1e3d",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "#fff", flexShrink: 0,
    }}>
      {name.trim()[0]?.toUpperCase() ?? "P"}
    </div>
  );
}

function PartnerFormPanel({
  editing,
  onClose,
  onSaved,
}: {
  editing: CommunityPartner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form,          setForm]          = useState<PartnerForm>(editing ? fromPartner(editing) : BLANK);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [logoPreview,   setLogoPreview]   = useState(editing?.logo_url ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError,     setLogoError]     = useState("");

  const isEditing = editing !== null;

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    setLogoError("");
    const local = URL.createObjectURL(file);
    setLogoPreview(local);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await fetch("/api/platform-admin/community-partners/logo", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    URL.revokeObjectURL(local);
    setLogoUploading(false);
    if (!res.ok) {
      setLogoError(data?.error ?? "Upload failed.");
      setLogoPreview(form.logo_url);
      return;
    }
    setLogoPreview(data.url);
    setForm(f => ({ ...f, logo_url: data.url }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFieldErrors({});

    const body = {
      business_name:     form.business_name.trim(),
      short_description: form.short_description.trim() || null,
      website_url:       form.website_url.trim() || null,
      logo_url:          form.logo_url.trim() || null,
      is_featured:       form.is_featured,
      display_order:     Number.isFinite(parseInt(form.display_order, 10)) ? parseInt(form.display_order, 10) : 0,
    };

    const res = await fetch(
      isEditing ? `/api/platform-admin/community-partners/${editing.id}` : "/api/platform-admin/community-partners",
      {
        method:  isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Failed to save partner.");
      if (data?.errors) setFieldErrors(data.errors);
      return;
    }
    onSaved();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "1.25rem 1.4rem", width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d" }}>
          {isEditing ? "Edit Partner" : "Add Partner"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
          <label style={lbl}>
            Business Name *
            <input
              style={inp}
              value={form.business_name}
              onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
              placeholder="Acme Local Business"
              autoFocus
            />
            {fieldErrors.business_name && <span style={{ color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none" }}>{fieldErrors.business_name}</span>}
          </label>

          <label style={lbl}>
            Website URL (https://)
            <input
              style={inp}
              value={form.website_url}
              onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
              placeholder="https://example.com"
            />
            {fieldErrors.website_url && <span style={{ color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none" }}>{fieldErrors.website_url}</span>}
          </label>

          <label style={lbl}>
            Short Description
            <textarea
              rows={2}
              style={{ ...inp, resize: "none", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
              value={form.short_description}
              onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))}
              placeholder="Supporting ELF teams since 2020"
            />
          </label>

          <div style={lbl}>
            Logo
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: ".1rem" }}>
              <LogoThumb name={form.business_name || "Partner"} url={logoPreview || null} size={52} />
              <div style={{ flex: 1 }}>
                <label style={{
                  display: "inline-block", padding: ".4rem .85rem",
                  background: logoUploading ? "#f9fafb" : "#f3f4f6",
                  border: "1.5px solid #e5e7eb", borderRadius: 8,
                  fontSize: ".78rem", fontWeight: 600,
                  color: logoUploading ? "#9ca3af" : "#374151",
                  cursor: logoUploading ? "not-allowed" : "pointer",
                }}>
                  {logoUploading ? "Uploading…" : logoPreview ? "Change Logo" : "Choose Logo"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={logoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }}
                  />
                </label>
                <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".25rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  JPEG, PNG, WebP · max 5MB · auto-resized
                </div>
              </div>
            </div>
            {logoError && <p style={{ margin: ".4rem 0 0", color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none" }}>{logoError}</p>}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <label style={{ ...lbl, flex: 1 }}>
              Display Order
              <input
                type="number"
                style={inp}
                value={form.display_order}
                onChange={e => setForm(f => ({ ...f, display_order: e.target.value }))}
              />
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", paddingTop: "1.3rem" }}>
              <input
                id="is_featured"
                type="checkbox"
                checked={form.is_featured}
                onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="is_featured" style={{ fontSize: ".82rem", fontWeight: 700, color: "#374151" }}>Featured</label>
            </div>
          </div>

          {isEditing && (
            <div style={{ fontSize: ".72rem", color: "#9ca3af" }}>
              Active status is managed from the partner list, not this form — use Activate/Deactivate there.
            </div>
          )}

          {error && (
            <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
            <button
              onClick={onClose}
              style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || logoUploading}
              style={{ padding: ".5rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: saving || logoUploading ? "not-allowed" : "pointer", opacity: saving || logoUploading ? .7 : 1 }}
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Partner"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartnerRow({ partner, onChanged, onEdit }: { partner: CommunityPartner; onChanged: () => void; onEdit: (p: CommunityPartner) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleActive() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/platform-admin/community-partners/${partner.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_active: !partner.is_active }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Failed to update status.");
      return;
    }
    onChanged();
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
        <LogoThumb name={partner.business_name} url={partner.logo_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: ".92rem", color: "#0b1e3d" }}>{partner.business_name}</span>
            <span style={{
              fontSize: ".6rem", fontWeight: 700, padding: ".1rem .4rem", borderRadius: 999,
              background: partner.is_active ? "#dcfce7" : "#f3f4f6",
              color: partner.is_active ? "#166534" : "#6b7280",
              textTransform: "uppercase", letterSpacing: ".04em",
            }}>
              {partner.is_active ? "Active" : "Inactive"}
            </span>
            {partner.is_featured && (
              <span style={{ fontSize: ".6rem", fontWeight: 700, padding: ".1rem .4rem", borderRadius: 999, background: "#fef3c7", color: "#92400e", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Featured
              </span>
            )}
          </div>
          {partner.short_description && (
            <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".2rem" }}>{partner.short_description}</div>
          )}
          {partner.website_url && (
            <div style={{ fontSize: ".74rem", color: "#9ca3af", marginTop: ".15rem" }}>
              {partner.website_url.replace(/^https:\/\//, "")}
            </div>
          )}
          <div style={{ fontSize: ".68rem", color: "#d1d5db", marginTop: ".2rem" }}>
            Order {partner.display_order}
          </div>
        </div>
      </div>

      {error && <p style={{ fontSize: ".78rem", color: "#dc2626", margin: ".5rem 0 0" }}>{error}</p>}

      <div style={{ display: "flex", gap: ".5rem", marginTop: ".65rem", paddingTop: ".55rem", borderTop: "1px solid #f3f4f6" }}>
        <button
          disabled={busy}
          onClick={() => onEdit(partner)}
          style={{ padding: ".4rem .8rem", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
        >
          Edit
        </button>
        <button
          disabled={busy}
          onClick={() => void toggleActive()}
          style={{
            padding: ".4rem .8rem", borderRadius: 6, border: "none", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
            background: partner.is_active ? "#fef2f2" : "#0b1e3d",
            color: partner.is_active ? "#dc2626" : "#fff",
          }}
        >
          {partner.is_active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

export default function CommunityPartnersAdminView() {
  const [partners, setPartners] = useState<CommunityPartner[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommunityPartner | null>(null);

  const load = () => {
    fetch("/api/platform-admin/community-partners")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("load failed")))
      .then(d => { setPartners(d.partners ?? []); setLoadError(""); })
      .catch(() => { setPartners([]); setLoadError("Failed to load partners. Please refresh."); });
  };

  useEffect(load, []);

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(p: CommunityPartner) { setEditing(p); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditing(null); }
  function savedForm() { closeForm(); load(); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: ".5rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d", margin: 0 }}>
          ELF Community Partners
        </h1>
        <button
          onClick={openAdd}
          style={{ padding: ".55rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 700, cursor: "pointer" }}
        >
          + Add Partner
        </button>
      </div>

      <p style={{ fontSize: ".82rem", color: "#6b7280", margin: "0 0 1rem" }}>
        Platform-wide advertising partners, managed centrally by ELF. New partners start inactive and are never shown to teams until explicitly activated here.
      </p>

      {loadError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: ".75rem 1rem", color: "#dc2626", fontSize: ".82rem", marginBottom: "1rem" }}>
          {loadError}
        </div>
      )}

      {partners === null ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : partners.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
          No ELF Community Partners yet. Add the first one above.
        </div>
      ) : (
        partners.map(p => <PartnerRow key={p.id} partner={p} onChanged={load} onEdit={openEdit} />)
      )}

      {showForm && <PartnerFormPanel editing={editing} onClose={closeForm} onSaved={savedForm} />}
    </div>
  );
}
