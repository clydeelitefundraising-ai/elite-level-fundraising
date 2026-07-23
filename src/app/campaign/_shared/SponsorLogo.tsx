"use client";

import { useState } from "react";

// Renders the sponsor's logo image, falling back to the initial-letter
// badge if there's no logo_url OR the image URL fails to load (e.g. a
// deleted storage object) — never lets a broken-image icon show.
export default function SponsorLogo({ name, logoUrl }: { name: string; logoUrl: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="cl-sponsor-logo-img"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="cl-sponsor-logo-fallback">{name[0]?.toUpperCase() ?? "S"}</span>;
}
