"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type SaveState = "idle" | "saving" | "saved";

const colorPalettes = {
  primary: [
    { name: "Navy",    hex: "#0B1E3D" },
    { name: "Slate",   hex: "#1A3A5C" },
    { name: "Crimson", hex: "#991B1B" },
    { name: "Forest",  hex: "#14532D" },
    { name: "Purple",  hex: "#4C1D95" },
    { name: "Black",   hex: "#0A0A0A" },
    { name: "Teal",    hex: "#134E4A" },
    { name: "Indigo",  hex: "#1E3A8A" },
  ],
  secondary: [
    { name: "Gold",    hex: "#C9A84C" },
    { name: "Silver",  hex: "#9CA3AF" },
    { name: "White",   hex: "#FFFFFF" },
    { name: "Scarlet", hex: "#DC2626" },
    { name: "Sky",     hex: "#38BDF8" },
    { name: "Lime",    hex: "#84CC16" },
    { name: "Orange",  hex: "#F97316" },
    { name: "Pink",    hex: "#EC4899" },
  ],
};

function useSave(): [SaveState, () => void] {
  const [state, setState] = useState<SaveState>("idle");
  function trigger() {
    setState("saving");
    setTimeout(() => { setState("saved"); setTimeout(() => setState("idle"), 2000); }, 700);
  }
  return [state, trigger];
}

function SaveBtn({ state, onClick }: { state: SaveState; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 22px", borderRadius: 9, border: "none", cursor: "pointer",
        background: state === "saved" ? "#166534" : "#0B1E3D",
        color: "#FFFFFF", fontSize: 13, fontWeight: 700,
        transition: "background 0.2s ease",
      }}
    >
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save Changes"}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function TeamProfilePage() {
  const { teamInfo, primaryColor, secondaryColor, setTeamInfo, setPrimaryColor, setSecondaryColor } = useAppStore();
  const [identitySave, triggerIdentitySave] = useSave();
  const [colorSave, triggerColorSave] = useSave();

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Team Profile</h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>Manage your team&apos;s identity, branding, and app appearance.</p>
      </div>

      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Team Identity */}
        <div className="ta-adm-card" style={{ padding: "24px" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", marginBottom: 20 }}>Team Identity</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <Label>School Name</Label>
              <input className="ta-adm-input" value={teamInfo.school} onChange={e => setTeamInfo({ school: e.target.value })} />
            </div>
            <div>
              <Label>Short Name</Label>
              <input className="ta-adm-input" value={teamInfo.shortName} onChange={e => setTeamInfo({ shortName: e.target.value })} />
            </div>
            <div>
              <Label>Mascot</Label>
              <input className="ta-adm-input" value={teamInfo.mascot} onChange={e => setTeamInfo({ mascot: e.target.value })} />
            </div>
            <div>
              <Label>Sport</Label>
              <input className="ta-adm-input" value={teamInfo.sport} onChange={e => setTeamInfo({ sport: e.target.value })} />
            </div>
            <div>
              <Label>Season</Label>
              <input className="ta-adm-input" value={teamInfo.season} onChange={e => setTeamInfo({ season: e.target.value })} />
            </div>
            <div>
              <Label>Logo Initials (2 chars)</Label>
              <input className="ta-adm-input" value={teamInfo.logoInitials} maxLength={2} onChange={e => setTeamInfo({ logoInitials: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <SaveBtn state={identitySave} onClick={triggerIdentitySave} />
          </div>
        </div>

        {/* Brand Colors */}
        <div className="ta-adm-card" style={{ padding: "24px" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", marginBottom: 20 }}>Brand Colors</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            {/* Primary */}
            <div>
              <Label>Primary Color</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {colorPalettes.primary.map(c => (
                  <button
                    key={c.hex}
                    className={`ta-adm-swatch${primaryColor === c.hex ? " active" : ""}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    onClick={() => setPrimaryColor(c.hex)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: primaryColor, border: "1px solid rgba(0,0,0,0.1)" }} />
                <input className="ta-adm-input" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ fontFamily: "monospace", fontSize: 13 }} />
              </div>
            </div>
            {/* Secondary */}
            <div>
              <Label>Secondary / Accent Color</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {colorPalettes.secondary.map(c => (
                  <button
                    key={c.hex}
                    className={`ta-adm-swatch${secondaryColor === c.hex ? " active" : ""}`}
                    style={{ background: c.hex, border: c.hex === "#FFFFFF" ? "2px solid #E5E7EB" : undefined }}
                    title={c.name}
                    onClick={() => setSecondaryColor(c.hex)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: secondaryColor, border: "1px solid rgba(0,0,0,0.1)" }} />
                <input className="ta-adm-input" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} style={{ fontFamily: "monospace", fontSize: 13 }} />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div style={{ marginTop: 24 }}>
            <Label>App Header Preview</Label>
            <div style={{ width: 320, borderRadius: 16, overflow: "hidden", border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <div style={{ height: 28, background: primaryColor, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>9:41</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <div style={{ width: 12, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.5)" }} />
                  <div style={{ width: 18, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.5)" }} />
                </div>
              </div>
              <div style={{ background: primaryColor, padding: "12px 16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: secondaryColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: primaryColor,
                }}>
                  {teamInfo.logoInitials}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2 }}>
                    {teamInfo.shortName} {teamInfo.mascot}
                  </p>
                  <p style={{ fontSize: 10, color: secondaryColor, fontWeight: 600 }}>{teamInfo.sport}</p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <SaveBtn state={colorSave} onClick={triggerColorSave} />
          </div>
        </div>

        {/* Logo Upload (visual only) */}
        <div className="ta-adm-card" style={{ padding: "24px" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0A0A0A", marginBottom: 6 }}>Team Logo</p>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 18 }}>Upload a PNG or SVG logo to replace the initials badge in the app.</p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 16, flexShrink: 0,
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 900, color: "#FFFFFF",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            }}>
              {teamInfo.logoInitials}
            </div>
            <div style={{
              flex: 1, border: "2px dashed #D1D5DB", borderRadius: 14,
              padding: "24px", textAlign: "center", cursor: "pointer",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px" }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Click to upload logo</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>PNG, SVG up to 2MB — Supabase Storage coming soon</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
