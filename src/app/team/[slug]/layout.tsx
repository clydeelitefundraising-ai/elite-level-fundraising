import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getAnnouncementMeta, getDonationStats } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import { getUnreadCount } from "@/lib/notifications";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
import TeamHeader from "./_components/TeamHeader";
import TeamNavWithBadge from "./_components/TeamNavWithBadge";
import TeamPullRefresh from "./_components/TeamPullRefresh";
import TeamRealtimeSync from "./_components/TeamRealtimeSync";
import ServiceWorkerRegistrar from "./_components/ServiceWorkerRegistrar";
import NativePushRegistrar from "./_components/NativePushRegistrar";

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
  const pendingAthleteRequestCount = isHeadCoach(actor) ? await getPendingRequestCount(slug) : 0;

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
      <div style={{
        width: "100%",
        maxWidth: 430,
        minHeight: "100vh",
        background: "#f5f6f8",
        boxShadow: "0 0 60px rgba(0,0,0,.45)",
        display: "flex",
        flexDirection: "column",
      }}>
        <TeamHeader
          settings={settings}
          unreadNotifCount={unreadNotifCount}
          showBell={isMember}
          accountTeams={accountTeams}
          accountName={accountSession?.name}
          profilePhotoUrl={accountSession?.profile_photo_url}
          isAuthenticated={isAuthenticated}
        />
        <ServiceWorkerRegistrar />
        <NativePushRegistrar isAuthenticated={Boolean(accountSession)} />
        <TeamPullRefresh />
        <TeamRealtimeSync slug={slug} />
        <main style={{ flex: 1, padding: "1rem .875rem 5.5rem" }}>
          {children}
        </main>
        <TeamNavWithBadge
          slug={slug}
          primaryColor={settings.primary_color}
          showSponsors={isAuthenticated}
          announcementCount={announcementMeta.count}
          latestAnnouncementAt={announcementMeta.latestAt}
          donorCount={donationStats.donor_count}
          pendingAthleteRequestCount={pendingAthleteRequestCount}
        />
      </div>
    </div>
    </>
  );
}
