"use client";

import { initials } from "./participantDisplay";

const PALETTE = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return PALETTE[hash % PALETTE.length];
}

// One shared avatar for every DM surface (thread list, thread header,
// message bubbles, compose recipient picker) — photo when the participant
// has one (athletes.profile_photo or elf_accounts.profile_photo_url,
// already resolved server-side, see lib/messages.ts), initials fallback
// otherwise. Decorative — name is always adjacent as text, so alt="" to
// avoid redundant screen-reader noise rather than describing the image.
export default function Avatar({
  name,
  photoUrl,
  size = 32,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  if (photoUrl) {
    // Avatars are small, user-uploaded, and already served from Supabase
    // storage; next/image's remote-pattern config isn't set up for that
    // host, and this list only ever renders a handful of avatars at once.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "50%",
        background: colorFor(name || "?"),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 700, color: "#fff",
        flexShrink: 0,
      }}
    >
      {initials(name) || "?"}
    </div>
  );
}
