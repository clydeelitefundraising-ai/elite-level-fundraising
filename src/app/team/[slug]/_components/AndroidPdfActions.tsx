"use client";

import { useState, useSyncExternalStore } from "react";
import { androidErrorMessage, isAndroidNativeApp } from "@/lib/androidFileBridge";
import { openFileViaFetchOnAndroid } from "./fileDownload";

const subscribe = () => () => {};

/**
 * True only inside the installed Android app. The server snapshot is always
 * false, so the server HTML and the first client render match (no hydration
 * mismatch); the Android UI appears on the following client render.
 */
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(subscribe, isAndroidNativeApp, () => false);
}

/**
 * Android's WebView has no PDF renderer, so a PDF <iframe> is blank there.
 * This is the replacement: a clear action that hands the file to an installed
 * PDF app through the native bridge.
 */
export function OpenPdfButton({ url, fileName }: { url: string; fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setBusy(true);
    setError("");
    try {
      await openFileViaFetchOnAndroid(url, fileName);
    } catch (err) {
      setError(androidErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "1.25rem .5rem" }}>
      <p style={{ margin: "0 0 .9rem", color: "#6b7280", fontSize: ".85rem" }}>
        PDFs open in your PDF app on Android.
      </p>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        style={{
          padding: ".65rem 1.25rem", background: "var(--team-primary, #0b1e3d)", color: "#fff",
          border: "none", borderRadius: 10, fontSize: ".9rem", fontWeight: 700,
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Opening…" : "Open PDF"}
      </button>
      {error && (
        <p style={{ margin: ".75rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Message-attachment viewer: iframe on web/iOS (unchanged), Open PDF on Android. */
export function PdfViewerFallback({ apiHref, fileName }: { apiHref: string; fileName: string }) {
  const isAndroid = useIsAndroidApp();
  if (isAndroid) return <OpenPdfButton url={apiHref} fileName={fileName} />;
  return (
    <iframe
      src={apiHref}
      title={fileName}
      style={{ display: "block", width: "100%", height: "80vh", border: "none" }}
    />
  );
}
