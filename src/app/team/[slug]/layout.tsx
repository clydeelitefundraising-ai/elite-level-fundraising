import { notFound } from "next/navigation";
import { getCampaignSettings } from "@/lib/supabase";
import { getAnnouncementMeta } from "@/lib/teamData";
import TeamHeader from "./_components/TeamHeader";
import TeamNavWithBadge from "./_components/TeamNavWithBadge";

export const dynamic = "force-dynamic";

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [settings, announcementMeta] = await Promise.all([
    getCampaignSettings(slug),
    getAnnouncementMeta(slug),
  ]);
  if (!settings) notFound();

  return (
    <>
    <style>{`@media(min-width:431px){.elf-shell{padding:2rem 0}}`}</style>
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
        <TeamHeader settings={settings} />
        <main style={{
          flex: 1,
          padding: "1rem .875rem 5.5rem",
        }}>
          {children}
        </main>
        <TeamNavWithBadge
          slug={slug}
          primaryColor={settings.primary_color}
          announcementCount={announcementMeta.count}
          latestAnnouncementAt={announcementMeta.latestAt}
        />
      </div>
    </div>
    </>
  );
}
