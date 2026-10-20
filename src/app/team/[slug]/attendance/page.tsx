import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { canViewAttendance, isIsoDate } from "@/lib/teamAttendance";
import AttendanceView from "./AttendanceView";

export const dynamic = "force-dynamic";

// Team Management Phase 5-4 — /team/[slug]/attendance[?date=YYYY-MM-DD]
// The coach attendance screen: Head Coach, Assistant Coach and platform
// admins of this team only (canViewAttendance, from the server-resolved
// actor). Everyone else gets no attendance data: signed-out visitors go
// to Home, other team members see a coach-only notice. The attendance
// itself is loaded by the screen from the Phase 5-3 API, which checks the
// same thing again on every request.
//
// No entry point links here yet (that is Phase 5-5).
export default async function AttendancePage({
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

  const { date } = await searchParams;
  // A valid date is only a starting point; the server decides whether it
  // is today, editable, read-only or in the future.
  const initialDate = typeof date === "string" && isIsoDate(date) ? date : null;
  const teamName = [settings.school_name, settings.sport_name].filter(Boolean).join(" ");

  return <AttendanceView slug={slug} teamName={teamName} initialDate={initialDate} />;
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
          Attendance is only available to this team&rsquo;s coaches.
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
