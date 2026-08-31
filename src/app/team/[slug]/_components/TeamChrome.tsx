"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamSummary } from "@/lib/accountSession";
import TeamNav from "./TeamNav";
import DesktopSidebar from "./DesktopSidebar";
import styles from "./TeamShell.module.css";

/** Phase D1: replaces the old direct <TeamNavWithBadge/> usage in
 *  layout.tsx. Both the mobile bottom nav and the desktop sidebar are
 *  always mounted (CSS decides which is visible — see
 *  TeamShell.module.css), so their unread-badge numbers are computed
 *  ONCE here and passed down as props to both, rather than each shell
 *  independently polling /messages/unread — that would double the
 *  request every time this layout renders, for no benefit. The
 *  announcement-badge/message-badge computation below is copied verbatim
 *  from the pre-D1 TeamNavWithBadge implementation (now removed as
 *  unused) — same numbers, same clearing behavior, same event listener;
 *  only WHERE it lives changed. */
export default function TeamChrome({
  slug,
  settings,
  showSponsors,
  showRequests,
  announcementCount,
  latestAnnouncementAt,
  pendingAthleteRequestCount = 0,
  accountTeams,
  accountName,
  profilePhotoUrl,
  isAuthenticated,
}: {
  slug: string;
  settings: CampaignSettings;
  showSponsors: boolean;
  showRequests: boolean;
  announcementCount: number;
  latestAnnouncementAt: string | null;
  pendingAthleteRequestCount?: number;
  accountTeams: TeamSummary[];
  accountName?: string;
  profilePhotoUrl?: string | null;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const storageKey = `elf_home_read_${slug}`;

  const [badge, setBadge] = useState(0);
  const [messageBadge, setMessageBadge] = useState(0);

  useEffect(() => {
    const lastRead = localStorage.getItem(storageKey);
    if (latestAnnouncementAt && (!lastRead || latestAnnouncementAt > lastRead)) {
      // localStorage is only reachable client-side (SSR-safety is why this
      // is an effect at all, not a useState lazy initializer) — syncing
      // React state from that external source on mount is exactly the
      // effect usage React's own docs carve out as valid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // Syncing badge state to the current route (an external signal —
      // navigation — not derived from props/state available at render
      // time) — same justification as the mount-time effect above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <>
      <div className={styles.mobileOnly}>
        <TeamNav
          slug={slug}
          primaryColor={settings.primary_color}
          showSponsors={showSponsors}
          // D2a: no fundraiser badge — see desktopNavItems.ts's comment on
          // why donationStats.donor_count was removed from this slot.
          badgeCounts={{ communications: badge + messageBadge, team: pendingAthleteRequestCount }}
        />
      </div>
      <div className={styles.desktopOnly}>
        <DesktopSidebar
          slug={slug}
          settings={settings}
          showSponsors={showSponsors}
          showRequests={showRequests}
          communicationsBadge={badge}
          messagesBadge={messageBadge}
          pendingRequestCount={pendingAthleteRequestCount}
          accountTeams={accountTeams}
          accountName={accountName}
          profilePhotoUrl={profilePhotoUrl}
          isAuthenticated={isAuthenticated}
        />
      </div>
    </>
  );
}
