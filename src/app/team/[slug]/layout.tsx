import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getAnnouncementMeta, getDonationStats } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import { getUnreadCount } from "@/lib/notifications";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
import { isPlatformAdmin } from "@/lib/permissions";
import TeamHeader from "./_components/TeamHeader";
import PlatformAdminBanner from "./_components/PlatformAdminBanner";
import TeamChrome from "./_components/TeamChrome";
import TeamPullRefresh from "./_components/TeamPullRefresh";
import TeamRealtimeSync from "./_components/TeamRealtimeSync";
import ServiceWorkerRegistrar from "./_components/ServiceWorkerRegistrar";
import NativePushRegistrar from "./_components/NativePushRegistrar";
import styles from "./_components/TeamShell.module.css";

export const dynamic = "force-dynamic";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [settings, announcementMeta, donationStats, actor, accountSession] = await Promise.all([
    getCampaignSettings(slug),
    getAnnouncementMeta(slug),
    getDonationStats(slug),
    getTeamActor(slug),
    getAccountSession(),
  ]);

  if (!settings) notFound();

  const isMember         = actor.kind === "member";
  const isAuthenticated  = actor.kind !== "public";
  const unreadNotifCount = isMember && settings.team_id
    ? await getUnreadCount(settings.team_id, {
        kind:       "member",
        id:         actor.session.id,
        role:       actor.session.role,
        athlete_id: actor.session.athlete_id,
      })
    : 0;

  const accountTeams = accountSession ? await getAccountTeams(accountSession.id) : [];

  // Head-Coach-only badge — matches AthleteRequestsPanel's own gating.
  // Assistant coaches and boosters never see this count, per Phase 1B.
  // Also gates the desktop sidebar's Requests item (Phase D1): isHeadCoach
  // already treats a platform admin as head-coach-equivalent, so no
  // separate platform-admin check is needed here — see permissions.ts.
  const showRequests = isHeadCoach(actor);
  const pendingAthleteRequestCount = showRequests ? await getPendingRequestCount(slug) : 0;

  return (
    <>
    <style>{`
      @media(min-width:431px){.elf-shell{padding:2rem 0}}
      @keyframes elf-fadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
      @keyframes elf-modalIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
      @keyframes elf-backdropIn{from{opacity:0}to{opacity:1}}
      @keyframes elf-spin{to{transform:rotate(360deg)}}
      @keyframes elf-shimmer{from{background-position:-400px 0}to{background-position:400px 0}}
      @keyframes elf-ptrPop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
    `}</style>
    <div className="elf-shell" style={{
      minHeight: "100vh",
      background: "#0b1e3d",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
    }}>
      <div className={styles.shellPanel} style={{
        minHeight: "100vh",
        background: "#f5f6f8",
      }}>
        {/* Phase D1: TeamChrome mounts BOTH the mobile bottom nav and the
            desktop sidebar internally (see TeamChrome.tsx) —
            TeamShell.module.css's min-width:1024px rule decides which is
            visible, so there is no client-side breakpoint detection and
            no hydration-dependent layout switch. Badge numbers are
            computed exactly once inside TeamChrome and shared by both
            shells, rather than each one polling independently. Rendered
            ONCE here — TeamNav's existing position:fixed bottom placement
            is unaffected by where in the DOM it's mounted, and
            DesktopSidebar needs to be the first flex item in this row so
            it lands on the left at desktop width. */}
        <TeamChrome
          slug={slug}
          settings={settings}
          showSponsors={isAuthenticated}
          showRequests={showRequests}
          announcementCount={announcementMeta.count}
          latestAnnouncementAt={announcementMeta.latestAt}
          donorCount={donationStats.donor_count}
          pendingAthleteRequestCount={pendingAthleteRequestCount}
          accountTeams={accountTeams}
          accountName={accountSession?.name}
          profilePhotoUrl={accountSession?.profile_photo_url}
          isAuthenticated={isAuthenticated}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div className={styles.mobileOnly}>
            <TeamHeader
              settings={settings}
              unreadNotifCount={unreadNotifCount}
              showBell={isMember}
              accountTeams={accountTeams}
              accountName={accountSession?.name}
              profilePhotoUrl={accountSession?.profile_photo_url}
              isAuthenticated={isAuthenticated}
            />
          </div>
          {isPlatformAdmin(actor) && (
            <PlatformAdminBanner teamLabel={`${settings.school_name} ${settings.sport_name}`.trim()} />
          )}
          <ServiceWorkerRegistrar />
          <NativePushRegistrar isAuthenticated={Boolean(accountSession)} />
          <TeamPullRefresh />
          <TeamRealtimeSync slug={slug} />
          <main className={styles.mainContent}>
            {children}
          </main>
        </div>
      </div>
    </div>
    </>
  );
}
