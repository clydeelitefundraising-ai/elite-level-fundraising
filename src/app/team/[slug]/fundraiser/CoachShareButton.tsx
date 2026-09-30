"use client";

import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { shareCoachFundraiser } from "./coachShare";

// Phase 3A-1 QA fix: "Share My Fundraiser" must be a genuine share action
// (native iOS/Android share sheet when available), not a bare navigation to
// the fundraiser URL — mirrors AthleteView.handleShare() in
// FundraiserView.tsx exactly (same navigator.share-with-clipboard-fallback
// pattern), just for the coach's own fundraiser link. Extracted into its
// own small Client Component so the rest of the coach Fundraiser page
// (page.tsx) can stay a Server Component — only this one interactive
// button needs client-side navigator APIs.
//
// Android note (tracked as future v3 work, not fixed here): the embedded
// Android WebView does not implement navigator.share/canShare (unlike iOS's
// WKWebView) — see nativeFileShare.ts's header comment for the same,
// already-documented limitation on the file-sharing path. On Android this
// falls through to the clipboard fallback below, same as the existing
// athlete share button already does today.
export default function CoachShareButton({
  shareUrl,
  shareTitle,
  shareText,
}: {
  shareUrl:   string;
  shareTitle: string;
  shareText:  string;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const outcome = await shareCoachFundraiser(navigator, { title: shareTitle, text: shareText, url: shareUrl });
    if (outcome === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      style={{
        display: "flex", alignItems: "center", gap: ".6rem", padding: ".75rem .9rem",
        background: "var(--surface-light-elevated)", borderRadius: 10, border: "1px solid var(--border-app)",
        width: "100%", boxSizing: "border-box", textAlign: "left", cursor: "pointer",
        font: "inherit", color: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-primary-app)", marginBottom: ".1rem" }}>
          {copied ? "Link Copied!" : "Share My Fundraiser"}
        </div>
        <div style={{ fontSize: ".68rem", color: "var(--text-muted-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shareUrl}
        </div>
      </div>
      {copied ? (
        <Check size={14} strokeWidth={2.5} style={{ color: "var(--color-success)", flexShrink: 0 }} />
      ) : (
        <ArrowUpRight size={14} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />
      )}
    </button>
  );
}
