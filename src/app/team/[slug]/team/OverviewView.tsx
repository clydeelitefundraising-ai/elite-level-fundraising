"use client";

// Phase T6 — Team -> Overview: team banner, Location, About Our Team.
//
// Everything shown comes from the team's own data: the banner's logo /
// school / sport / season are the same campaign_settings fields the
// header uses (passed down already resolved by page.tsx, so a change made
// anywhere else in ELF shows up here on the next load); the banner image,
// About text and street/ZIP are the Phase T6 columns. Editing controls
// render only for `canEdit` (Head Coach / platform admin on an active
// season) — the /api/team/[slug]/overview routes enforce the same rule
// server-side. About text is rendered as React text (never HTML).
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Camera, FileText, ImagePlus, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  MAX_ABOUT_CHARS, MAX_BANNER_BYTES, MAX_CITY_STATE_CHARS, MAX_STREET_CHARS, MAX_ZIP_CHARS,
  aboutParagraphs, initials, isAllowedBannerMimeType, mapsHref, resolveDisplayLocation, seasonLabel,
  type OrganizationAddress,
} from "@/lib/teamOverview";
import styles from "./Overview.module.css";

export type OverviewTeam = {
  school_name: string;
  sport_name: string;
  season: string;
  logo_url: string | null;
  team_banner_url: string | null;
  team_about: string | null;
  location: string;
  location_street: string | null;
  location_zip: string | null;
};

const NAVY = "#0B1E3D";
const BODY = "#4b5563";
const MUTED = "#6b7280";

const softButton: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: ".35rem", flexShrink: 0,
  padding: ".4rem .75rem", borderRadius: 10, border: "none", cursor: "pointer",
  background: "#eef1f6", color: NAVY, fontSize: ".8rem", fontWeight: 700,
};
const primaryButton: CSSProperties = {
  ...softButton, background: "var(--elf-orange, #FF5A1F)", color: "#fff",
};
const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: ".6rem .7rem", borderRadius: 10,
  border: "1px solid #d1d5db", fontSize: "16px", fontFamily: "inherit", color: NAVY, background: "#fff",
};
const errorStyle: CSSProperties = {
  margin: ".55rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca",
  borderRadius: 8, color: "var(--color-error, #dc2626)", fontSize: ".78rem",
};
const cardTitle: CSSProperties = {
  margin: 0, fontWeight: 800, fontSize: "1.08rem", color: NAVY, letterSpacing: "-.01em", lineHeight: 1.25,
};

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({})) as { error?: string };
  return data.error || fallback;
}

export default function OverviewView({
  slug,
  canEdit,
  team,
  orgAddress,
}: {
  slug: string;
  canEdit: boolean;
  team: OverviewTeam;
  orgAddress: OrganizationAddress | null;
}) {
  const [bannerUrl, setBannerUrl] = useState(team.team_banner_url);
  const [about, setAbout] = useState(team.team_about);
  const [loc, setLoc] = useState({ street: team.location_street ?? "", city_state: team.location, zip: team.location_zip ?? "" });

  return (
    <div className={styles.page}>
      <TeamBanner slug={slug} canEdit={canEdit} team={team} bannerUrl={bannerUrl} onChange={setBannerUrl} />
      <LocationCard slug={slug} canEdit={canEdit} schoolName={team.school_name} loc={loc} orgAddress={orgAddress} onSaved={setLoc} />
      <AboutCard slug={slug} canEdit={canEdit} about={about} onSaved={setAbout} />
    </div>
  );
}

// ── Banner ───────────────────────────────────────────────────────────────

