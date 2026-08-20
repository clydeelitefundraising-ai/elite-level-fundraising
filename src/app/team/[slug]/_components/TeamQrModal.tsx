"use client";

import { useState } from "react";
import Modal from "./Modal";
import type { JoinCode, JoinCodeSettings } from "./useTeamJoinCode";
import type { SignupSheetData } from "@/lib/teamJoinQr";
import { buildSignupSheetFilename } from "@/lib/teamJoinQr";
import { dataUrlToFile, shareFileOrFallback, renderSignupSheetImage } from "./nativeFileShare";

// Phase 5: purely presentational — all fetching/QR-generation state lives
// in useTeamJoinCode.ts (shared with the print sheet). Staff-only,
// rendered by TeamView.tsx.
export default function TeamQrModal({
  settings,
  joinCode,
  loading,
  qrDataUrl,
  error,
  setError,
  busy,
  joinUrl,
  qrFilename,
  signupData,
  generateOrRegenerate,
  onClose,
}: {
  settings: JoinCodeSettings;
  joinCode: JoinCode | null;
  loading: boolean;
  qrDataUrl: string | null;
  error: string;
  setError: (msg: string) => void;
  busy: boolean;
  joinUrl: string;
  qrFilename: string;
  signupData: SignupSheetData | null;
  generateOrRegenerate: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Couldn't copy automatically — select and copy manually.");
    }
  };

  // Phase 8b: inside the installed iOS app, a plain <a download> is a
  // silent no-op — WKWebView has no download-manager UI by default (see
  // nativeFileShare.ts's header comment for the full root-cause writeup).
  // Try the Web Share API (file variant) first; it falls straight through
  // to the exact original <a download> behavior wherever share isn't
  // available (desktop/browser), so nothing changes there.
  const downloadQr = async () => {
    if (!qrDataUrl) return;
    const fallback = () => {
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = qrFilename;
      a.click();
    };
    setPreparingDownload(true);
    try {
      const file = await dataUrlToFile(qrDataUrl, qrFilename, "image/png");
      await shareFileOrFallback(file, fallback);
    } catch {
      fallback();
    } finally {
      setPreparingDownload(false);
    }
  };

  // Same root cause as above, different WKWebView gap: window.print() is
  // a silent no-op there (no native print delegate configured). Renders a
  // shareable image of the same signup sheet PrintSignupSheet.tsx prints
  // and offers it via the share sheet (which includes iOS's own Print
  // action) — falls straight through to the original window.print() call
  // wherever share isn't available.
  const printSignupSheet = async () => {
    const fallback = () => window.print();
    if (!signupData) { fallback(); return; }
    setPreparingPrint(true);
    try {
      const filename = buildSignupSheetFilename(settings.school_name, settings.sport_name);
      const file = await renderSignupSheetImage(signupData, qrDataUrl, settings.primary_color, filename);
      await shareFileOrFallback(file, fallback);
    } catch {
      fallback();
    } finally {
      setPreparingPrint(false);
    }
  };

  const handleRegenerateClick = async () => {
    const ok = await generateOrRegenerate();
    if (ok) setConfirmRegenerate(false);
  };

  return (
    <Modal title="Team QR & Join Code" onClose={onClose}>
      {loading ? (
        <p style={{ fontSize: ".85rem", color: "#6b7280", textAlign: "center", margin: "1.5rem 0" }}>Loading…</p>
      ) : !joinCode ? (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <p style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: "1rem" }}>
            No join code yet for this team.
          </p>
          <button onClick={generateOrRegenerate} disabled={busy} style={primaryBtn}>
            {busy ? "Generating…" : "Generate Join Code"}
          </button>
          {error && <p style={errText}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".9rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>
              {[settings.school_name, settings.sport_name].filter(Boolean).join(" ")}
            </div>
            {settings.season && <div style={{ fontSize: ".78rem", color: "#6b7280" }}>{settings.season}</div>}
          </div>

          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- client-generated data: URI QR, next/image adds no value here
            <img src={qrDataUrl} alt="Scan to join" width={220} height={220} style={{ borderRadius: 12, border: "1px solid #e5e7eb" }} />
          )}

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Team Code
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: ".1em", color: "#0b1e3d" }}>
              {joinCode.code}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem", width: "100%" }}>
            <button onClick={() => copy(joinUrl, "link")} style={secondaryBtn}>
              {copied === "link" ? "Copied!" : "Copy Join Link"}
            </button>
            <button onClick={() => copy(joinCode.code, "code")} style={secondaryBtn}>
              {copied === "code" ? "Copied!" : "Copy Team Code"}
            </button>
            <button onClick={downloadQr} disabled={preparingDownload} style={secondaryBtn}>
              {preparingDownload ? "Preparing…" : "Download QR"}
            </button>
            <button onClick={printSignupSheet} disabled={preparingPrint} style={secondaryBtn}>
              {preparingPrint ? "Preparing…" : "Print Signup Sheet"}
            </button>
          </div>

          <div style={{ width: "100%", borderTop: "1px solid #f3f4f6", paddingTop: ".75rem" }}>
            {!confirmRegenerate ? (
              <button onClick={() => setConfirmRegenerate(true)} style={dangerLinkBtn}>
                Regenerate Team Code
              </button>
            ) : (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: ".75rem" }}>
                <p style={{ margin: "0 0 .6rem", fontSize: ".8rem", fontWeight: 700, color: "#7f1d1d" }}>
                  Regenerate team code?
                </p>
                <p style={{ margin: "0 0 .6rem", fontSize: ".78rem", color: "#7f1d1d", lineHeight: 1.5 }}>
                  This will immediately invalidate the current join code and any QR codes or printed handouts
                  using it. You&apos;ll need to share or print the new QR code.
                </p>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button onClick={() => setConfirmRegenerate(false)} style={secondaryBtn}>Cancel</button>
                  <button onClick={handleRegenerateClick} disabled={busy} style={{ ...primaryBtn, background: "#dc2626" }}>
                    {busy ? "Regenerating…" : "Regenerate Code"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p style={errText}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: ".6rem 1.2rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 9, fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: ".55rem .7rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 9, fontSize: ".8rem", fontWeight: 700, cursor: "pointer",
};

const dangerLinkBtn: React.CSSProperties = {
  border: "none", background: "none", padding: 0, fontSize: ".78rem", fontWeight: 700, color: "#dc2626", cursor: "pointer",
};

const errText: React.CSSProperties = {
  margin: ".5rem 0 0", fontSize: ".78rem", color: "#dc2626", textAlign: "center",
};
