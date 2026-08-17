"use client";

import type { SignupSheetData } from "@/lib/teamJoinQr";

// Phase 5: dedicated print-only layout, designed for 8.5x11 paper —
// mirrors the Calendar Phase 4C print architecture (PrintMonthView.tsx):
// presentational only, all text comes from buildSignupSheetData() (the
// single source of truth also used by TeamQrModal's on-screen preview),
// no app chrome/nav/edit controls. Triggered via window.print() from the
// parent modal; visibility is controlled by the parent's
// @media print / @media screen CSS class pair, not by this component.
export default function PrintSignupSheet({
  data,
  qrDataUrl,
  primaryColor,
}: {
  data: SignupSheetData;
  qrDataUrl: string | null;
  primaryColor: string;
}) {
  return (
    <div style={{
      color: "#111", fontFamily: "Georgia, 'Times New Roman', serif",
      padding: "1in .75in", boxSizing: "border-box", minHeight: "10in",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: ".75rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#6b7280" }}>
        Elite Level Fundraising
      </div>
      <h1 style={{ margin: ".4rem 0 .1rem", fontSize: "1.6rem", fontWeight: 800, color: primaryColor || "#0b1e3d", textAlign: "center" }}>
        {data.heading}
      </h1>
      {data.seasonLine && (
        <div style={{ fontSize: "1rem", color: "#374151", marginBottom: "1.25rem" }}>{data.seasonLine}</div>
      )}

      {/* QR — visually dominant */}
      <div style={{
        margin: "1rem 0 1.25rem", padding: "1rem", border: `3px solid ${primaryColor || "#0b1e3d"}`,
        borderRadius: 12,
      }}>
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- print-only static data: URI, next/image adds no value here
          <img src={qrDataUrl} alt="Scan to join" width={280} height={280} style={{ display: "block" }} />
        )}
      </div>

      <div style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: ".2rem" }}>Or enter team code:</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: ".12em", color: primaryColor || "#0b1e3d", marginBottom: "1.5rem" }}>
        {data.code}
      </div>

      <ol style={{ fontSize: ".95rem", color: "#374151", lineHeight: 1.9, textAlign: "left", maxWidth: 380, margin: "0 0 1rem", paddingLeft: "1.3rem" }}>
        <li>Scan the QR code.</li>
        <li>Choose Athlete or Parent.</li>
        <li>Select your athlete/name from the roster.</li>
        <li>Complete your ELF account setup.</li>
      </ol>

      <p style={{ fontSize: ".8rem", color: "#6b7280", textAlign: "center", maxWidth: 380, margin: 0 }}>
        Don&apos;t see your name? Use &ldquo;I don&apos;t see my name&rdquo; and your Head Coach will review the request.
      </p>
    </div>
  );
}
