"use client";

import { useEffect, useState } from "react";
import { buildJoinUrl, buildQrFilename, buildSignupSheetData, type SignupSheetData } from "@/lib/teamJoinQr";

export type JoinCode = { code: string; expires_at: string | null; created_at: string };

export type JoinCodeSettings = {
  school_name:   string;
  sport_name:    string;
  mascot:        string | null;
  season:        string | null;
  primary_color: string;
};

// Phase 5: fetch/generate/QR-render state for the Team QR & Join Code
// modal, split out of the modal component itself so the print-only sheet
// (which needs the same joinCode/qrDataUrl) can be rendered as a sibling
// of the modal at the page's top level — a print-only block nested
// inside the modal's own DOM subtree would be hidden along with
// everything else when the modal's "don't print the app chrome" wrapper
// gets display:none (same reasoning as Calendar's CalendarView.tsx/
// PrintMonthView.tsx split).
//
// `enabled` gates the initial fetch — only runs once the modal is
// actually opened (mirrors ExportMenu.tsx's Calendar Sync fetch-on-open)
// AND only if no `initialJoinCode` was already supplied (Settings already
// has the active code server-rendered — see SettingsView.tsx — so no
// extra fetch is needed there at all).
//
// `onChange`, if given, fires whenever this hook's own joinCode state
// changes (after the initial load and after every regenerate) — lets a
// caller with its own pre-existing join-code state (again, Settings'
// existing "New Code"/"Revoke" UI) stay in sync with regeneration
// triggered from this hook's modal, without that caller's existing
// generate/revoke logic being touched at all.
export function useTeamJoinCode(
  slug: string,
  settings: JoinCodeSettings,
  enabled: boolean,
  initialJoinCode: JoinCode | null = null,
  onChange?: (code: JoinCode | null) => void,
) {
  const [joinCode, setJoinCode] = useState<JoinCode | null>(initialJoinCode);
  const [loading,  setLoading]  = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error,    setError]    = useState("");
  const [busy,     setBusy]     = useState(false);

  // Two-way sync when a caller supplies `initialJoinCode`: if it changes
  // via some OTHER code path the caller owns (Settings' existing New
  // Code/Revoke buttons), this hook's own state (and therefore the modal
  // + print sheet) follows rather than going stale. Comparing by `code`
  // string, not object identity, since callers may recreate the object
  // each render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinCode(prev => (prev?.code === initialJoinCode?.code ? prev : initialJoinCode));
  }, [initialJoinCode]);

  useEffect(() => {
    if (!enabled || initialJoinCode) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/team/${slug}/join-codes`)
      .then(r => r.ok ? r.json() : { code: null })
      .then(d => { if (!cancelled) { setJoinCode(d.code); onChange?.(d.code); } })
      .catch(() => { if (!cancelled) setError("Failed to load join code."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange/initialJoinCode intentionally excluded: this only decides whether to run the *initial* fetch, not something to re-run on every render
  }, [slug, enabled]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!joinCode || !origin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const url = buildJoinUrl(origin, joinCode.code);
    import("qrcode").then(QRCode => {
      QRCode.default
        .toDataURL(url, { width: 320, margin: 2, color: { dark: settings.primary_color || "#0b1e3d" } })
        .then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); })
        .catch(() => { /* silently ignore, matches FundraiserView.tsx's athlete-QR precedent */ });
    });
    return () => { cancelled = true; };
  }, [joinCode, origin, settings.primary_color]);

  const generateOrRegenerate = async (): Promise<boolean> => {
    setBusy(true); setError("");
    const res = await fetch(`/api/team/${slug}/join-codes`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Failed to generate code."); return false; }
    setJoinCode(data.code);
    onChange?.(data.code);
    return true;
  };

  const joinUrl: string = joinCode ? buildJoinUrl(origin, joinCode.code) : "";
  const signupData: SignupSheetData | null = joinCode ? buildSignupSheetData(origin, joinCode.code, settings) : null;
  const qrFilename = buildQrFilename(settings.school_name, settings.sport_name);

  return { joinCode, loading, qrDataUrl, error, setError, busy, joinUrl, signupData, qrFilename, generateOrRegenerate };
}
