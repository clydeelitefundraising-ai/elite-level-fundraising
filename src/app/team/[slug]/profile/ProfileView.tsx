"use client";

import { useRef, useState } from "react";

const LABEL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".35rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const INP: React.CSSProperties = {
  padding: ".75rem 1rem",
  borderRadius: ".5rem",
  border: "1.5px solid #d1d5db",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
};

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

export default function ProfileView({
  slug,
  initialName,
  email,
  initialPhotoUrl,
}: {
  slug:            string;
  initialName:     string;
  email:           string;
  initialPhotoUrl: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [name,        setName]        = useState(initialName);
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(initialPhotoUrl);
  const [uploading,   setUploading]   = useState(false);
  const [photoError,  setPhotoError]  = useState("");
  const [saving,      setSaving]      = useState(false);
  const [nameError,   setNameError]   = useState("");
  const [nameSaved,   setNameSaved]   = useState(false);

  // ── Photo upload ──────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileRef.current) fileRef.current = e.target;
    e.target.value = "";
    if (!file) return;

    setPhotoError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res  = await fetch("/api/account/profile/photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setPhotoError(data.error ?? "Upload failed."); return; }
      setPhotoUrl(data.url);
    } catch {
      setPhotoError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoError("");
    setUploading(true);
    try {
      const res  = await fetch("/api/account/profile/photo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setPhotoError(data.error ?? "Remove failed."); return; }
      setPhotoUrl(null);
    } catch {
      setPhotoError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // ── Name save ─────────────────────────────────────────────────────────────

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    setNameSaved(false);
    const trimmed = name.trim();
    if (!trimmed) { setNameError("Name cannot be empty."); return; }
    if (trimmed.length > 80) { setNameError("Name is too long."); return; }
    setSaving(true);
    try {
      const res  = await fetch("/api/account/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setNameError(data.error ?? "Save failed."); return; }
      setName(data.name);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch {
      setNameError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const inits = initials(name || email);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* Section label */}
      <div style={{ marginBottom: ".75rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em" }}>
          Account
        </span>
        <h2 style={{ margin: ".1rem 0 0", fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
          My Profile
        </h2>
      </div>

      {/* Photo card */}
      <div style={{
        background: "#fff",
        borderRadius: 13,
        padding: "1.25rem 1rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".75rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: ".9rem",
      }}>

        {/* Avatar circle */}
        <div style={{ position: "relative" }}>
          <div style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: photoUrl ? "transparent" : "#0b1e3d",
            border: "3px solid #e5e7eb",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: ".02em",
            flexShrink: 0,
          }}>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Profile"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              inits || "?"
            )}
          </div>
          {uploading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,.45)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 22, height: 22, border: "2.5px solid rgba(255,255,255,.3)",
                borderTopColor: "#fff", borderRadius: "50%",
                animation: "elf-spin .7s linear infinite",
              }} />
            </div>
          )}
        </div>

        {/* Upload / remove buttons */}
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: ".45rem .9rem",
              background: "#0b1e3d",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: ".8rem",
              fontWeight: 700,
              cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? .6 : 1,
            }}
          >
            {photoUrl ? "Replace Photo" : "Upload Photo"}
          </button>
          {photoUrl && (
            <button
              onClick={handleRemovePhoto}
              disabled={uploading}
              style={{
                padding: ".45rem .9rem",
                background: "#fff",
                color: "#dc2626",
                border: "1.5px solid #fecaca",
                borderRadius: 8,
                fontSize: ".8rem",
                fontWeight: 700,
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? .6 : 1,
              }}
            >
              Remove
            </button>
          )}
        </div>

        <p style={{ margin: 0, fontSize: ".72rem", color: "#9ca3af", textAlign: "center" }}>
          JPEG, PNG, WebP or HEIC · max 5 MB
        </p>

        {photoError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".6rem .85rem", fontSize: ".82rem", color: "#991b1b", width: "100%", boxSizing: "border-box" }}>
            {photoError}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {/* Name / email card */}
      <form
        onSubmit={handleSaveName}
        style={{
          background: "#fff",
          borderRadius: 13,
          padding: "1rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          display: "flex",
          flexDirection: "column",
          gap: ".85rem",
        }}
      >
        <label style={LABEL}>
          Display Name
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setNameSaved(false); }}
            required
            maxLength={80}
            style={INP}
          />
        </label>

        <label style={LABEL}>
          Email
          <input
            type="email"
            value={email}
            readOnly
            style={{ ...INP, background: "#f9fafb", color: "#9ca3af", cursor: "default" }}
          />
        </label>

        {nameError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".6rem .85rem", fontSize: ".82rem", color: "#991b1b" }}>
            {nameError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: ".7rem 1rem",
            background: nameSaved ? "#16a34a" : saving ? "#9ca3af" : "#0b1e3d",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            fontSize: ".875rem",
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background .18s",
          }}
        >
          {nameSaved ? "✓ Saved" : saving ? "Saving…" : "Save Name"}
        </button>
      </form>

      {/* Back link */}
      <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
        <a
          href={`/team/${slug}/home`}
          style={{ fontSize: ".8rem", color: "#9ca3af", textDecoration: "none" }}
        >
          ← Back to Team Hub
        </a>
      </div>
    </div>
  );
}