function TeamBanner({ slug, canEdit, team, bannerUrl, onChange }: {
  slug: string; canEdit: boolean; team: OverviewTeam; bannerUrl: string | null; onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<"" | "upload" | "remove">("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const season = seasonLabel(team.season);

  async function upload(file: File) {
    setError("");
    if (!isAllowedBannerMimeType(file.type)) { setError("Banner must be a JPG, PNG or WebP image."); return; }
    if (file.size > MAX_BANNER_BYTES) { setError("Image is too large (max 8 MB)."); return; }
    setWorking("upload");
    try {
      const form = new FormData();
      form.append("banner", file);
      const res = await fetch(`/api/team/${slug}/overview/banner`, { method: "POST", body: form });
      if (!res.ok) { setError(await errorFrom(res, "Upload failed. Please try again.")); return; }
      const data = await res.json() as { team_banner_url: string };
      onChange(data.team_banner_url);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setWorking("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setError("");
    setWorking("remove");
    try {
      const res = await fetch(`/api/team/${slug}/overview/banner`, { method: "DELETE" });
      if (!res.ok) { setError(await errorFrom(res, "Failed to remove the banner.")); return; }
      onChange(null);
      setConfirmRemove(false);
    } catch {
      setError("Failed to remove the banner.");
    } finally {
      setWorking("");
    }
  }

  const chip: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: ".3rem", padding: ".38rem .65rem", borderRadius: 999,
    border: "1px solid rgba(255,255,255,.28)", background: "rgba(11,30,61,.55)", color: "#fff",
    fontSize: ".72rem", fontWeight: 700, cursor: working ? "wait" : "pointer",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  };

  return (
    <section aria-label="Team banner">
      <div className={`${styles.banner}${canEdit ? ` ${styles.bannerEditable}` : ""}`}>
        <div
          className={styles.bannerArt}
          style={{
            background: bannerUrl ? NAVY : `radial-gradient(120% 90% at 85% 10%, rgba(255,90,31,.38) 0%, rgba(255,90,31,0) 55%),
              repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 22px),
              linear-gradient(135deg, #0B1E3D 0%, #132850 55%, #1d3768 100%)`,
          }}
        >
        {bannerUrl && (
          // Plain <img> like the header logo: Supabase public URLs, already
          // resized/re-encoded to WebP by the upload route.
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from Supabase Storage (no next/image remote config)
          <img
            src={bannerUrl}
            alt=""
            decoding="async"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {/* Readability gradient — darker at the bottom-left where the text sits. */}
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(6,14,30,.88) 0%, rgba(6,14,30,.5) 42%, rgba(6,14,30,.08) 78%), linear-gradient(90deg, rgba(6,14,30,.45) 0%, rgba(6,14,30,0) 65%)",
        }} />
        </div>

        {canEdit && (
          <div style={{ position: "absolute", top: ".7rem", right: ".7rem", display: "flex", gap: ".4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
            {confirmRemove ? (
              <>
                <span style={{ ...chip, cursor: "default" }}>Remove banner?</span>
                <button type="button" className="elf-focus-ring" style={{ ...chip, background: "rgba(220,38,38,.85)" }} disabled={!!working} onClick={remove}>
                  {working === "remove" ? "Removing…" : "Remove"}
                </button>
                <button type="button" className="elf-focus-ring" style={chip} disabled={!!working} onClick={() => setConfirmRemove(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" className="elf-focus-ring" style={chip} disabled={!!working} onClick={() => fileRef.current?.click()}>
                  {bannerUrl ? <Camera size={14} aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}
                  {working === "upload" ? "Uploading…" : bannerUrl ? "Change banner" : "Add banner"}
                </button>
                {bannerUrl && (
                  <button type="button" className="elf-focus-ring" style={chip} disabled={!!working} onClick={() => setConfirmRemove(true)} aria-label="Remove banner">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- same team logo URL the header renders as a plain <img>
          <img src={team.logo_url} alt={`${team.school_name} logo`} className={styles.bannerLogo} />
        ) : (
          <div aria-hidden="true" style={{
            width: "clamp(52px, 15vw, 84px)", height: "clamp(52px, 15vw, 84px)", borderRadius: "50%",
            background: "rgba(255,255,255,.14)", border: "2px solid rgba(255,255,255,.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "clamp(1.1rem, 5vw, 1.8rem)", letterSpacing: ".02em",
          }}>
            {initials(team.school_name)}
          </div>
        )}

        <h2 className={styles.bannerName}>{team.school_name}</h2>
        {team.sport_name && (
          <div style={{ fontSize: "clamp(.95rem, 4.3vw, 1.5rem)", fontWeight: 500, opacity: .92, marginTop: ".2rem", lineHeight: 1.2 }}>
            {team.sport_name}
          </div>
        )}
        {season && (
          <div style={{ marginTop: "clamp(.45rem, 2.5vw, .9rem)" }}>
            <div style={{ fontSize: "clamp(.66rem, 2.9vw, .85rem)", fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase", opacity: .95 }}>
              {season}
            </div>
            <div aria-hidden="true" style={{ width: 34, height: 3, borderRadius: 2, background: "var(--team-secondary, #FFC107)", marginTop: ".35rem" }} />
          </div>
        )}

        {working === "upload" && (
          <div role="status" style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: "rgba(6,14,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".85rem" }}>
            Uploading banner…
          </div>
        )}
      </div>
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      {canEdit && !error && (
        <p style={{ margin: ".4rem .2rem 0", fontSize: ".7rem", color: MUTED }}>
          Banner: JPG, PNG or WebP, up to 8 MB. A wide landscape photo (16:9) works best.
        </p>
      )}
    </section>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────

function Card({ icon, title, action, children, label }: {
  icon: ReactNode; title: string; action?: ReactNode; children: ReactNode; label: string;
}) {
  return (
    <section className={styles.card} aria-label={label}>
      <div className={styles.iconBubble} aria-hidden="true">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".6rem", minHeight: 36 }}>
          <h3 style={cardTitle}>{title}</h3>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="elf-focus-ring" style={softButton} onClick={onClick} aria-label={label}>
      <Pencil size={14} aria-hidden="true" /> <span className={styles.editLabel}>Edit</span>
    </button>
  );
}

function SaveCancel({ saving, onSave, onCancel, disabled }: { saving: boolean; onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: ".7rem" }}>
      <button type="button" className="elf-focus-ring" style={softButton} onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="button" className="elf-focus-ring" style={{ ...primaryButton, opacity: disabled ? .55 : 1, cursor: disabled || saving ? "not-allowed" : "pointer" }} onClick={onSave} disabled={saving || disabled}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ── Location ─────────────────────────────────────────────────────────────

// The device never changes while the page is open; server render (and the
// first client render) use Google Maps, then Apple devices switch to
// Apple Maps — no hydration mismatch.
const subscribeNever = () => () => {};
const isAppleDevice = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

type Loc = { street: string; city_state: string; zip: string };

function LocationCard({ slug, canEdit, schoolName, loc, orgAddress, onSaved }: {
  slug: string; canEdit: boolean; schoolName: string; loc: Loc; orgAddress: OrganizationAddress | null; onSaved: (l: Loc) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(loc);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const apple = useSyncExternalStore(subscribeNever, isAppleDevice, () => false);

  const display = resolveDisplayLocation(
    { school_name: schoolName, location: loc.city_state, location_street: loc.street, location_zip: loc.zip },
    orgAddress,
  );

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/overview`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: draft }),
      });
      if (!res.ok) { setError(await errorFrom(res, "Failed to save the location.")); return; }
      const data = await res.json() as { location_street: string | null; location: string; location_zip: string | null };
      onSaved({ street: data.location_street ?? "", city_state: data.location, zip: data.location_zip ?? "" });
      setEditing(false);
    } catch {
      setError("Failed to save the location.");
    } finally {
      setSaving(false);
    }
  }

  const startEdit = () => { setDraft(loc); setError(""); setEditing(true); };
  const field = (key: keyof Loc, label: string, max: number, extra?: { placeholder?: string; full?: boolean; autoComplete?: string }) => (
    <label className={extra?.full ? styles.full : undefined} style={{ display: "block", fontSize: ".75rem", fontWeight: 700, color: NAVY }}>
      {label}
      <input
        style={{ ...inputStyle, marginTop: ".25rem", fontWeight: 400 }}
        value={draft[key]}
        maxLength={max}
        placeholder={extra?.placeholder}
        autoComplete={extra?.autoComplete}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <Card
      label="Location"
      icon={<MapPin size={20} strokeWidth={2.2} />}
      title="Location"
      action={canEdit && !editing && display.source !== "none" ? <EditButton onClick={startEdit} label="Edit location" /> : undefined}
    >
      {editing ? (
        <div style={{ marginTop: ".55rem" }}>
          <div className={styles.editGrid}>
            {field("street", "Street address or venue", MAX_STREET_CHARS, { placeholder: "e.g. 123 Main Street", full: true, autoComplete: "street-address" })}
            {field("city_state", "City, state", MAX_CITY_STATE_CHARS, { placeholder: "e.g. Phoenix, AZ" })}
            {field("zip", "ZIP code", MAX_ZIP_CHARS, { placeholder: "e.g. 85001", autoComplete: "postal-code" })}
          </div>
          <p style={{ margin: ".5rem 0 0", fontSize: ".7rem", color: MUTED }}>
            City and state also appear on your team&apos;s public fundraising page.
          </p>
          {error && <p role="alert" style={errorStyle}>{error}</p>}
          <SaveCancel saving={saving} onSave={save} onCancel={() => { setEditing(false); setError(""); }} />
        </div>
      ) : display.source === "none" ? (
        <div style={{ marginTop: ".25rem" }}>
          <p style={{ margin: 0, fontSize: ".88rem", color: MUTED, lineHeight: 1.5 }}>
            {canEdit ? "Add where your team is based so families and visitors can find you." : "Location hasn't been added yet."}
          </p>
          {canEdit && (
            <button type="button" className="elf-focus-ring" style={{ ...softButton, marginTop: ".65rem" }} onClick={startEdit}>
              <Plus size={14} aria-hidden="true" /> Add location
            </button>
          )}
        </div>
      ) : (
        <div className={styles.locationBody} style={{ marginTop: ".2rem" }}>
          <address className={styles.locationText} style={{ fontStyle: "normal", fontSize: ".95rem", color: BODY, lineHeight: 1.5, overflowWrap: "anywhere" }}>
            {display.lines.map((l, i) => <div key={i}>{l}</div>)}
            {canEdit && display.source === "team" && !loc.street && (
              <button type="button" onClick={startEdit} className="elf-focus-ring" style={{ background: "none", border: "none", padding: 0, marginTop: ".35rem", color: "var(--elf-orange, #FF5A1F)", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}>
                + Add street address
              </button>
            )}
          </address>
          <a
            href={mapsHref(display.query, apple)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.mapPanel} elf-focus-ring`}
            aria-label={`Open ${display.lines.join(", ")} in Maps`}
            style={{
              position: "relative", display: "block", borderRadius: 12, overflow: "hidden", textDecoration: "none",
              border: "1px solid rgba(15,23,42,.06)",
              background: `linear-gradient(118deg, transparent 47%, #fff 47%, #fff 50.5%, transparent 50.5%),
                linear-gradient(28deg, transparent 60%, rgba(255,255,255,.95) 60%, rgba(255,255,255,.95) 62.5%, transparent 62.5%),
                repeating-linear-gradient(0deg, transparent 0 17px, rgba(255,255,255,.8) 17px 18.5px),
                repeating-linear-gradient(90deg, transparent 0 23px, rgba(255,255,255,.8) 23px 24.5px),
                radial-gradient(circle at 16% 82%, #cde5c9 0 17%, transparent 17.5%),
                radial-gradient(circle at 88% 18%, #d6e6f5 0 12%, transparent 12.5%),
                #e6ebf0`,
            }}
          >
            <MapPin aria-hidden="true" size={30} strokeWidth={1.6} fill="#ef4444" color="#fff"
              style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -60%)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }} />
            <span style={{
              position: "absolute", left: "50%", bottom: ".4rem", transform: "translateX(-50%)", padding: ".16rem .45rem", borderRadius: 999,
              background: "rgba(255,255,255,.94)", color: NAVY, fontSize: ".62rem", fontWeight: 700, whiteSpace: "nowrap",
            }}>
              Open in Maps
            </span>
          </a>
        </div>
      )}
    </Card>
  );
}

// ── About Our Team ───────────────────────────────────────────────────────

function AboutCard({ slug, canEdit, about, onSaved }: {
  slug: string; canEdit: boolean; about: string | null; onSaved: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(about ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const paragraphs = aboutParagraphs(about);
  const over = draft.length > MAX_ABOUT_CHARS;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/overview`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_about: draft }),
      });
      if (!res.ok) { setError(await errorFrom(res, "Failed to save. Please try again.")); return; }
      const data = await res.json() as { team_about: string | null };
      onSaved(data.team_about);
      setEditing(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const startEdit = () => { setDraft(about ?? ""); setError(""); setEditing(true); };

  return (
    <Card
      label="About Our Team"
      icon={<FileText size={20} strokeWidth={2} />}
      title="About Our Team"
      action={canEdit && !editing && paragraphs.length > 0 ? <EditButton onClick={startEdit} label="Edit About Our Team" /> : undefined}
    >
      {editing ? (
        <div style={{ marginTop: ".55rem" }}>
          <label htmlFor="team-about" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>About Our Team</label>
          <textarea
            id="team-about"
            value={draft}
            maxLength={MAX_ABOUT_CHARS}
            onChange={e => setDraft(e.target.value)}
            rows={10}
            placeholder="Share your program's history and traditions, coaching philosophy, team culture, accomplishments and what you expect from athletes."
            style={{ ...inputStyle, minHeight: 220, resize: "vertical", lineHeight: 1.55 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", marginTop: ".3rem", fontSize: ".72rem", color: over ? "var(--color-error, #dc2626)" : MUTED }}>
            <span>Leave a blank line between paragraphs.</span>
            <span aria-live="polite">{draft.length.toLocaleString("en-US")} / {MAX_ABOUT_CHARS.toLocaleString("en-US")}</span>
          </div>
          {error && <p role="alert" style={errorStyle}>{error}</p>}
          <SaveCancel saving={saving} onSave={save} onCancel={() => { setEditing(false); setError(""); }} disabled={over} />
        </div>
      ) : paragraphs.length > 0 ? (
        <div style={{ marginTop: ".3rem" }}>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: i ? ".85rem 0 0" : 0, maxWidth: "72ch", fontSize: ".93rem", color: BODY, lineHeight: 1.62, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
              {p}
            </p>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: ".25rem" }}>
          <p style={{ margin: 0, fontSize: ".88rem", color: MUTED, lineHeight: 1.55 }}>
            {canEdit
              ? "Tell athletes, parents and visitors about your program — its history and traditions, your coaching philosophy, team culture and what you expect."
              : "The coaching staff hasn't added a team description yet."}
          </p>
          {canEdit && (
            <button type="button" className="elf-focus-ring" style={{ ...softButton, marginTop: ".65rem" }} onClick={startEdit}>
              <Pencil size={14} aria-hidden="true" /> Write about your team
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
