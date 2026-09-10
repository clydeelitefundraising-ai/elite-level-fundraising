import { ImageResponse } from "next/og";

// Site-wide default share-link preview image — replaces the old
// public/ELF.LOGO.png (desert logo) reference in layout.tsx. Matches the
// CURRENT brand identity, which is a typographic wordmark (no logo image
// asset exists in the repo — confirmed: the redesigned marketing site
// renders "ELITE LEVEL FUNDRAISING" as styled text, not an image — see
// src/components/marketing/MarketingNav.tsx / marketing.css). Colors are
// the exact tokens the marketing site itself uses (marketing-tokens.css):
// --mk-ink (#0B1E3D, brand navy) and --mk-accent-ink (#7A5F22, brass),
// which the wordmark applies to "FUNDRAISING" via `.mk-nav-logo span`.
export const alt = "Elite Level Fundraising";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0B1E3D";
const ACCENT_INK = "#7A5F22";
const PAPER = "#F6F5F1";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ color: INK }}>ELITE LEVEL&nbsp;</span>
          <span style={{ color: ACCENT_INK }}>FUNDRAISING</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: INK,
            opacity: 0.7,
          }}
        >
          The operating system for athletic programs
        </div>
      </div>
    ),
    { ...size },
  );
}
