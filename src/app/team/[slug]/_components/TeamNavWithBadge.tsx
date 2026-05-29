"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TeamNav from "./TeamNav";

export default function TeamNavWithBadge({
  slug,
  primaryColor,
  announcementCount,
  latestAnnouncementAt,
  donorCount,
}: {
  slug: string;
  primaryColor: string;
  announcementCount: number;
  latestAnnouncementAt: string | null;
  donorCount: number;
}) {
  const pathname = usePathname();
  const storageKey = `elf_home_read_${slug}`;

  // Start at 0 to match server render, compute after hydration
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    const lastRead = localStorage.getItem(storageKey);
    if (latestAnnouncementAt && (!lastRead || latestAnnouncementAt > lastRead)) {
      setBadge(announcementCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pathname === `/team/${slug}/home`) {
      localStorage.setItem(storageKey, new Date().toISOString());
      setBadge(0);
    }
  }, [pathname, slug, storageKey]);

  return (
    <TeamNav
      slug={slug}
      primaryColor={primaryColor}
      badgeCounts={{ home: badge, fundraiser: donorCount }}
    />
  );
}
