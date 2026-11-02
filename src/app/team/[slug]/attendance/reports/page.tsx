import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { canViewAttendance } from "@/lib/teamAttendance";
import { attendanceReportsQuery } from "./reportQuery";
import AttendanceReportsView from "./AttendanceReportsView";

export const dynamic = "force-dynamic";

// Attendance Reports — /team/[slug]/attendance/reports
// Team-wide attendance for the selected dates, from the existing
// attendance records. The same people as the attendance screen: Head
// Coach, Assistant Coach and platform admins of THIS team
// (canViewAttendance on the server-resolved actor). The report itself is
// loaded from /api/team/[slug]/attendance/report, which checks again.
// Readable in a completed season too (reports are history).
export default async function AttendanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") redirect(`/team/${slug}/home`);
  if (!canViewAttendance(actor)) return <CoachOnlyGate slug={slug} />;

  const settings = await getCampaignSettings(slug);
  if (!settings) notFound();

  const teamName = [settings.school_name, settings.sport_name].filter(Boolean).join(" ");
  return <AttendanceReportsView slug={slug} teamName={teamName} initial={attendanceReportsQuery(await searchParams)} />;
}

function CoachOnlyGate({ slug }: { slug: string }) {
  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
        textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{ marginBottom: ".65rem", opacity: .35, display: "flex", justifyContent: "center" }}><Lock size={32} strokeWidth={1.75} aria-hidden="true" /></div>
        <h1 style={{ margin: "0 0 .3rem", fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>
          Coach Access Only
        </h1>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#6b7280", lineHeight: 1.5 }}>
          Attendance reports are only available to this team&rsquo;s coaches.
        </p>
        <a
          href={`/team/${slug}/home`}
          style={{
            display: "inline-block", padding: ".55rem 1.25rem", background: "#0b1e3d",
            color: "#fff", borderRadius: 9, fontSize: ".875rem", fontWeight: 700, textDecoration: "none",
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
