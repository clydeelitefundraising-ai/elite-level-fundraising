"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { resolveTeamTheme } from "@/lib/theme/teamTheme";
import { isValidHexColor, resolveBrandingFormColors } from "@/lib/theme/brandingValidation";

export type TeamBrandingSettings = {
  school_name: string;
  logo_url: string;
  primary_color: string | null;
  secondary_color: string | null;
  branding_customized: boolean;
};

type Props = {
  slug: string;
  branding: TeamBrandingSettings;
};

// Phase A34. Two fully independent actions, per product requirement:
//   - "Upload Logo" writes ONLY logo_url. It never sets branding_customized.
//   - "Save Team Colors" writes primary_color/secondary_color and sets
//     branding_customized = true.
// "Reset to ELF Branding" only flips branding_customized back to false and
// never touches logo_url or the stored colors (see the branding PATCH route
// for why leaving them in place is the safer design).
export default function TeamBrandingSection({ slug, branding }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialColors = resolveBrandingFormColors(branding);
  const [logoUrl, setLogoUrl] = useState(branding.logo_url);
  const [brandingCustomized, setBrandingCustomized] = useState(branding.branding_customized);
  const [primaryColor, setPrimaryColor] = useState(initialColors.primary);
  const [secondaryColor, setSecondaryColor] = useState(initialColors.secondary);

  const [logoWorking, setLogoWorking] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [colorError, setColorError] = useState("");

  const primaryValid = isValidHexColor(primaryColor);
  const secondaryValid = isValidHexColor(secondaryColor);

  // Live preview always simulates "customized" with the current form
  // values — a coach needs to see the effect of an in-progress edit even
  // on a team that hasn't opted into custom branding yet. The status label
  // below reflects the real, currently-saved state instead.
  const previewTheme = resolveTeamTheme(
    primaryValid ? primaryColor : "#FF5A1F",
    secondaryValid ? secondaryColor : "#FFC93C",
    true,
  );

  const handleLogoPick = () => fileInputRef.current?.click();

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLogoError("");
    setLogoWorking(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/team/${slug}/branding/logo`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setLogoError(data.error ?? "Failed to upload logo.");
        return;
      }
      setLogoUrl(data.logo_url);
      router.refresh();
    } catch {
      setLogoError("Failed to upload logo.");
    } finally {
      setLogoWorking(false);
    }
  };

  const handleSaveColors = async () => {
    if (!primaryValid || !secondaryValid) {
      setColorError("Enter valid 6-digit hex colors (e.g. #1B4FA8) for both fields.");
      return;
    }
    setColorError("");
    setSaveWorking(true);
    try {
      const res = await fetch(`/api/team/${slug}/settings/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_color: primaryColor, secondary_color: secondaryColor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setColorError(data.error ?? "Failed to save team colors.");
        return;
      }
      setBrandingCustomized(true);
      router.refresh();
    } catch {
      setColorError("Failed to save team colors.");
    } finally {
      setSaveWorking(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to ELF Branding? Your team app will switch back to the default ELF orange/yellow theme. Your saved colors and logo are kept and can be re-applied later.")) {
      return;
    }
    setColorError("");
    setResetWorking(true);
    try {
      const res = await fetch(`/api/team/${slug}/settings/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setColorError(data.error ?? "Failed to reset branding.");
        return;
      }
      setBrandingCustomized(false);
      router.refresh();
    } catch {
      setColorError("Failed to reset branding.");
    } finally {
      setResetWorking(false);
    }
  };

  return (
    <div style={{
      background: "var(--surface-light)",
      borderRadius: "var(--radius-lg)",
      padding: "1rem",
      border: "1px solid var(--border-app)",
    }}>
      <p style={{ margin: "0 0 .9rem", fontSize: ".82rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
        Customize your team&apos;s logo and colors. ELF provides the interface — your team provides the identity.
      </p>

      {/* ── Team Logo ── */}
      <div style={{ marginBottom: "1.1rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".5rem" }}>
          Team Logo
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: ".85rem" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            border: "1.5px solid var(--border-app)",
            background: "var(--surface-light-elevated)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: 0,
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Team logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: ".65rem", color: "var(--text-muted-app)" }}>No logo</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={handleLogoChange}
            />
            <button
              onClick={handleLogoPick}
              disabled={logoWorking}
              style={{
                display: "flex", alignItems: "center", gap: ".4rem",
                padding: ".5rem .85rem",
                background: "var(--surface-light-elevated)",
                color: "var(--text-secondary-app)",
                border: "1.5px solid var(--border-app)",
                borderRadius: 9,
                fontSize: ".8rem",
                fontWeight: 700,
                cursor: logoWorking ? "not-allowed" : "pointer",
              }}
            >
              <Upload size={14} /> {logoWorking ? "Uploading…" : "Upload Logo"}
            </button>
            <div style={{ fontSize: ".68rem", color: "var(--text-muted-app)", marginTop: ".35rem" }}>
              PNG, JPG, or WEBP. Max 5MB.
            </div>
          </div>
        </div>
        {logoError && (
          <p style={{ margin: ".55rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".78rem" }}>
            {logoError}
          </p>
        )}
      </div>

      {/* ── Team Colors ── */}
      <div style={{ marginBottom: "1.1rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".5rem" }}>
          Team Colors
        </div>

        <ColorField label="Primary Color" value={primaryColor} valid={primaryValid} onChange={setPrimaryColor} />
        <div style={{ height: ".6rem" }} />
        <ColorField label="Secondary Color" value={secondaryColor} valid={secondaryValid} onChange={setSecondaryColor} />

        {colorError && (
          <p style={{ margin: ".65rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".78rem" }}>
            {colorError}
          </p>
        )}
      </div>

      {/* ── Live Preview ── */}
      <div style={{ marginBottom: "1.1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
          <span style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".07em" }}>
            Live Preview
          </span>
          <span style={{
            fontSize: ".62rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
            padding: ".2rem .55rem", borderRadius: 100,
            background: brandingCustomized ? "#dcfce7" : "var(--surface-light-elevated)",
            color: brandingCustomized ? "var(--color-success)" : "var(--text-muted-app)",
            border: brandingCustomized ? "none" : "1px solid var(--border-app)",
          }}>
            {brandingCustomized ? "Custom Team Branding" : "ELF Branding"}
          </span>
        </div>

        <div style={{
          border: "1.5px solid var(--border-app)",
          borderRadius: 12,
          padding: "1rem",
          background: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".65rem", marginBottom: ".85rem" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              overflow: "hidden", flexShrink: 0,
              background: "var(--surface-light-elevated)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: ".55rem", color: "var(--text-muted-app)" }}>Logo</span>
              )}
            </div>
            <span style={{ fontWeight: 800, fontSize: ".9rem", color: "#111318" }}>
              {branding.school_name || "Your Team"}
            </span>
          </div>

          {/* Simulated nav tabs — active tab uses the primary accent + its
              computed foreground, exactly as the real TeamNav does. */}
          <div style={{ display: "flex", gap: ".4rem", marginBottom: ".85rem" }}>
            <div style={{
              padding: ".35rem .75rem", borderRadius: 8, fontSize: ".72rem", fontWeight: 700,
              background: previewTheme["--team-primary"],
              color: previewTheme["--team-primary-foreground"],
            }}>
              Home
            </div>
            <div style={{
              padding: ".35rem .75rem", borderRadius: 8, fontSize: ".72rem", fontWeight: 700,
              background: "var(--surface-light-elevated)", color: "var(--text-muted-app)",
            }}>
              Team
            </div>
          </div>

          {/* Primary button */}
          <button
            disabled
            style={{
              width: "100%", padding: ".6rem .75rem", borderRadius: 9, border: "none",
              fontSize: ".82rem", fontWeight: 700, marginBottom: ".65rem",
              background: previewTheme["--team-primary"],
              color: previewTheme["--team-primary-foreground"],
            }}
          >
            Donate Now
          </button>

          {/* Progress/accent bar using the secondary color */}
          <div style={{ height: 8, borderRadius: 100, background: "var(--surface-light-elevated)", overflow: "hidden" }}>
            <div style={{ width: "62%", height: "100%", background: previewTheme["--team-secondary"] }} />
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: ".5rem" }}>
        <button
          onClick={handleSaveColors}
          disabled={saveWorking || resetWorking}
          style={{
            flex: 1,
            padding: ".6rem .75rem",
            background: "var(--team-primary)",
            color: "var(--team-primary-foreground)",
            border: "none",
            borderRadius: 9,
            fontSize: ".82rem",
            fontWeight: 700,
            cursor: saveWorking || resetWorking ? "not-allowed" : "pointer",
          }}
        >
          {saveWorking ? "Saving…" : "Save Team Colors"}
        </button>
        <button
          onClick={handleReset}
          disabled={saveWorking || resetWorking || !brandingCustomized}
          style={{
            flex: 1,
            padding: ".6rem .75rem",
            background: "#fff",
            color: "var(--text-secondary-app)",
            border: "1.5px solid var(--border-app)",
            borderRadius: 9,
            fontSize: ".82rem",
            fontWeight: 600,
            cursor: (saveWorking || resetWorking || !brandingCustomized) ? "not-allowed" : "pointer",
            opacity: brandingCustomized ? 1 : 0.55,
          }}
        >
          {resetWorking ? "Resetting…" : "Reset to ELF Branding"}
        </button>
      </div>
    </div>
  );
}

function ColorField({
  label, value, valid, onChange,
}: { label: string; value: string; valid: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: ".78rem", fontWeight: 600, color: "var(--text-secondary-app)", marginBottom: ".3rem" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{ width: 40, height: 36, padding: 0, border: "1.5px solid var(--border-app)", borderRadius: 8, cursor: "pointer", background: "none" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          style={{
            flex: 1,
            padding: ".5rem .65rem",
            border: `1.5px solid ${valid ? "var(--border-app)" : "#fecaca"}`,
            borderRadius: 8,
            fontSize: ".85rem",
            fontFamily: "monospace",
            color: "var(--text-primary-app)",
          }}
        />
      </div>
      {!valid && (
        <div style={{ fontSize: ".68rem", color: "var(--color-error)", marginTop: ".25rem" }}>
          Enter a valid 6-digit hex color, e.g. #1B4FA8
        </div>
      )}
    </div>
  );
}
