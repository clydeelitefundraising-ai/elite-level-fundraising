"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TeamNav from "./TeamNav";

export default function TeamNavWithBadge({
  slug,
  primaryColor,
  showSponsors,
  announcementCount,
  latestAnnouncementAt,
  donorCount,
  pendingAthleteRequestCount = 0,
}: {
  slug: string;
  primaryColor: string;
  showSponsors: boolean;
  announcementCount: number;
  latestAnnouncementAt: string | null;
  donorCount: number;
  pendingAthleteRequestCount?: number;
}) {
  const pathname = usePathname();
  const storageKey = `elf_home_read_${slug}`;

  const [badge, setBadge] = useState(0);
  const [messageBadge, setMessageBadge] = useState(0);

  useEffect(() => {
    const lastRead = localStorage.getItem(storageKey);
    if (latestAnnouncementAt && (!lastRead || latestAnnouncementAt > lastRead)) {
      setBadge(announcementCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch message unread count client-side to keep layout SSR fast
  useEffect(() => {
    const load = () => {
      fetch(`/api/team/${slug}/messages/unread`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.count !== undefined) setMessageBadge(d.count); })
        .catch(() => {});
    };
    load();
    window.addEventListener("elf:messages-changed", load);
    return () => window.removeEventListener("elf:messages-changed", load);
  }, [slug]);

  useEffect(() => {
    if (pathname === `/team/${slug}/home`) {
      localStorage.setItem(storageKey, new Date().toISOString());
    }
    // Communications covers both former routes (Updates + Messages) — clear
    // the Team Updates badge just by visiting (that badge only ever meant
    // "there's something new to see on this tab", not "you've read it").
    // /files is still a valid deep link, cleared the same way it always was.
    if (pathname.startsWith(`/team/${slug}/communications`) || pathname.startsWith(`/team/${slug}/files`)) {
      setBadge(0);
    }
    // The DM unread badge is intentionally NOT cleared here. Merely opening
    // Communications (which defaults to the Team Updates segment, not
    // Direct Messages) must not make the unread-DM indicator disappear
    // before the user actually views the conversation — it only clears in
    // response to the elf:messages-changed event, dispatched by
    // ThreadView.tsx after it actually marks a thread's messages read.
  }, [pathname, slug, storageKey]);

  return (
    <TeamNav
      slug={slug}
      primaryColor={primaryColor}
      showSponsors={showSponsors}
      badgeCounts={{ communications: badge + messageBadge, fundraiser: donorCount, team: pendingAthleteRequestCount }}
    />
  );
}
