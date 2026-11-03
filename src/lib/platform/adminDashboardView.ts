// Platform Admin dashboard — display model. Pure (no I/O), so every rule
// below is unit-tested: what each section shows, how a load failure differs
// from a genuine empty state, and which fields may reach the page at all.
// Moderation items carry reason, item type, team and age only — never the
// reporter, the report text or resolution notes. Activity carries the audit
// summary, a role-level actor and age — never an email address.

export const ATTENTION_ITEM_LIMIT = 3;
export const ACTIVITY_LIMIT = 6;

/** "loaded" with items, "empty" (genuinely nothing), "failed" (couldn't load). */
export type LoadState = "loaded" | "empty" | "failed";

export type AttentionLine = { text: string; meta: string };

export type AttentionGroup = {
  id: "moderation" | "inquiries" | "schools";
  label: string;
  href: string;
  state: LoadState;
  /** The number that needs attention, when known. */
  count: number | null;
  headline: string;
  lines: AttentionLine[];
};

export type ActivityItem = { id: string; text: string; actor: string; age: string };

export type ActivitySection = { state: LoadState; items: ActivityItem[] };

export type TeamContext = { school_name: string | null; sport_name: string | null; season: string | null };

const REASON_LABEL: Record<string, string> = {
  harassment: "Harassment",
  inappropriate_content: "Inappropriate content",
  spam: "Spam",
  safety_concern: "Safety concern",
  impersonation: "Impersonation",
  other: "Other",
};

const TARGET_LABEL: Record<string, string> = {
  announcement: "announcement",
  comment: "comment",
  message: "message",
  attachment: "attachment",
  user: "user",
};

export function relativeAge(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function teamLabel(slug: string, ctx: TeamContext | undefined): string {
  if (!ctx) return slug;
  const school = ctx.school_name?.trim();
  const sport = ctx.sport_name?.trim();
  if (school && sport) return `${school} ${sport}`;
  return school || sport || slug;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Count from the strict counter (null = failed) cross-checked with the list
 *  (whose reader returns [] on failure): a count above zero with no rows
 *  means the details failed, not that there is nothing. */
function stateFor(count: number | null, rows: number): LoadState {
  if (count === null) return "failed";
  if (count === 0) return "empty";
  return rows > 0 ? "loaded" : "failed";
}

type ReportLike = { id: string; campaign_slug: string; target_type: string; reason: string; status: string; created_at: string };

export function buildModerationGroup(
  openCount: number | null,
  reports: ReportLike[],
  teams: Record<string, TeamContext>,
  now: Date,
): AttentionGroup {
  const open = reports.filter(r => r.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const state = stateFor(openCount, open.length);
  return {
    id: "moderation",
    label: "Moderation",
    href: "/platform-admin/moderation",
    state,
    count: openCount,
    headline: state === "failed"
      ? (openCount ? `${plural(openCount, "open report", "open reports")} — details couldn't load` : "Couldn't load moderation reports")
      : state === "empty" ? "No open reports" : plural(openCount ?? open.length, "open report", "open reports"),
    lines: state === "loaded"
      ? open.slice(0, ATTENTION_ITEM_LIMIT).map(r => ({
          text: `${REASON_LABEL[r.reason] ?? "Report"} · ${TARGET_LABEL[r.target_type] ?? "item"}`,
          meta: `${teamLabel(r.campaign_slug, teams[r.campaign_slug])} · ${relativeAge(r.created_at, now)}`,
        }))
      : [],
  };
}

type InquiryLike = { id: string; campaign_slug: string; requested_by_role: string; status: string; created_at: string };

export function buildInquiryGroup(
  newCount: number | null,
  inquiries: InquiryLike[],
  teams: Record<string, TeamContext>,
  now: Date,
): AttentionGroup {
  const fresh = inquiries.filter(i => i.status === "new").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const state = stateFor(newCount, fresh.length);
  return {
    id: "inquiries",
    label: "Fundraising inquiries",
    href: "/platform-admin/fundraising-inquiries",
    state,
    count: newCount,
    headline: state === "failed"
      ? (newCount ? `${plural(newCount, "new inquiry", "new inquiries")} — details couldn't load` : "Couldn't load fundraising inquiries")
      : state === "empty" ? "No new inquiries" : plural(newCount ?? fresh.length, "new inquiry", "new inquiries"),
    lines: state === "loaded"
      ? fresh.slice(0, ATTENTION_ITEM_LIMIT).map(i => ({
          text: teamLabel(i.campaign_slug, teams[i.campaign_slug]),
          meta: `${i.requested_by_role === "assistant_coach" ? "Assistant coach" : "Head coach"} · ${relativeAge(i.created_at, now)}`,
        }))
      : [],
  };
}

/** seasons === null means the season list failed to load. */
export function buildSchoolsGroup(seasons: { organization_id: string | null }[] | null): AttentionGroup {
  if (seasons === null) {
    return { id: "schools", label: "Schools", href: "/platform-admin/school-links", state: "failed", count: null, headline: "Couldn't load school links", lines: [] };
  }
  const without = seasons.filter(s => !s.organization_id).length;
  return {
    id: "schools",
    label: "Schools",
    href: "/platform-admin/school-links",
    state: without > 0 ? "loaded" : "empty",
    count: without,
    headline: without > 0 ? `${plural(without, "team-season", "team-seasons")} without a school` : "Every team-season has a school",
    lines: [],
  };
}

/** Groups that need a look: anything failed or with work waiting. */
export function attentionToShow(groups: AttentionGroup[]): AttentionGroup[] {
  return groups.filter(g => g.state !== "empty");
}

type AuditLike = { id: string; action: string; summary?: string | null; actor_type?: string | null; created_at: string };

const ACTOR_LABEL: Record<string, string> = {
  platform_admin: "Platform Admin",
  coach: "Coach",
  admin_tool: "Admin tool",
  system: "System",
};

/** entries === null means the audit read failed. */
export function buildActivity(entries: AuditLike[] | null, now: Date): ActivitySection {
  if (entries === null) return { state: "failed", items: [] };
  if (entries.length === 0) return { state: "empty", items: [] };
  return {
    state: "loaded",
    items: entries.slice(0, ACTIVITY_LIMIT).map(e => ({
      id: e.id,
      text: (e.summary?.trim() || e.action).slice(0, 160),
      actor: ACTOR_LABEL[e.actor_type ?? ""] ?? "ELF",
      age: relativeAge(e.created_at, now),
    })),
  };
}
