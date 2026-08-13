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
    // both badge sources when the tab is visited. /messages/[threadId] is
    // still a valid deep link (unaffected by the merge), so it clears the
    // message badge the same way it always did.
    if (pathname.startsWith(`/team/${slug}/communications`) || pathname.startsWith(`/team/${slug}/files`)) {
      setBadge(0);
    }
    if (pathname.startsWith(`/team/${slug}/communications`) || pathname.startsWith(`/team/${slug}/messages`)) {
      // Refresh count after reading (the read API fires elf:messages-changed)
      setMessageBadge(0);
    }
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
